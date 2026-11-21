import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { staffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";
import { checkRateLimit } from "@/server/security/rate-limit";

const uuid = z.string().uuid();
const iso = z.string().datetime();

/**
 * The manager's exception report for one location and one window.
 */
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`staff-theft:${user.id}`, 60, 60_000);
    const query = new URL(request.url).searchParams;
    const parsed = z.object({
      locationId: uuid,
      from: iso,
      to: iso,
    }).safeParse({
      locationId: query.get("locationId") ?? "",
      from: query.get("from") ?? "",
      to: query.get("to") ?? "",
    });
    if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    const { data, error } = await supabase.rpc("app_theft_report", {
      p_actor: user.id,
      p_location_id: parsed.data.locationId,
      p_from: parsed.data.from,
      p_to: parsed.data.to,
    });
    if (error) throw staffError(error);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
