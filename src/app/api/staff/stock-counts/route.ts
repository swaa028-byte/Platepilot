import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { staffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";
import { checkRateLimit } from "@/server/security/rate-limit";

const money = z.string().regex(/^[0-9]+$/, "expected integer milli units");

const submitInput = z.object({
  locationId: z.string().uuid(),
  stockCountId: z.string().uuid(),
  lines: z.array(z.object({
    ingredientId: z.string().uuid(),
    countedMilliUnits: money,
  })).max(500),
});

/** The location's count history. */
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const locationId = new URL(request.url).searchParams.get("locationId") ?? "";
    if (!z.string().uuid().safeParse(locationId).success) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("app_list_stock_counts", { p_actor: user.id, p_location_id: locationId });
    if (error) throw staffError(error);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

/** Opens a count (POST without lines) or completes one (POST with lines). */
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`staff-stock-counts:${user.id}`, 60, 60_000);
    const body = await request.json() as Record<string, unknown>;

    if (!body.lines) {
      const parsed = z.object({ locationId: z.string().uuid() }).parse(body);
      const { data, error } = await supabase.rpc("app_start_stock_count", { p_actor: user.id, p_location_id: parsed.locationId });
      if (error) throw staffError(error);
      return NextResponse.json(data, { status: 201, headers: { "Cache-Control": "private, no-store" } });
    }

    const parsed = submitInput.parse(body);
    const { data, error } = await supabase.rpc("app_submit_stock_count", {
      p_actor: user.id, p_stock_count_id: parsed.stockCountId,
      p_lines: parsed.lines.map((line) => ({ ingredientId: line.ingredientId, countedMilliUnits: line.countedMilliUnits })),
    });
    if (error) throw staffError(error);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
