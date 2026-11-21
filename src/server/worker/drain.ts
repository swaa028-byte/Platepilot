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
  smsEnqueued: number;
  jobsClaimed: number;
  jobsCompleted: number;
  jobsRetried: number;
  jobsDeadLettered: number;
};

const DELIVERY_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 8;

/** SMS alerts ride on Twilio when the deployment has credentials. Without them
 *  nothing is enqueued: a queue full of unsendable messages is not a feature. */
export function smsConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
}

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
    deliveriesFailed: 0, smsEnqueued: 0, jobsClaimed: 0, jobsCompleted: 0, jobsRetried: 0, jobsDeadLettered: 0,
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
      const outcome = await deliver({
        eventId: event.event_id, webhookId: hook.webhook_id, url: hook.webhook_url, secret: hook.webhook_secret,
        eventType: event.event_type, payload: event.payload, createdAt: event.event_created_at,
        organizationId: event.organization_id,
      });
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
    await maybeEnqueueSms(admin, event, result);
    const { data: marked } = await admin.rpc("app_outbox_mark_dispatched", { p_event_id: event.event_id });
    if (marked === true) result.eventsDispatched += 1;
  }
}

type DeliveryTarget = {
  eventId: string; webhookId: string; url: string; secret: string;
  eventType: string; payload: unknown; createdAt: string; organizationId: string;
};

type DeliveryOutcome = { ok: boolean; statusCode: number | null; errorText: string | null };

/** A paid order can alert the location's staff phone, when the merchant asked
 *  for it and the deployment can actually send. The message states what the
 *  kitchen needs: that money arrived, and for how much. */
async function maybeEnqueueSms(admin: DbClient, event: DueEvent, result: DrainResult): Promise<void> {
  if (event.event_type !== "order.paid" || !smsConfigured()) return;
  const orderId = (event.payload as { orderId?: string } | null)?.orderId;
  if (!orderId) return;
  const { data: order, error: orderError } = await admin.from("orders")
    .select("location_id,total_minor,currency").eq("id", orderId).maybeSingle();
  if (orderError || !order) {
    console.error("drain: sms source order missing", { orderId, error: orderError?.message });
    return;
  }
  const source = order as { location_id: string; total_minor: string | number; currency: string };
  const { data: location, error: locationError } = await admin.from("locations")
    .select("name,service_settings").eq("id", source.location_id).maybeSingle();
  if (locationError || !location) return;
  const settings = (location as { name: string; service_settings: { sms?: { enabled?: boolean; phone?: string } } | null }).service_settings;
  const sms = settings?.sms;
  if (!sms?.enabled || !sms.phone) return;
  const major = (Number(source.total_minor ?? 0) / 100).toFixed(2);
  const body = `${location.name}: paid order ${String(orderId).slice(0, 8)} — ${major} ${source.currency}`;
  const { error: insertError } = await admin.from("jobs").insert({ kind: "sms.send", payload: { to: sms.phone, body, orderId } });
  if (insertError) {
    console.error("drain: sms job enqueue failed", insertError.code, insertError.message);
    return;
  }
  result.smsEnqueued += 1;
}

async function sendSms(to: string, body: string): Promise<DeliveryOutcome> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const authHeader = "Basic " + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { authorization: authHeader, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM_NUMBER!, Body: body }).toString(),
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    if (response.ok) return { ok: true, statusCode: response.status, errorText: null };
    return { ok: false, statusCode: response.status, errorText: `TWILIO_HTTP_${response.status}` };
  } catch (error) {
    return { ok: false, statusCode: null, errorText: error instanceof Error ? error.message : "SMS_ERROR" };
  }
}

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

type ClaimedJob = { id: string; kind: string; status: string; attempts: number; payload: { eventId?: string; webhookId?: string; to?: string; body?: string } };

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
    if (job.kind === "sms.send") {
      const to = job.payload?.to ?? "";
      const text = job.payload?.body ?? "";
      if (!to || !text) {
        await admin.from("jobs").update({ status: "dead_letter", lease_until: null, last_error: "SMS_PAYLOAD_INVALID" }).eq("id", job.id).eq("leased_by", workerId);
        result.jobsDeadLettered += 1;
        continue;
      }
      const outcome = await sendSms(to, text);
      if (outcome.ok) {
        await admin.from("jobs").update({ status: "completed", lease_until: null, last_error: null }).eq("id", job.id).eq("leased_by", workerId);
        result.jobsCompleted += 1;
      } else {
        console.error("drain: sms send failed", { jobId: job.id, status: outcome.statusCode, error: outcome.errorText });
        const retryAt = new Date(Date.now() + Math.min(300_000, 1000 * 2 ** job.attempts));
        await admin.from("jobs").update({ status: "queued", available_at: retryAt.toISOString(), lease_until: null, last_error: outcome.errorText }).eq("id", job.id).eq("leased_by", workerId);
        result.jobsRetried += 1;
      }
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
