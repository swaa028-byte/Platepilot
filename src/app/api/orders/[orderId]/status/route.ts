import { NextResponse } from "next/server";
import { z } from "zod";
import { getDbClient } from "@/server/db/client";
import { apiError } from "@/server/security/http";
import { checkRateLimit } from "@/server/security/rate-limit";

const input = z.object({ t: z.string().min(32).max(128) });

/**
 * Public order status for the customer who placed it. The tracking token is
 * the capability: without the exact token the order id alone returns nothing.
 */
export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    checkRateLimit(`order-status:${request.headers.get("x-forwarded-for") || "local"}`, 60, 60_000);
    const { orderId } = await params;
    if (!z.string().uuid().safeParse(orderId).success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    const token = input.parse({ t: new URL(request.url).searchParams.get("t") ?? "" }).t;
    const admin = await getDbClient();
    const { data, error } = await admin.rpc("app_public_order_status", { p_order_id: orderId, p_tracking_token: token });
    if (error) {
      if (error.message === "ORDER_NOT_FOUND" || error.message === "INVALID_REQUEST") return NextResponse.json({ error: "ORDER_NOT_FOUND" }, { status: 404 });
      throw error;
    }
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
