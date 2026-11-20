import { NextResponse } from "next/server";
import { z } from "zod";
import { floorDraftSchema, assertTablesInsideRoom } from "@/domain/floor";
import { requireUser } from "@/server/auth/server";
import { staffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";

const input = z.object({ organizationId: z.string().uuid(), locationId: z.string().uuid(), expectedVersion: z.number().int().positive(), draft: floorDraftSchema });

/**
 * The drawn room, so the planner reopens on the plan that was saved.
 */
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const locationId = new URL(request.url).searchParams.get("locationId");
    if (!locationId || !z.string().uuid().safeParse(locationId).success) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("app_floor_plan", { p_location_id: locationId, p_actor: user.id });
    if (error) throw staffError(error);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

export async function PUT(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const body = input.parse(await request.json());
    assertTablesInsideRoom(body.draft);
    const { data, error } = await supabase.rpc("app_save_floor", { p_organization_id: body.organizationId, p_location_id: body.locationId, p_expected_version: body.expectedVersion, p_draft: body.draft, p_actor: user.id });
    if (error) throw new Error("FLOOR_SAVE_CONFLICT_OR_FORBIDDEN");
    return NextResponse.json({ version: data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
