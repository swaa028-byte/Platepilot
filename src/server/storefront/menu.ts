import "server-only";
import { getDbClient } from "@/server/db/client";
import type { PublicMenu } from "@/domain/seo";

/**
 * Reads the published storefront for a restaurant.
 *
 * The lookup goes through the database's published-menu function, so only
 * published and available items and the merchant's own public details are
 * ever returned.
 */
export async function getPublicMenuBySlug(slug: string, locale: string): Promise<PublicMenu | null> {
  try {
    const db = await getDbClient();
    const { data, error } = await db
      .from("locations")
      .select("id")
      .eq("slug", slug)
      .limit(1);
    if (error) {
      console.error("Storefront lookup failed", { slug, message: error.message });
      return null;
    }
    if (!data || (data as unknown[]).length === 0) {
      console.error("Storefront lookup found no location", { slug });
      return null;
    }
    const rows = data as { id: string }[];
    const locationId = rows[0].id;

    const result = await db.rpc("app_published_menu", { p_location_id: locationId, p_locale: locale });
    if (result.error) {
      console.error("Published menu lookup failed", { slug, message: result.error.message });
      return null;
    }
    if (!result.data) return null;
    return result.data as PublicMenu;
  } catch (failure) {
    console.error("Published menu lookup threw", { slug, message: failure instanceof Error ? failure.message : String(failure) });
    return null;
  }
}

/** Every location that has a published menu, used by the sitemap. */
export async function listPublishedLocations(): Promise<{ slug: string; locationId: string }[]> {
  try {
    const db = await getDbClient();
    const { data, error } = await db
      .from("locations")
      .select("id,slug")
      .limit(1000);
    if (error || !data) return [];
    return (data as { id: string; slug: string | null }[])
      .filter((row) => Boolean(row.slug))
      .map((row) => ({ slug: row.slug as string, locationId: row.id }));
  } catch {
    return [];
  }
}
