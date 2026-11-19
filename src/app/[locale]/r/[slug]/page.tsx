import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getDbClient } from "@/server/db/client";
import { routing } from "@/i18n/routing";
import { buildMenuJsonLd, buildRestaurantJsonLd, currencySymbol, exponent, openingHoursSpecification } from "@/domain/seo";
import { getPublicMenuBySlug } from "@/server/storefront/menu";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const origin = process.env.APP_URL || "http://localhost:3000";
  const menu = await getPublicMenuBySlug(slug, locale);
  if (!menu) return { title: "Storefront" };
  const url = `${origin.replace(/\/$/, "")}/${locale}/r/${slug}`;
  return {
    title: `${menu.location.name} — ${menu.location.address}`,
    description: `Menu, prices and opening hours for ${menu.location.name}, ${menu.location.address}.`,
    alternates: {
      canonical: url,
      languages: Object.fromEntries(routing.locales.map((item) => [item, `${origin.replace(/\/$/, "")}/${item}/r/${slug}`])),
    },
    openGraph: {
      type: "website",
      title: menu.location.name,
      description: `Menu and opening hours for ${menu.location.name}, ${menu.location.address}.`,
      url,
    },
  };
}

/**
 * The public storefront for a restaurant.
 *
 * The page is rendered on the server from the merchant's own published data,
 * and it carries schema.org structured data so search engines and AI systems
 * can read the menu and opening hours directly.
 */
export default async function StorefrontPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Storefront");
  const origin = process.env.APP_URL || "http://localhost:3000";
  const menu = await getPublicMenuBySlug(slug, locale);
  if (!menu) notFound();

  const placeId = await getLinkedPlaceId(menu.location.id);
  const restaurant = buildRestaurantJsonLd(menu, { origin, locale, placeId });
  const menuLd = buildMenuJsonLd(menu);
  const hours = openingHoursSpecification(menu.location.serviceSettings);
  const available = menu.items.filter((item) => item.available);
  const categories = [...new Set(available.map((item) => item.category))];

  return (
    <div className="storefront-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(restaurant) }} />
      {menuLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(menuLd) }} />}

      <section className="page-hero page-hero--compact">
        <div className="shell">
          <p className="eyebrow"><span />{t("eyebrow")}</p>
          <h1>{menu.location.name}</h1>
          <p className="page-lede">{menu.location.address}</p>
        </div>
      </section>

      <section className="section storefront-content">
        <div className="shell">
          {hours.length > 0 && (
            <section className="storefront-block">
              <h2>{t("hours")}</h2>
              <ul className="storefront-hours">
                {hours.map((entry) => (
                  <li key={`${entry.dayOfWeek.join(",")}-${entry.opens}`}>
                    <span>{entry.dayOfWeek.join(", ")}</span>
                    <span>{entry.opens}–{entry.closes}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="storefront-block">
            <h2>{t("menu")}</h2>
            {available.length === 0 ? (
              <p>{t("noMenu")}</p>
            ) : (
              categories.map((category) => (
                <div key={category} className="storefront-category">
                  <h3>{category}</h3>
                  <ul className="storefront-items">
                    {available.filter((item) => item.category === category).map((item) => (
                      <li key={item.id}>
                        <span className="storefront-item-name">
                          {item.name}
                          {item.allergens.length > 0 && <small>{t("allergens")}: {item.allergens.join(", ")}</small>}
                        </span>
                        <span className="storefront-item-price">
                          {currencySymbol(item.currency)}
                          {(Number(item.amountMinor) / 10 ** exponent(item.currency)).toFixed(2)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

async function getLinkedPlaceId(locationId: string) {
  try {
    const db = await getDbClient();
    const { data, error } = await db.from("external_listings")
      .select("external_id")
      .eq("location_id", locationId)
      .eq("provider", "google_places")
      .limit(1);
    if (error || !data) return null;
    const rows = data as { external_id: string }[];
    return rows[0]?.external_id ?? null;
  } catch {
    return null;
  }
}
