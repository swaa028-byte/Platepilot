import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MapPin } from "lucide-react";
import { getPublicDirectory, type DirectoryEntry } from "@/server/storefront/directory";
import { appBaseUrl } from "@/domain/app-url";
import { routing } from "@/i18n/routing";

export const dynamic = "force-dynamic";

/** The hours a restaurant declared, as "Mon 09:00–22:00" lines in the visitor's language. */
function hoursLines(hours: Record<string, unknown> | null, locale: string): string[] {
  if (!hours) return [];
  const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const lines: string[] = [];
  // Monday-first for people, even though the stored keys are Sunday-first.
  for (const day of [1, 2, 3, 4, 5, 6, 0]) {
    const windows = hours[String(day)];
    if (!Array.isArray(windows) || windows.length === 0) continue;
    const rendered = windows
      .filter((w): w is [string, string] => Array.isArray(w) && w.length === 2)
      .map(([opens, closes]) => (opens === closes ? null : `${opens}–${closes}`))
      .filter((text): text is string => text !== null);
    if (rendered.length === 0) continue;
    const weekday = formatter.format(new Date(Date.UTC(2024, 0, 7 + day))); // 2024-01-07 is a Sunday
    lines.push(`${weekday} ${rendered.join(", ")}`);
  }
  return lines;
}

/** Prices are stored in minor units, but not every currency uses two decimals. */
function priceLabel(entry: DirectoryEntry, locale: string): string | null {
  if (!entry.fromMinor || !entry.currency) return null;
  const amount = Number(entry.fromMinor) / 100;
  if (!Number.isFinite(amount)) return null;
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: entry.currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${entry.currency}`;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Locations" });
  return { title: t("title"), description: t("description") };
}

/**
 * The public directory: every restaurant taking orders, as a card you can open.
 *
 * Ordered by restaurant name rather than grouped by brand, because a guest is
 * looking for one place they already have in mind. A restaurant with no photo
 * shows the first letter of its name instead of a grey rectangle, and a
 * restaurant that has not opened online ordering says so rather than hiding the
 * button it cannot honour.
 */
export default async function LocationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as never)) return;
  setRequestLocale(locale);
  const t = await getTranslations("Locations");

  const places = await getPublicDirectory();
  const startUrl = `${appBaseUrl()}/en/start`;
  const hasPublished = places.some((place) => place.items > 0);

  return (
    <div className="dir-page">
      <section className="dir-hero">
        <div className="shell">
          <p className="eyebrow"><span />{t("eyebrow")}</p>
          <h1>{t("title")}</h1>
          <p className="dir-lede">{t("description")}</p>
          {places.length > 0 && <p className="dir-count">{t("count", { count: places.length })}</p>}
        </div>
      </section>

      <section className="dir-body">
        <div className="shell">
          {places.length === 0 ? (
            <div className="dir-empty">
              <h2>{t("empty")}</h2>
              <p>{t("emptyHint")}</p>
            </div>
          ) : (
            <ul className="dir-grid">
              {places.map((place) => {
                const menuHref = `/${locale}/r/${place.slug}`;
                const hours = hoursLines(place.hours, locale);
                const price = priceLabel(place, locale);
                return (
                  <li className="dir-card" key={place.slug}>
                    <Link className="dir-card-media" href={menuHref} aria-hidden="true" tabIndex={-1}>
                      {place.leadImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={place.leadImage} alt="" loading="lazy" decoding="async" />
                      ) : (
                        <span className="dir-card-plate" aria-hidden="true">{place.name.slice(0, 1).toUpperCase()}</span>
                      )}
                    </Link>
                    <div className="dir-card-body">
                      <h2 className="dir-card-title"><Link href={menuHref}>{place.name}</Link></h2>
                      {place.address && (
                        <p className="dir-card-address"><MapPin size={14} aria-hidden="true" />{place.address}</p>
                      )}
                      {hours.length > 0 && (
                        <ul className="dir-card-hours">
                          {hours.map((line) => <li key={line}>{line}</li>)}
                        </ul>
                      )}
                      {(place.items > 0 || price) && (
                        <p className="dir-card-meta">
                          {place.items > 0 && t("dishes", { count: place.items })}
                          {place.items > 0 && price && " · "}
                          {price && t("fromPrice", { price })}
                        </p>
                      )}
                      <div className="dir-card-actions">
                        {place.ordering ? (
                          <Link className="button dir-card-cta" href={`${menuHref}/menu`}>{t("orderOnline")}</Link>
                        ) : (
                          <span className="dir-card-closed">{t("walkInOnly")}</span>
                        )}
                        <Link className="dir-card-link" href={menuHref}>{t("seeMenu")}</Link>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {!hasPublished && places.length > 0 && <p className="dir-note">{t("notPublishedYet")}</p>}

          <div className="dir-invite">
            <div>
              <h2>{t("inviteTitle")}</h2>
              <p>{t("inviteBody")}</p>
            </div>
            <Link className="button" href={startUrl}>{t("inviteCta")}</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
