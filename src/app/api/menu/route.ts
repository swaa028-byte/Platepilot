import { NextResponse } from "next/server";
import { z } from "zod";
import { getDbClient } from "@/server/db/client";
import { apiError } from "@/server/security/http";

const query = z.object({
  locationId: z.string().uuid(),
  locale: z.enum(["en", "fr", "es", "pt", "ar"]).default("en"),
});

/**
 * The published menu for a location.
 *
 * This is public storefront data: the merchant's own name and address, the
 * opening hours they declared, and the items they published with the prices
 * they set. Nothing about staff, customers or payments is exposed.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = query.parse({
      locationId: url.searchParams.get("locationId") ?? "",
      locale: url.searchParams.get("locale") ?? "en",
    });
    const db = await getDbClient();
    const { data, error } = await db.rpc("app_published_menu", {
      p_location_id: parsed.locationId,
      p_locale: parsed.locale,
    });
    if (error) throw new Error("MENU_UNAVAILABLE");
    return NextResponse.json(data, {
      headers: {
        // Public storefront data, but always revalidated so a merchant's price
        // change is reflected promptly.
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    });
  } catch (error) { return apiError(error); }
}
