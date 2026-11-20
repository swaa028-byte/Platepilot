import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { staffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";

const id = z.string().uuid();

/**
 * One order as a receipt: the lines, the discount, the tax rate that was applied
 * with the exact tax amount, the fee and tip, and how it was tendered.
 */
export async function GET(_request: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await context.params;
    if (!id.safeParse(orderId).success) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }

    const { supabase, user } = await requireUser();
    const { data, error } = await supabase.rpc("app_order_receipt", {
      p_order_id: orderId,
      p_actor: user.id,
    });
    if (error) throw staffError(error);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
