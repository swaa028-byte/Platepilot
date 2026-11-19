import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { mapStaffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";

const input = z.object({
  locationId: z.string().uuid(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  partySize: z.number().int().min(1).max(100),
  customerName: z.string().trim().min(1).max(120),
  customerEmail: z.string().email().max(320).nullable().default(null),
  tableId: z.string().uuid().nullable().default(null),
});

/**
 * Books a table. Room capacity and table conflicts are checked on the server
 * inside the booking transaction, so two concurrent requests cannot overbook.
 */
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const body = input.parse(await request.json());
    const { data, error } = await supabase.rpc("app_create_reservation", {
      p_location_id: body.locationId,
      p_starts_at: body.startsAt,
      p_ends_at: body.endsAt,
      p_party_size: body.partySize,
      p_customer_name: body.customerName,
      p_customer_email: body.customerEmail,
      p_actor: user.id,
      p_table_id: body.tableId,
    });
    if (error) throw new Error(mapStaffError(error.message));
    return NextResponse.json(data, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
