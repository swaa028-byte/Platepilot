import { NextResponse } from "next/server";

/** PayPal endpoint intentionally fails closed until a per-merchant verified connection is configured. */
export async function POST() {
  return NextResponse.json({ error: "PAYPAL_CONNECTION_NOT_CONFIGURED" }, { status: 503, headers: { "Cache-Control": "no-store" } });
}
