import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { staffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";

/**
 * Who the location actually serves: names, visit counts and spend, derived from
 * the orders taken rather than a separate contact list.
 */
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const query = new URL(request.url).searchParams;
    const locationId = query.get("locationId");
    if (!locationId || !z.string().uuid().safeParse(locationId).success) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }
    const limit = Math.min(Math.max(Number(query.get("limit") ?? 50) || 50, 1), 200);

    const { data, error } = await supabase.rpc("app_customer_book", {
      p_location_id: locationId,
      p_actor: user.id,
      p_limit: limit,
    });
    if (error) throw staffError(error);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
