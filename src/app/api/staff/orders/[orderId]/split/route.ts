import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { staffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";
import { checkRateLimit } from "@/server/security/rate-limit";

const input = z.object({
  orderItemIds: z.array(z.string().uuid()).min(1).max(100),
});

/**
 * Splits chosen items of an open order onto a new order, so each party pays
 * their own. Prices and the kitchen ticket follow the food.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`staff-split:${user.id}`, 30, 60_000);
    const orderId = (await params).orderId;
    if (!z.string().uuid().safeParse(orderId).success) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }
    const body = input.parse(await request.json());
    const { data, error } = await supabase.rpc("app_split_order", {
      p_actor: user.id,
      p_order_id: orderId,
      p_order_item_ids: body.orderItemIds,
    });
    if (error) throw staffError(error);
    return NextResponse.json(data, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
