import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { listPublishedLocations } from "@/server/storefront/menu";

// The sitemap lists the restaurants that exist right now, so it is generated
// per request rather than baked into the build.
export const dynamic = "force-dynamic";

/**
 * The sitemap.
 *
 * Only real restaurants that have published a storefront are listed. A newly
 * onboarded restaurant with no published menu is not advertised.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const locations = await listPublishedLocations();
  const entries: MetadataRoute.Sitemap = [];

  for (const locale of routing.locales) {
    entries.push({ url: `${origin}/${locale}`, changeFrequency: "weekly", priority: 0.8 });
    entries.push({ url: `${origin}/${locale}/onboarding`, changeFrequency: "monthly", priority: 0.4 });
    // Marketing pages: static content, so they are strong index targets.
    for (const page of ["pricing", "features", "how-it-works", "integrations", "white-label", "about", "security", "locations", "floor-planner", "operations", "login"]) {
      entries.push({ url: `${origin}/${locale}/${page}`, changeFrequency: "monthly", priority: 0.6 });
    }
  }
  for (const location of locations) {
    for (const locale of routing.locales) {
      entries.push({
        url: `${origin}/${locale}/r/${location.slug}`,
        changeFrequency: "daily",
        priority: 0.9,
        alternates: {
          languages: Object.fromEntries(
            routing.locales.map((item) => [item, `${origin}/${item}/r/${location.slug}`]),
          ),
        },
      });
    }
  }
  return entries;
}
