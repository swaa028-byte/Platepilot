import { NextResponse } from "next/server";
import { getDbClient } from "@/server/db/client";
import { cronWorkerId, drainOnce, secretsMatch } from "@/server/worker/drain";

/**
 * One drain pass, triggered on a schedule.
 *
 * The Netlify scheduled function calls this every ten minutes: it relays due
 * outbox events to registered webhooks and works the retry queue. Authentication
 * is a shared secret in the Authorization header because this endpoint exists
 * precisely so that unauthenticated machinery can do work; without the check it
 * would be a free amplification vector.
 */
export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET_NOT_CONFIGURED" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const authorization = request.headers.get("authorization") || "";
  const presented = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!presented || !secretsMatch(presented, expected)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const admin = await getDbClient();
    const result = await drainOnce(admin, cronWorkerId());
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("cron drain failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "DRAIN_FAILED" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
