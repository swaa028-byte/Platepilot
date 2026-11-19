import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { staffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";
import { checkRateLimit } from "@/server/security/rate-limit";

/**
 * The stock position for a location: what is on hand, what has been ordered,
 * and what has fallen below its reorder level.
 */
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const locationId = new URL(request.url).searchParams.get("locationId");
    if (!locationId || !z.string().uuid().safeParse(locationId).success) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("app_inventory_position", {
      p_location_id: locationId,
      p_actor: user.id,
    });
    if (error) throw staffError(error);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

const receipt = z.object({
  locationId: z.string().uuid(),
  ingredientId: z.string().uuid(),
  quantityMilliUnits: z.string().regex(/^[0-9]+$/, "quantityMilliUnits must be an integer string"),
  /**
   * The delivery note the kitchen reads. Sending the same note twice is
   * ignored, so a flaky connection cannot double a delivery.
   */
  eventId: z.string().trim().min(1).max(120),
});

/**
 * Records stock coming in. The event id makes the receipt idempotent.
 */
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`staff-inventory:${user.id}`, 60, 60_000);
    const body = receipt.parse(await request.json());
    const { data, error } = await supabase.rpc("app_record_stock_receipt", {
      p_location_id: body.locationId,
      p_ingredient_id: body.ingredientId,
      p_quantity_milli_units: body.quantityMilliUnits,
      p_event_id: body.eventId,
      p_actor: user.id,
    });
    if (error) throw staffError(error);
    return NextResponse.json(data, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
