import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { DbClient } from "@/server/db/client";

/**
 * One pass of the background drain.
 *
 * PlatePilot's business functions write events into outbox_events (order.created,
 * order.paid, payment.review_required, menu.published) inside the same
 * transaction as the change itself, and heavier work is queued in jobs. Neither
 * used to be consumed: outbox rows accumulated with dispatched_at unset forever,
 * and the worker could only stamp jobs NO_VERIFIED_HANDLER because no handler
 * existed.
 *
 * This pass closes that loop:
 *
 *   1. Relay - every due event is delivered to each active outbox webhook for
 *      its organization, signed with that webhook's secret. An event with no
 *      subscriber is marked dispatched (journaled, nothing to deliver). A failed
 *      first attempt schedules a 'webhook.deliver' job through the lease.
 *   2. Jobs - claimed webhook.redeliver work is attempted again with backoff
 *      until it succeeds or exhausts its attempts and dead-letters.
 *
 * The long-lived worker calls this in a loop; the hosted deployment calls it
 * from /api/cron/drain on a schedule. Both paths share this module so behavior
 * cannot drift between them.
 */

export type DrainResult = {
  eventsExamined: number;
  eventsDispatched: number;
  deliveriesAttempted: number;
  deliveriesSucceeded: number;
  deliveriesFailed: number;
  jobsClaimed: number;
  jobsCompleted: number;
  jobsRetried: number;
  jobsDeadLettered: number;
};

const DELIVERY_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 8;

export function cronWorkerId(): string {
  return `drain-${randomUUID()}`;
}

