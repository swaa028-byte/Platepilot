import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { staffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";
import { checkRateLimit } from "@/server/security/rate-limit";

/**
 * The Google listing link for one location: what is linked, and linking or
 * unlinking it. A link says this listing describes this place; it grants no
 * ownership of the Business Profile.
 */
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const locationId = new URL(request.url).searchParams.get("locationId") ?? "";
    if (!z.string().uuid().safeParse(locationId).success) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("app_get_linked_place", {
      p_actor: user.id, p_location_id: locationId,
    });
    if (error) throw staffError(error);
    return NextResponse.json({ placeId: data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

export async function PUT(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`places:${user.id}`, 30, 60_000);
    const body = z.object({
      locationId: z.string().uuid(),
      placeId: z.string().min(10).max(2000),
    }).parse(await request.json());
    // Accept a bare Place ID or a pasted Google Maps link — merchants copy
    // whatever their browser shows: ?place_id=ChIJ…, ?q=place_id:ChIJ…, or a
    // bare ID. Find the Place ID pattern wherever it sits in the paste.
    const placeId = body.placeId.match(/ChIJ[A-Za-z0-9_-]{10,}/)?.[0] ?? null;
    if (!placeId || !/^ChIJ[A-Za-z0-9_-]{10,}$/.test(placeId)) {
      return NextResponse.json({ error: "INVALID_PLACE_ID" }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("app_link_place", {
      p_actor: user.id, p_location_id: body.locationId, p_place_id: placeId,
    });
    if (error) throw staffError(error);
    return NextResponse.json({ linkId: data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`places:${user.id}`, 30, 60_000);
    const locationId = new URL(request.url).searchParams.get("locationId") ?? "";
    if (!z.string().uuid().safeParse(locationId).success) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }
    const { error } = await supabase.rpc("app_unlink_place", { p_actor: user.id, p_location_id: locationId });
    if (error) throw staffError(error);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
