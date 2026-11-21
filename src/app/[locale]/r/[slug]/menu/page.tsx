import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { buildMenuJsonLd, currencySymbol, exponent } from "@/domain/seo";
import { getPublicMenuBySlug } from "@/server/storefront/menu";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }): Promise<Metadata> {
  const { locale, slug } = await params;
  const origin = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const menu = await getPublicMenuBySlug(slug, locale);
  if (!menu) return { title: "Menu" };
  const url = `${origin}/${locale}/r/${slug}/menu`;
  return {
    title: `Menu — ${menu.location.name}`,
    description: `The full menu of ${menu.location.name}, ${menu.location.address}, with prices and allergens.`,
    alternates: { canonical: url },
    openGraph: { type: "website", title: `Menu — ${menu.location.name}`, description: `Menu and prices for ${menu.location.name}.`, url },
  };
}

/**
 * The dedicated, indexable menu page.
 *
 * The storefront's Restaurant schema points hasMenu here; a menu that search
 * engines and AI systems can read as plain HTML (plus Menu schema) is one of
 * the strongest local-ranking signals a restaurant page can carry.
 */
export default async function MenuPage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Storefront");
  const origin = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const menu = await getPublicMenuBySlug(slug, locale);
  if (!menu) notFound();

  const menuLd = buildMenuJsonLd(menu);
  const available = menu.items.filter((item) => item.available);
  const categories = [...new Set(available.map((item) => item.category))];

  return (
    <div className="menu-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(menuLd) }} />
      <header className="menu-page__head">
        <p className="menu-page__crumb">
          <Link href={`/${locale}/r/${slug}`}>{menu.location.name}</Link>
        </p>
        <h1>{t("menu")} — {menu.location.name}</h1>
        <p className="menu-page__address">{menu.location.address}</p>
      </header>
      {available.length === 0 ? (
        <p>{t("noMenu")}</p>
      ) : (
        categories.map((category) => (
          <section key={category} className="storefront-block">
            <h2>{category}</h2>
            <ul className="storefront-items">
              {available.filter((item) => item.category === category).map((item) => (
                <li key={item.id}>
                  <span className="storefront-item-name">
                    {item.name}
                    {item.description && <small>{item.description}</small>}
                    {item.allergens.length > 0 && <small>{t("allergens")}: {item.allergens.join(", ")}</small>}
                  </span>
                  <span className="storefront-item-price">
                    {currencySymbol(item.currency)}
                    {(Number(item.amountMinor) / 10 ** exponent(item.currency)).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