/** Constant-time comparison so the cron endpoint does not leak the secret by timing. */
export function secretsMatch(presented: string, expected: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function drainOnce(admin: DbClient, workerId: string): Promise<DrainResult> {
  const result: DrainResult = {
    eventsExamined: 0, eventsDispatched: 0, deliveriesAttempted: 0, deliveriesSucceeded: 0,
    deliveriesFailed: 0, jobsClaimed: 0, jobsCompleted: 0, jobsRetried: 0, jobsDeadLettered: 0,
  };

  await relayOutbox(admin, result);
  await processJobs(admin, workerId, result);
  return result;
}

type DueEvent = { event_id: string; organization_id: string; event_type: string; payload: unknown; event_created_at: string };
type WebhookRow = { webhook_id: string; webhook_url: string; webhook_secret: string; delivery_id: string | null; delivery_status: string | null };

async function relayOutbox(admin: DbClient, result: DrainResult): Promise<void> {
  const { data: events, error } = await admin.rpc("app_outbox_due_events", { p_limit: 100 });
  if (error) {
    console.error("drain: outbox relay read failed", error.code, error.message);
    return;
  }
  for (const event of (events ?? []) as DueEvent[]) {
    result.eventsExamined += 1;
    const { data: webhooks, error: hookError } = await admin.rpc("app_outbox_webhooks_for_event", { p_event_id: event.event_id });
    if (hookError) {
      console.error("drain: webhook read failed", hookError.code, hookError.message);
      continue;
    }
    const hooks = (webhooks ?? []) as WebhookRow[];
    if (hooks.length === 0) {
      // No subscriber: the event is journaled and nothing will ever consume it.
      await admin.rpc("app_outbox_mark_dispatched", { p_event_id: event.event_id });
      result.eventsDispatched += 1;
      continue;
    }
    for (const hook of hooks) {
      // 'pending' belongs to a scheduled retry job; 'delivered'/'failed' are settled.
      if (hook.delivery_status !== null) continue;
      const outcome = await deliver(target);
      await admin.rpc("app_outbox_delivery_upsert", {
        p_event_id: event.event_id, p_webhook_id: hook.webhook_id,
        p_ok: outcome.ok, p_status_code: outcome.statusCode, p_error: outcome.errorText,
      });
      if (!outcome.ok) {
        result.deliveriesFailed += 1;
        await admin.rpc("app_outbox_enqueue_retry", { p_event_id: event.event_id, p_webhook_id: hook.webhook_id });
      } else {
        result.deliveriesSucceeded += 1;
      }
      result.deliveriesAttempted += 1;
    }
    const { data: marked } = await admin.rpc("app_outbox_mark_dispatched", { p_event_id: event.event_id });
    if (marked === true) result.eventsDispatched += 1;
  }
}

type DeliveryTarget = {
  eventId: string; webhookId: string; url: string; secret: string;
  eventType: string; payload: unknown; createdAt: string; organizationId: string;
};

type DeliveryOutcome = { ok: boolean; statusCode: number | null; errorText: string | null };

/** Performs the HTTP delivery and signs the body. Writes nothing: callers record
 *  the outcome through the appropriate RPC, so attempts are never counted twice. */
async function deliver(target: DeliveryTarget): Promise<DeliveryOutcome> {
  const body = JSON.stringify({
    id: target.eventId, type: target.eventType, organizationId: target.organizationId,
    payload: target.payload, createdAt: target.createdAt,
  });
  const signature = "sha256=" + createHmac("sha256", target.secret).update(body).digest("hex");
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
    const response = await fetch(target.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PlatePilot-Event-Type": target.eventType,
        "X-PlatePilot-Event-Id": target.eventId,
        "X-PlatePilot-Signature": signature,
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (response.ok) return { ok: true, statusCode: response.status, errorText: null };
    return { ok: false, statusCode: response.status, errorText: `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, statusCode: null, errorText: error instanceof Error ? error.message : "DELIVERY_ERROR" };
  }
}

type ClaimedJob = { id: string; kind: string; status: string; attempts: number; payload: { eventId?: string; webhookId?: string } };

async function processJobs(admin: DbClient, workerId: string, result: DrainResult): Promise<void> {
  const { data: jobs, error } = await admin.rpc("app_claim_jobs", { p_worker: workerId, p_batch: 10 });
  if (error) {
    console.error("drain: job claim failed", error.code, error.message);
    return;
  }
  for (const job of (jobs ?? []) as ClaimedJob[]) {
    result.jobsClaimed += 1;
    if (job.status === "dead_letter") {
      console.error("drain: job dead-lettered", { id: job.id, kind: job.kind, attempts: job.attempts });
      result.jobsDeadLettered += 1;
      continue;
    }
    if (job.kind !== "webhook.deliver") {
      // Unknown kinds get bounded retries through the lease; a new handler must
      // be registered and provider-tested before its kind is enabled.
      const retryAt = new Date(Date.now() + Math.min(300_000, 1000 * 2 ** job.attempts));
      await admin.from("jobs").update({ status: "queued", available_at: retryAt.toISOString(), lease_until: null, last_error: "NO_VERIFIED_HANDLER" }).eq("id", job.id).eq("leased_by", workerId);
      result.jobsRetried += 1;
      continue;
    }
    const { data: info, error: infoError } = await admin.rpc("app_webhook_delivery_for_job", {
      p_event_id: job.payload?.eventId, p_webhook_id: job.payload?.webhookId,
    });
    if (infoError || !info) {
      console.error("drain: retry target missing", { jobId: job.id, error: infoError?.message });
      await admin.from("jobs").update({ status: "dead_letter", lease_until: null, last_error: "DELIVERY_ROW_MISSING" }).eq("id", job.id).eq("leased_by", workerId);
      result.jobsDeadLettered += 1;
      continue;
    }
    const target = info as unknown as {
      deliveryId: string; url: string; secret: string; active: boolean;
      eventType: string; payload: unknown; eventCreatedAt: string; organizationId: string;
    };
    if (!target.active) {
      await admin.from("jobs").update({ status: "completed", lease_until: null, last_error: "WEBHOOK_DEACTIVATED" }).eq("id", job.id).eq("leased_by", workerId);
      result.jobsCompleted += 1;
      continue;
    }
    const outcome = await deliver({
      eventId: job.payload!.eventId!, webhookId: job.payload!.webhookId!, url: target.url, secret: target.secret,
      eventType: target.eventType, payload: target.payload, createdAt: target.eventCreatedAt, organizationId: target.organizationId,
    });
    result.deliveriesAttempted += 1;
    if (outcome.ok) result.deliveriesSucceeded += 1; else result.deliveriesFailed += 1;
    const { data: outcomeState } = await admin.rpc("app_webhook_delivery_result", {
      p_delivery_id: target.deliveryId, p_ok: outcome.ok, p_status_code: outcome.statusCode, p_error: outcome.errorText, p_max_attempts: MAX_ATTEMPTS,
    });
    if (outcomeState === "delivered") {
      await admin.from("jobs").update({ status: "completed", lease_until: null, last_error: null }).eq("id", job.id).eq("leased_by", workerId);
      result.jobsCompleted += 1;
    } else if (outcomeState === "failed") {
      await admin.from("jobs").update({ status: "dead_letter", lease_until: null, last_error: "RETRIES_EXHAUSTED" }).eq("id", job.id).eq("leased_by", workerId);
      result.jobsDeadLettered += 1;
    } else {
      const retryAt = new Date(Date.now() + Math.min(300_000, 1000 * 2 ** job.attempts));
      await admin.from("jobs").update({ status: "queued", available_at: retryAt.toISOString(), lease_until: null, last_error: "RETRY_SCHEDULED" }).eq("id", job.id).eq("leased_by", workerId);
      result.jobsRetried += 1;
    }
  }
}
