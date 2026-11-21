import { getDbClient, getDatabaseMode } from "../src/server/db/client";
import { drainOnce, cronWorkerId } from "../src/server/worker/drain";
import { randomUUID } from "node:crypto";

const workerId = `worker-${randomUUID()}`;
const pollMs = Math.max(250, Number(process.env.WORKER_POLL_MS || 1000));
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
  console.log(`PlatePilot worker ${workerId} started: relaying the outbox to webhooks and draining queued jobs.`);
  while (!stopped) {
    try {
      const result = await drainOnce(admin, cronWorkerId());
      if (result.eventsExamined > 0 || result.jobsClaimed > 0) {
        console.log("drain pass", result);
      }
    } catch (error) {
      console.error("Drain pass failed; retrying after the poll interval.", error instanceof Error ? error.message : error);
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

run().catch((error) => {
  console.error("Worker stopped", error instanceof Error ? error.message : "UNKNOWN_ERROR");
  process.exitCode = 1;
});
