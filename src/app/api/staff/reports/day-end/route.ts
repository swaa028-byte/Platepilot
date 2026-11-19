import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { staffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";

const query = z.object({
  locationId: z.string().uuid(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

/**
 * The day-end report.
 *
 * The window defaults to the location's current trading day: the start of
 * today in the location's own timezone until now. Nothing is assumed about
 * the reporting timezone, because the location declares one.
 */
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const params = request.url ? new URL(request.url).searchParams : new URLSearchParams();
    const parsed = query.parse({
      locationId: params.get("locationId") ?? "",
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
    });

    const { data: window, error: windowError } = await supabase.rpc("app_day_end_window", {
      p_location_id: parsed.locationId,
      p_from: parsed.from ?? null,
      p_to: parsed.to ?? null,
      p_actor: user.id,
    });
    if (windowError) throw staffError(windowError);

    const { data, error } = await supabase.rpc("app_day_end_report", {
      p_location_id: parsed.locationId,
      p_from: (window as { from: string }).from,
      p_to: (window as { to: string }).to,
      p_actor: user.id,
    });
    if (error) throw staffError(error);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
