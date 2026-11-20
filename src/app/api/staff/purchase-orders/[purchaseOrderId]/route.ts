import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { staffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";
import { checkRateLimit } from "@/server/security/rate-limit";

const id = z.string().uuid();

/**
 * Receives a purchase order and brings its stock in.
 *
 * Receiving is idempotent: the same order cannot be received twice, so a
 * retried request cannot inflate the stock figure.
 */
export async function POST(_request: Request, context: { params: Promise<{ purchaseOrderId: string }> }) {
  try {
    const { purchaseOrderId } = await context.params;
    if (!id.safeParse(purchaseOrderId).success) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }

    const { supabase, user } = await requireUser();
    checkRateLimit(`staff-purchase-orders-receive:${user.id}`, 60, 60_000);
    const { data, error } = await supabase.rpc("app_receive_purchase_order", {
      p_purchase_order_id: purchaseOrderId,
      p_actor: user.id,
    });
    if (error) throw staffError(error);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

/** Cancels an order that has not been received. */
export async function DELETE(_request: Request, context: { params: Promise<{ purchaseOrderId: string }> }) {
  try {
    const { purchaseOrderId } = await context.params;
    if (!id.safeParse(purchaseOrderId).success) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }

    const { supabase, user } = await requireUser();
    checkRateLimit(`staff-purchase-orders-cancel:${user.id}`, 60, 60_000);
    const { data, error } = await supabase.rpc("app_cancel_purchase_order", {
      p_purchase_order_id: purchaseOrderId,
      p_actor: user.id,
    });
    if (error) throw staffError(error);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
