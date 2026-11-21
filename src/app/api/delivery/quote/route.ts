import { NextResponse } from "next/server";
import { z } from "zod";
import { getDbClient } from "@/server/db/client";
import { apiError } from "@/server/security/http";
import { checkRateLimit } from "@/server/security/rate-limit";

const input = z.object({
  locationId: z.string().uuid(),
  postalCode: z.string().trim().min(1).max(20),
});

/**
 * Public delivery quote for the storefront checkout: which zone a postal code
 * falls in and what it costs. Returns null when no zone covers the code, so
 * the checkout can say "we do not deliver there" instead of guessing a price.
 */
export async function POST(request: Request) {
  try {
    const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    checkRateLimit(`delivery-quote:${address}`, 60, 60_000);
    const body = input.parse(await request.json());
    const admin = await getDbClient();
    const { data, error } = await admin.rpc("app_resolve_delivery_zone", {
      p_location_id: body.locationId, p_postal_code: body.postalCode,
    });
    if (error) return NextResponse.json({ error: "QUOTE_FAILED" }, { status: 500, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ zone: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
