import { NextResponse } from "next/server";
import { z } from "zod";
import { floorDraftSchema, assertTablesInsideRoom } from "@/domain/floor";
import { requireUser } from "@/server/auth/server";
import { apiError } from "@/server/security/http";

const input = z.object({ organizationId: z.string().uuid(), locationId: z.string().uuid(), expectedVersion: z.number().int().positive(), draft: floorDraftSchema });

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
