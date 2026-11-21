import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getDbClient } from "@/server/db/client";
import { routing } from "@/i18n/routing";
import { buildMenuJsonLd, buildRestaurantJsonLd, currencySymbol, exponent, openingHoursSpecification } from "@/domain/seo";
import { getPublicMenuBySlug } from "@/server/storefront/menu";
import { CampaignPopup, type Campaign } from "@/components/storefront/CampaignPopup";

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
  const campaign = await getActiveCampaign(menu.location.id);
  const restaurant = buildRestaurantJsonLd(menu, { origin, locale, placeId });
  const menuLd = buildMenuJsonLd(menu);
  const hours = openingHoursSpecification(menu.location.serviceSettings);
  const available = menu.items.filter((item) => item.available);
  const categories = [...new Set(available.map((item) => item.category))];

  return (
    <div className="storefront-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(restaurant) }} />
      {menuLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(menuLd) }} />}

      {campaign?.kind === "popup" && <CampaignPopup campaign={campaign} />}
      {campaign?.kind === "banner" && (
        <aside className="campaign-banner" role="note">
          <div className="shell campaign-banner__inner">
            <p>
              <strong>{campaign.headline}</strong>
              {campaign.body ? ` — ${campaign.body}` : ""}
              {campaign.discountCode ? ` · ${campaign.discountCode}` : ""}
            </p>
            {campaign.ctaLabel && campaign.ctaHref && (
              <Link href={campaign.ctaHref} className="campaign-banner__cta">{campaign.ctaLabel} →</Link>
            )}
          </div>
        </aside>
      )}

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
                      <li key={item.id} className={item.imageUrl ? "has-photo" : undefined}>
                        {item.imageUrl && <img src={item.imageUrl} alt={item.name} loading="lazy" className="storefront-item-photo" width={72} height={72} />}
                        <span className="storefront-item-name">
                          {item.name}
                          {item.allergens.length > 0 && <small>{t("allergens")}: {item.allergens.join(", ")}</small>}
                        </span>
                        <span className="storefront-item-price">
                          {currencySymbol(item.currency)}
                          {(Number(item.amountMinor) / 10 ** exponent(item.currency)).toFixed(exponent(item.currency))}
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

import { Link } from "@/i18n/navigation";

async function getActiveCampaign(locationId: string): Promise<Campaign | null> {
  try {
    const db = await getDbClient();
    const { data, error } = await db.rpc("app_active_campaign", { p_location_id: locationId });
    if (error || !data) return null;
    const value = data as Campaign | null;
    return value && value.headline ? value : null;
  } catch {
    return null;
  }
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
