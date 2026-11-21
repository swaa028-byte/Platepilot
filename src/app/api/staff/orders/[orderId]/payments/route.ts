import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { staffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";
import { checkRateLimit } from "@/server/security/rate-limit";

const input = z.object({
  amountMinor: z.string().regex(/^[0-9]+$/),
  tender: z.enum(["cash", "counter", "external_terminal"]),
  // The client's id for this payment; the same id twice is refused, so a
  // retried request never takes the money twice.
  eventId: z.string().trim().min(8).max(80).nullable().default(null),
});

/**
 * Records one payment against an open bill. Part payments are the split bill;
 * the payment that covers the total closes it.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`staff-pay:${user.id}`, 60, 60_000);
    const orderId = (await params).orderId;
    if (!z.string().uuid().safeParse(orderId).success) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }
    const body = input.parse(await request.json());
    const { data, error } = await supabase.rpc("app_record_order_payment", {
      p_actor: user.id,
      p_order_id: orderId,
      p_amount_minor: body.amountMinor,
      p_tender: body.tender,
      p_event_id: body.eventId,
    });
    if (error) throw staffError(error);
    return NextResponse.json(data, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
