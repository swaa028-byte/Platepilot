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
