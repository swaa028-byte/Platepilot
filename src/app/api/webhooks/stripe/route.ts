import { NextResponse } from "next/server";

/** Stripe endpoint intentionally fails closed until a per-merchant verified connection is configured. */
export async function POST() {
  return NextResponse.json({ error: "STRIPE_CONNECTION_NOT_CONFIGURED" }, { status: 503, headers: { "Cache-Control": "no-store" } });
}
