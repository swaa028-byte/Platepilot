import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { staffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";
import { checkRateLimit } from "@/server/security/rate-limit";

const items = z.array(z.object({
  menuItemId: z.string().uuid(),
  quantity: z.number().int().min(1).max(100),
  allergyNote: z.string().trim().max(200).nullable().default(null),
  kitchenNote: z.string().trim().max(200).nullable().default(null),
})).min(1).max(100);

/**
 * Adds items to an open tab. The server re-prices everything from the
 * published price book.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`staff-tab:${user.id}`, 60, 60_000);
    const orderId = (await params).orderId;
    if (!z.string().uuid().safeParse(orderId).success) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }
    const body = items.parse(await request.json());
    const { data, error } = await supabase.rpc("app_add_order_items", {
      p_actor: user.id,
      p_order_id: orderId,
      p_items: body,
    });
    if (error) throw staffError(error);
    return NextResponse.json(data, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
