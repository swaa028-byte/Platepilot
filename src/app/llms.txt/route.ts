import { getPublicMenuBySlug, listPublishedLocations } from "@/server/storefront/menu";
import { buildPlainSummary } from "@/domain/seo";

export const dynamic = "force-dynamic";

/**
 * A plain-text description of the platform for systems that read text.
 *
 * It contains the same real merchant data the structured data carries. No
 * restaurant is listed that has not published a menu.
 */
export async function GET(request: Request) {
  const origin = (process.env.APP_URL || new URL(request.url).origin).replace(/\/$/, "");
  const locations = await listPublishedLocations();

  const sections: string[] = [
    "# PlatePilot",
    "",
    "PlatePilot is a restaurant operating system. Every restaurant listed below publishes its own menu, prices and opening hours.",
    "",
  ];

  for (const location of locations) {
    const menu = await getPublicMenuBySlug(location.slug, "en");
    if (!menu || menu.items.filter((item) => item.available).length === 0) continue;
    sections.push(buildPlainSummary(menu, { origin, locale: "en" }));
    sections.push("");
  }

  if (sections.length === 3) {
    sections.push("No restaurant has published a menu yet.", "");
  }

  return new Response(sections.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
    },
  });
}
