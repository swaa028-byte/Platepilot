import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MapPin } from "lucide-react";
import { getDbClient } from "@/server/db/client";
import { routing } from "@/i18n/routing";

export const dynamic = "force-dynamic";

type LocatorLocation = {
  name: string;
  slug: string;
  address: string;
  ordering_enabled: boolean;
  service_settings: Record<string, unknown> | null;
  organizations: { name: string } | null;
};

type DayWindows = [string, string][];

/** The hours a location declared, as "Mon 09:00–22:00" lines in the visitor's language. */
function hoursLines(settings: Record<string, unknown> | null, locale: string): string[] {
  const hours = settings?.openingHours;
  if (!hours || typeof hours !== "object") return [];
  const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const lines: string[] = [];
  // Monday-first for people, even though the stored keys are Sunday-first.
  for (const day of [1, 2, 3, 4, 5, 6, 0]) {
    const windows = (hours as Record<string, unknown>)[String(day)];
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

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Locations" });
  return {
    title: t("title"),
    description: t("description"),
  };
}

/**
 * The store locator: every restaurant with a published storefront, in one
 * place. Each entry links straight to that restaurant's menu, states whether
 * online ordering is open, and shows the hours the merchant declared — read
 * from the same published data the storefront itself shows.
 */
export default async function LocationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as never)) return;
  setRequestLocale(locale);
  const t = await getTranslations("Locations");

  let locations: LocatorLocation[] = [];
  try {
    const db = await getDbClient();
    const { data, error } = await db
      .from("locations")
      .select("name,slug,address,ordering_enabled,service_settings,organizations(name)");
    if (!error && data) {
      locations = (data as unknown as LocatorLocation[])
        .filter((entry) => entry.slug)
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  } catch {
    locations = [];
  }

  const brands = new Map<string, LocatorLocation[]>();
  for (const location of locations) {
    const brand = location.organizations?.name ?? location.name;
    const list = brands.get(brand) ?? [];
    list.push(location);
    brands.set(brand, list);
  }

  return (
    <div className="locations-page">
      <section className="hero">
        <div className="shell">
          <h1>{t("title")}</h1>
          <p>{t("description")}</p>
        </div>
      </section>
      <section className="section">
        <div className="shell">
          {locations.length === 0 ? (
            <p className="locations-empty">{t("empty")}</p>
          ) : (
            [...brands.entries()].map(([brand, entries]) => (
              <div className="locations-brand" key={brand}>
                <h2>{brand}</h2>
                <ul className="locations-list">
                  {entries.map((entry) => (
                    <li className="locations-card" key={entry.slug}>
                      <div className="locations-card-main">
                        <h3>
                          <Link href={`/${locale}/r/${entry.slug}`}>{entry.name}</Link>
                        </h3>
                        <p className="locations-address"><MapPin size={14} aria-hidden="true" />{entry.address}</p>
                        {hoursLines(entry.service_settings, locale).length > 0 && (
                          <ul className="locations-hours">
                            {hoursLines(entry.service_settings, locale).map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div className="locations-card-actions">
                        {entry.ordering_enabled ? (
                          <Link className="button-primary" href={`/${locale}/r/${entry.slug}/menu`}>{t("orderOnline")}</Link>
                        ) : (
                          <span className="locations-walkin">{t("walkInOnly")}</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
