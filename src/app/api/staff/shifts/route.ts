import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { mapStaffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";

const openInput = z.object({
  locationId: z.string().uuid(),
  openingMinor: z.string().regex(/^[0-9]+$/, "openingMinor must be an integer string"),
});

const closeInput = z.object({
  shiftId: z.string().uuid(),
  countedMinor: z.string().regex(/^[0-9]+$/, "countedMinor must be an integer string"),
});

/** Opens a cash shift with the counted opening float. */
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const body = openInput.parse(await request.json());
    const { data, error } = await supabase.rpc("app_open_shift", {
      p_location_id: body.locationId,
      p_opening_minor: body.openingMinor,
      p_actor: user.id,
    });
    if (error) throw new Error(mapStaffError(error.message));
    return NextResponse.json({ shiftId: data }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

/** Closes a cash shift and reports the expected total and the variance. */
export async function PUT(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const body = closeInput.parse(await request.json());
    const { data, error } = await supabase.rpc("app_close_shift", {
      p_shift_id: body.shiftId,
      p_counted_minor: body.countedMinor,
      p_actor: user.id,
    });
    if (error) throw new Error(mapStaffError(error.message));
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
