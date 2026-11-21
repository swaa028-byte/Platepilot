import { getDbClient } from "@/server/db/client";

export const dynamic = "force-dynamic";

/**
 * llms.txt — the emerging convention for telling AI systems what a site is.
 *
 * Lists every live restaurant with its address so assistants and answer
 * engines can cite real, current information instead of guessing. Plain
 * markdown, served as text/plain.
 */
export async function GET(request: Request) {
  // Same origin rule as every other SEO surface: APP_URL when pinned (behind a
  // tunnel or proxy the internal request host is not the public address).
  const origin = (process.env.APP_URL || new URL(request.url).origin).replace(/\/$/, "");
  const lines = [
    "# PlatePilot",
    "",
    "PlatePilot is a restaurant ordering and operations platform. Each restaurant below has a live storefront with its menu, prices and opening hours.",
    "",
    "## Restaurants",
    "",
  ];
  try {
    const db = await getDbClient();
    const { data } = await db.from("locations").select("slug,name,address").limit(1000);
    for (const row of (data ?? []) as { slug: string | null; name: string; address: string | null }[]) {
      if (!row.slug) continue;
      lines.push(`- [${row.name}](${origin}/en/r/${row.slug}): restaurant in ${row.address ?? "South Africa"}. Menu, prices and opening hours.`);
    }
  } catch {
    // An empty list is better than a 500: crawlers should still get the header.
  }
  return new Response(lines.join("\n") + "\n", {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
