import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { mapStaffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";

const modifierInput = z.object({
  modifierId: z.string().uuid(),
  quantity: z.number().int().min(1).max(20).default(1),
});

const input = z.object({
  locationId: z.string().uuid(),
  serviceType: z.enum(["walk_in", "phone", "takeaway", "dine_in", "catering", "pickup"]),
  locale: z.enum(["en", "fr", "es", "pt", "ar"]).default("en"),
  items: z.array(z.object({
    menuItemId: z.string().uuid(),
    quantity: z.number().int().min(1).max(100),
    // A client may state which options it wants, never what they cost.
    modifiers: z.array(modifierInput).max(50).default([]),
    // What the kitchen must know: an allergy the guest raised, and a note.
    allergyNote: z.string().trim().max(200).nullable().default(null),
    kitchenNote: z.string().trim().max(200).nullable().default(null),
  })).min(1).max(100),
  tenderType: z.enum(["cash", "counter", "external_terminal"]).nullable().default(null),
  tableId: z.string().uuid().nullable().default(null),
  customerName: z.string().trim().max(120).nullable().default(null),
  scheduledFor: z.string().datetime().nullable().default(null),
});

/** Opens a staff order at the register. Prices are resolved on the server. */
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const body = input.parse(await request.json());
    const { data, error } = await supabase.rpc("app_create_staff_order", {
      p_location_id: body.locationId,
      p_service_type: body.serviceType,
      p_customer_locale: body.locale,
      p_items: body.items,
      p_actor: user.id,
      p_tender_type: body.tenderType,
      p_table_id: body.tableId,
      p_customer_name: body.customerName,
      p_scheduled_for: body.scheduledFor,
    });
    if (error) throw new Error(mapStaffError(error.message));
    return NextResponse.json(data, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
