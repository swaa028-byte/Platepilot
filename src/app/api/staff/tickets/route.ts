import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { mapStaffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";

const input = z.object({
  ticketId: z.string().uuid(),
  toStatus: z.enum(["preparing", "ready", "served", "recalled"]),
});

/**
 * Moves a kitchen ticket to its next state. The server owns the transition
 * rules, so a client cannot put a ticket into an impossible state.
 */
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const body = input.parse(await request.json());
    const { data, error } = await supabase.rpc("app_transition_ticket", {
      p_ticket_id: body.ticketId,
      p_to_status: body.toStatus,
      p_actor: user.id,
    });
    if (error) throw new Error(mapStaffError(error.message));
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
