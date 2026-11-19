import "server-only";
import { getDbClient } from "@/server/db/client";

/**
 * In-process job runner for the local, single-writer database.
 *
 * PlatePilot's embedded PostgreSQL allows exactly one writer, so the job loop
 * runs inside the web process rather than in the standalone worker. The
 * behaviour matches the standalone worker: a job kind without a registered,
 * provider-tested handler is retried with the database's lease and eventually
 * dead-letters. No external side effect is ever faked.
 */

let started = false;
let timer: NodeJS.Timeout | null = null;

const POLL_MS = Math.max(500, Number(process.env.WORKER_POLL_MS || 2000));
const BATCH = Math.max(1, Math.min(50, Number(process.env.WORKER_BATCH_SIZE || 10)));
const WORKER_ID = `local-worker-${process.pid}`;

async function tick() {
  try {
    const db = await getDbClient();
    const { data: jobs, error } = await db.rpc("app_claim_jobs", { p_worker: WORKER_ID, p_batch: BATCH });
    if (error || !jobs) return;
    for (const job of jobs as { id: string; kind: string; status: string; attempts: number }[]) {
      if (job.status === "dead_letter") {
        console.error("Job moved to dead letter", { id: job.id, kind: job.kind, attempts: job.attempts });
        continue;
      }
      const retryAt = new Date(Date.now() + Math.min(300_000, 1000 * 2 ** job.attempts));
      await db.from("jobs")
        .update({ status: "queued", available_at: retryAt.toISOString(), lease_until: null, last_error: "NO_VERIFIED_HANDLER" })
        .eq("id", job.id)
        .eq("leased_by", WORKER_ID);
    }
  } catch {
    // The database may still be starting. The next tick tries again.
  }
}

/** Starts the runner once per process. Safe to call from any request. */
export function startLocalJobRunner() {
  if (started) return;
  started = true;
  timer = setInterval(() => { void tick(); }, POLL_MS);
  timer.unref?.();
}
