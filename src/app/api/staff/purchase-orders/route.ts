import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { staffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";
import { checkRateLimit } from "@/server/security/rate-limit";

const money = z.string().regex(/^[0-9]+$/, "expected integer minor units");

const input = z.object({
  locationId: z.string().uuid(),
  supplier: z.string().trim().min(1).max(120),
  reference: z.string().trim().max(60).nullable().default(null),
  lines: z.array(z.object({
    ingredientId: z.string().uuid(),
    quantityMilliUnits: money,
    unitCostMinor: money.default("0"),
  })).min(1).max(200),
});

/**
 * What the location has ordered from its suppliers.
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

    const { data, error } = await supabase.rpc("app_purchase_orders", {
      p_location_id: locationId,
      p_actor: user.id,
      p_limit: limit,
    });
    if (error) throw staffError(error);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

/**
 * Places a purchase order. Nothing arrives in stock until it is received.
 */
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`staff-purchase-orders:${user.id}`, 60, 60_000);
    const body = input.parse(await request.json());

    const { data, error } = await supabase.rpc("app_create_purchase_order", {
      p_location_id: body.locationId,
      p_actor: user.id,
      p_supplier: body.supplier,
      p_reference: body.reference,
      p_lines: body.lines,
    });
    if (error) throw staffError(error);
    return NextResponse.json(data, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
