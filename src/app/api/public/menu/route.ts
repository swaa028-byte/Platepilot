import { NextResponse } from "next/server";
import { z } from "zod";
import { getPublicMenuBySlug } from "@/server/storefront/menu";
import { apiError } from "@/server/security/http";

const query = z.object({
  slug: z.string().min(1).max(120),
  locale: z.enum(["en", "fr", "es", "pt", "ar"]).default("en"),
});

/**
 * The published menu for a storefront slug.
 *
 * This is the endpoint external sites (the WordPress kit, a landing page, a
 * QR sheet) use to display a restaurant's live menu without ever holding a
 * database key. Only published, available items and the merchant's own
 * public details are returned — the same payload the storefront page shows.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = query.parse({
      slug: url.searchParams.get("slug") ?? "",
      locale: url.searchParams.get("locale") ?? "en",
    });
    const menu = await getPublicMenuBySlug(parsed.slug, parsed.locale);
    if (!menu) {
      return NextResponse.json({ error: "MENU_NOT_PUBLISHED" }, { status: 404 });
    }
    return NextResponse.json(menu, {
      headers: {
        // Public storefront data, revalidated so a price change shows up fast.
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) { return apiError(error); }
}
