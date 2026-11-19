import { getDbClient, getDatabaseMode } from "../src/server/db/client";
import { randomUUID } from "node:crypto";

const workerId = `worker-${randomUUID()}`;
const pollMs = Math.max(250, Number(process.env.WORKER_POLL_MS || 1000));
const batchSize = Math.max(1, Math.min(50, Number(process.env.WORKER_BATCH_SIZE || 10)));
let stopped = false;
process.on("SIGTERM", () => { stopped = true; });
process.on("SIGINT", () => { stopped = true; });

async function run() {
  const mode = getDatabaseMode();
  if (mode === "local") {
    // PlatePilot's local database is an embedded PostgreSQL that allows a single
    // writer, so the web process already runs the job loop in-process. Fitting a
    // second writer to the same directory would corrupt it.
    console.log(`PlatePilot worker ${workerId}: local mode runs jobs inside the web process (${getDatabaseMode()}). Nothing to do here.`);
    return;
  }

  const admin = await getDbClient();
  console.log(`PlatePilot worker ${workerId} started; unsupported jobs retry then dead-letter.`);
  while (!stopped) {
    const { data: jobs, error } = await admin.rpc("app_claim_jobs", { p_worker: workerId, p_batch: batchSize });
    if (error) {
      console.error("Job claim failed; retrying after the poll interval.", error.code, error.message);
    } else {
      for (const job of jobs ?? []) {
        if (job.status === "dead_letter") {
          console.error("Job moved to dead letter", { id: job.id, kind: job.kind, attempts: job.attempts });
          continue;
        }
        // No external side effect is faked. A new handler must be registered and provider-tested
        // before its job kind is enabled. Unknown kinds receive bounded retries via the DB lease.
        const retryAt = new Date(Date.now() + Math.min(300_000, 1000 * 2 ** job.attempts));
        await admin.from("jobs").update({ status: "queued", available_at: retryAt.toISOString(), lease_until: null, last_error: "NO_VERIFIED_HANDLER" }).eq("id", job.id).eq("leased_by", workerId);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

run().catch((error) => {
  console.error("Worker stopped", error instanceof Error ? error.message : "UNKNOWN_ERROR");
  process.exitCode = 1;
});
