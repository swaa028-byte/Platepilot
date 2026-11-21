import { NextResponse } from "next/server";
import { z } from "zod";
import { getDbClient } from "@/server/db/client";
import { checkRateLimit } from "@/server/security/rate-limit";
import { apiError } from "@/server/security/http";

const input = z.object({
  locationId: z.string().uuid(),
  serviceType: z.enum(["pickup", "delivery", "dine_in", "catering"]),
  locale: z.enum(["en", "fr", "es", "pt", "ar"]),
  items: z.array(z.object({
    menuItemId: z.string().uuid(),
    quantity: z.number().int().min(1).max(100),
    // Options are requested by id; their prices are resolved from the published
    // price book and the option groups, never taken from the client.
    modifiers: z.array(z.object({
      modifierId: z.string().uuid(),
      quantity: z.number().int().min(1).max(20).default(1),
    })).max(50).default([]),
  })).min(1).max(100),
  scheduledFor: z.string().datetime().nullable().default(null),
  discountCode: z.string().trim().max(40).nullable().default(null),
  tipMinor: z.string().regex(/^[0-9]+$/).nullable().default(null),
  deliveryAddress: z.string().trim().max(400).nullable().default(null),
  deliveryPostalCode: z.string().trim().max(20).nullable().default(null),
});

/**
 * Places a storefront order. The client states what it wants; the server
 * resolves every price, discount, tax, fee and the service hours.
 */
export async function POST(request: Request) {
  try {
    const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    checkRateLimit(`orders:${address}`, 20, 60_000);
    const body = input.parse(await request.json());
    const admin = await getDbClient();
    const { data, error } = await admin.rpc("app_create_order", {
      p_location_id: body.locationId,
      p_service_type: body.serviceType,
      p_customer_locale: body.locale,
      p_items: body.items,
      p_scheduled_for: body.scheduledFor,
      p_discount_code: body.discountCode,
      p_tip_minor: body.tipMinor,
      p_delivery_address: body.deliveryAddress,
      p_delivery_postal_code: body.deliveryPostalCode,
    });
    if (error) throw new Error(mapOrderError(error.message));
    return NextResponse.json(data, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

function mapOrderError(message: string) {
  if (message.includes("ORDERING_NOT_ENABLED")) return "ORDERING_NOT_ENABLED";
  if (message.includes("LOCATION_CLOSED")) return "LOCATION_CLOSED";
  if (message.includes("SCHEDULE_OUTSIDE_OPENING_HOURS")) return "SCHEDULE_OUTSIDE_OPENING_HOURS";
  if (message.includes("OUTSIDE_SERVICE_AREA")) return "OUTSIDE_SERVICE_AREA";
  if (message.includes("DELIVERY_ADDRESS_REQUIRED")) return "DELIVERY_ADDRESS_REQUIRED";
  if (message.includes("DELIVERY_MIN_ORDER")) return "DELIVERY_MIN_ORDER";
  if (message.includes("ITEM_UNAVAILABLE")) return "ITEM_UNAVAILABLE";
  if (message.includes("MODIFIER")) return "MODIFIER_NOT_ALLOWED";
  if (message.includes("PROMOTION")) return "PROMOTION_NOT_APPLICABLE";
  return "ORDER_REJECTED";
}
