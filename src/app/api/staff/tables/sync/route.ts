import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { staffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";
import { checkRateLimit } from "@/server/security/rate-limit";

const input = z.object({ locationId: z.string().uuid() });

/**
 * Makes the drawn floor plan bookable: every table on the plan becomes a table
 * a host can seat, and a table taken off the plan stops being offered.
 */
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`staff-tables-sync:${user.id}`, 30, 60_000);
    const body = input.parse(await request.json());

    const { data, error } = await supabase.rpc("app_sync_tables_from_floor", {
      p_location_id: body.locationId,
      p_actor: user.id,
    });
    if (error) throw staffError(error);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
