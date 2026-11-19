import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { staffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";
import { checkRateLimit } from "@/server/security/rate-limit";

/**
 * The kitchen board: live tickets grouped by the station they are prepared at.
 *
 * The board is read often during a shift, so it is only open to signed-in
 * staff of the tenant that owns the location.
 */
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const locationId = new URL(request.url).searchParams.get("locationId");
    if (!locationId || !z.string().uuid().safeParse(locationId).success) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("app_kitchen_board", {
      p_location_id: locationId,
      p_actor: user.id,
    });
    if (error) throw staffError(error);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

const bump = z.object({
  ticketItemId: z.string().uuid(),
  toStatus: z.enum(["holding", "preparing", "ready", "served"]),
});

/**
 * Moves one ticket line to its next state.
 *
 * Each line is bumped on its own, so a ticket can be served partly. Serving a
 * line is also what takes the recipe's ingredients out of stock.
 */
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`staff-kitchen:${user.id}`, 240, 60_000);
    const body = bump.parse(await request.json());
    const { data, error } = await supabase.rpc("app_bump_ticket_item", {
      p_ticket_item_id: body.ticketItemId,
      p_to_status: body.toStatus,
      p_actor: user.id,
    });
    if (error) throw staffError(error);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
