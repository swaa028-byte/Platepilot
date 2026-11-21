import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { staffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";
import { checkRateLimit } from "@/server/security/rate-limit";

const prefix = z.string().trim().min(1).max(12).regex(/^[A-Za-z0-9][A-Za-z0-9 -]*$/);
const money = z.string().regex(/^[0-9]+$/, "expected integer minor units");

const zoneInput = z.object({
  locationId: z.string().uuid(),
  zoneId: z.string().uuid().nullable().default(null),
  name: z.string().trim().min(1).max(80),
  postalPrefixes: z.array(prefix).min(1).max(100),
  feeMinor: money,
  minOrderMinor: money,
  active: z.boolean().default(true),
});

/**
 * Delivery zones for one location: which postal areas the location delivers
 * to, at what fee, with what minimum order. The server, never the customer,
 * decides what delivery costs.
 */
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const locationId = new URL(request.url).searchParams.get("locationId") ?? "";
    if (!z.string().uuid().safeParse(locationId).success) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("app_list_delivery_zones", {
      p_actor: user.id, p_location_id: locationId,
    });
    if (error) throw staffError(error);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

export async function PUT(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`staff-zones:${user.id}`, 60, 60_000);
    const body = zoneInput.parse(await request.json());
    const { data, error } = await supabase.rpc("app_upsert_delivery_zone", {
      p_actor: user.id, p_location_id: body.locationId, p_zone_id: body.zoneId,
      p_name: body.name, p_postal_prefixes: body.postalPrefixes,
      p_fee_minor: body.feeMinor, p_min_order_minor: body.minOrderMinor,
      p_active: body.active,
    });
    if (error) throw staffError(error);
    return NextResponse.json({ zoneId: data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`staff-zones:${user.id}`, 60, 60_000);
    const zoneId = new URL(request.url).searchParams.get("zoneId") ?? "";
    if (!z.string().uuid().safeParse(zoneId).success) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }
    const { error } = await supabase.rpc("app_delete_delivery_zone", {
      p_actor: user.id, p_zone_id: zoneId,
    });
    if (error) throw staffError(error);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
