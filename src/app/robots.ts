import type { MetadataRoute } from "next";
import { appBaseUrl } from "@/domain/app-url";

/**
 * Robots policy.
 *
 * The public storefront is meant to be indexed, including by the crawlers that
 * assemble AI answers. Staff routes, the API and the local floor planner are
 * not.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = appBaseUrl();

  // The Worker is an application, not the public website: the marketing site is
  // served elsewhere. Indexing its pages would put two versions of the same
  // words into search results, so the deployed build asks crawlers to stay out
  // entirely. Unset (local, tests) keeps the normal policy.
  if (process.env.CLOUDFLARE_WORKERS === "true") {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/*/operations", "/*/floor-planner", "/*/login"],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
