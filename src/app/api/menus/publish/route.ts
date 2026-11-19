import { NextResponse } from "next/server";
import { z } from "zod";
import { menuItemSchema } from "@/domain/menu";
import { requireUser } from "@/server/auth/server";
import { staffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";

const input = z.object({ organizationId: z.string().uuid(), locationId: z.string().uuid(), items: z.array(menuItemSchema).min(1).max(500) });

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const body = input.parse(await request.json());
    const { data, error } = await supabase.rpc("app_publish_menu", { p_organization_id: body.organizationId, p_location_id: body.locationId, p_items: body.items, p_actor: user.id });
    if (error) throw staffError(error);
    return NextResponse.json({ published: true, menuId: data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
