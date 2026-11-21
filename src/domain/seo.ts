/**
 * Structured data for search engines and AI systems.
 *
 * Everything here is derived from data the merchant actually supplied: their
 * name, address, the opening hours they declared, the menu they published and
 * the prices they set. Nothing is inferred, defaulted to a plausible value,
 * or copied from a third party's profile. A field that the merchant has not
 * supplied is omitted rather than guessed.
 */

export type PublicMenuItem = {
  id: string;
  name: string;
  description: string;
  allergens: string[];
  category: string;
  amountMinor: string;
  currency: string;
  available: boolean;
  imageUrl: string | null;
};

export type PublicLocation = {
  id: string;
  slug: string | null;
  name: string;
  address: string;
  timezone: string;
  currency: string;
  serviceSettings: Record<string, unknown> | null;
  orderingEnabled?: boolean;
};

export type PublicMenu = {
  location: PublicLocation;
  items: PublicMenuItem[];
  translations?: Record<string, { name?: string; description?: string; legalText?: string }>;
};

export type OpeningHoursSpecification = {
  "@type": "OpeningHoursSpecification";
  dayOfWeek: string[];
  opens: string;
  closes: string;
};

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Converts the location's declared opening hours into the schema.org shape.
 *
 * A window whose end is not after its start crosses midnight, so it is split
 * into the day it opens and the day it closes. Days with no window are simply
 * absent, rather than being reported as closed when the merchant never said so.
 */
export function openingHoursSpecification(settings: Record<string, unknown> | null): OpeningHoursSpecification[] {
  const hours = settings?.openingHours;
  if (!hours || typeof hours !== "object") return [];
  const result: OpeningHoursSpecification[] = [];
  for (const [key, value] of Object.entries(hours as Record<string, unknown>)) {
    const day = Number(key);
    if (!Number.isInteger(day) || day < 0 || day > 6 || !Array.isArray(value)) continue;
    for (const window of value) {
      if (!Array.isArray(window) || window.length < 2) continue;
      const [opens, closes] = window as [string, string];
      if (typeof opens !== "string" || typeof closes !== "string") continue;
      if (opens === closes) continue;
      if (closes > opens) {
        result.push({ "@type": "OpeningHoursSpecification", dayOfWeek: [WEEKDAY_NAMES[day]], opens, closes });
      } else {
        // The window runs past midnight into the next day.
        result.push({ "@type": "OpeningHoursSpecification", dayOfWeek: [WEEKDAY_NAMES[day]], opens, closes: "23:59" });
        const nextDay = (day + 1) % 7;
        result.push({ "@type": "OpeningHoursSpecification", dayOfWeek: [WEEKDAY_NAMES[nextDay]], opens: "00:00", closes });
      }
    }
  }
  return result;
}

/**
 * The price range, derived from the published menu. Returns null when no
 * priced item is published, because a guessed range would be a false claim.
 */
export function priceRange(items: PublicMenuItem[]): string | null {
  const priced = items.filter((item) => item.available && item.amountMinor !== "");
  if (priced.length === 0) return null;
  const symbol = currencySymbol(priced[0].currency);
  const amounts = priced.map((item) => Number(item.amountMinor) / 10 ** exponent(priced[0].currency)).sort((a, b) => a - b);
  const lowest = amounts[0];
  const highest = amounts[amounts.length - 1];
  const format = (value: number) => `${symbol}${value % 1 === 0 ? value.toFixed(0) : value.toFixed(2)}`;
  return lowest === highest ? format(lowest) : `${format(lowest)}–${format(highest)}`;
}

export function exponent(currency: string) {
  if (currency === "JPY") return 0;
  if (currency === "KWD") return 3;
  if (currency === "XOF" || currency === "XAF") return 0;
  return 2;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  ZAR: "R", NGN: "₦", KES: "KSh", GHS: "GH₵", EGP: "E£", TZS: "TSh",
  UGX: "USh", ZMW: "ZK", USD: "$", EUR: "€", GBP: "£", CAD: "CA$", AUD: "A$",
  JPY: "¥", KWD: "KD", XOF: "CFA ", XAF: "FCFA ",
};

export function currencySymbol(currency: string) {
  return CURRENCY_SYMBOLS[currency] ?? `${currency} `;
}

export type JsonLd = Record<string, unknown>;

/**
 * The Restaurant entity for a location.
 *
 * A Place ID is only ever used to link the merchant's own public listing. It
 * is never treated as proof of ownership and no third-party profile content is
 * included.
 */
export function buildRestaurantJsonLd(menu: PublicMenu, options: { origin: string; locale: string; placeId?: string | null }) {
  const { location } = menu;
  const settings = location.serviceSettings ?? {};
  const url = `${options.origin.replace(/\/$/, "")}/${options.locale}/r/${location.slug ?? location.id}`;
  const openingHours = openingHoursSpecification(settings);

  const entity: JsonLd = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    "@id": `${url}#restaurant`,
    name: location.name,
    url,
    address: { "@type": "PostalAddress", streetAddress: location.address },
    currenciesAccepted: location.currency,
    hasMenu: `${url}/menu`,
    priceRange: priceRange(menu.items) ?? undefined,
    openingHoursSpecification: openingHours.length > 0 ? openingHours : undefined,
  };

  if (options.placeId) {
    // A link to the merchant's own public listing. The identifier is not
    // proof of anything and grants no access.
    (entity as Record<string, unknown>).sameAs = [`https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(options.placeId)}`];
  }
  if (typeof settings.delivery === "boolean" && settings.delivery) {
    (entity as Record<string, unknown>).hasDeliveryMethod = "https://purl.org/goodrelations/v1#DeliveryModePickup";
  }
  return entity;
}

/** The Menu entity, listing only the items the merchant published as available. */
export function buildMenuJsonLd(menu: PublicMenu) {
  const available = menu.items.filter((item) => item.available);
  if (available.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "Menu",
    "@id": `${menu.location.slug ?? menu.location.id}#menu`,
    name: `${menu.location.name} menu`,
    hasMenuSection: [...new Set(available.map((item) => item.category))].map((category) => ({
      "@type": "MenuSection",
      name: category,
      hasMenuItem: available
        .filter((item) => item.category === category)
        .map((item) => ({
          "@type": "MenuItem",
          name: item.name,
          description: item.description || undefined,
          offers: {
            "@type": "Offer",
            // Zero-decimal currencies (JPY, the CFA francs) must not show
            // fictional cents in structured data.
            price: (Number(item.amountMinor) / 10 ** exponent(item.currency)).toFixed(exponent(item.currency)),
            priceCurrency: item.currency,
            availability: "https://schema.org/InStock",
          },
        })),
    })),
  };
}

/**
 * A plain-text summary for systems that read text rather than markup.
 * It contains the same real data as the structured data and nothing more.
 */
export function buildPlainSummary(menu: PublicMenu, options: { origin: string; locale: string }): string {
  const { location } = menu;
  const lines: string[] = [];
  lines.push(`# ${location.name}`);
  lines.push("");
  lines.push(location.address);
  lines.push(`Currency: ${location.currency}`);
  const hours = openingHoursSpecification(location.serviceSettings);
  if (hours.length > 0) {
    lines.push("");
    lines.push("## Opening hours");
    for (const entry of hours) lines.push(`- ${entry.dayOfWeek.join(", ")}: ${entry.opens}–${entry.closes}`);
  }
  const available = menu.items.filter((item) => item.available);
  if (available.length > 0) {
    lines.push("");
    lines.push("## Menu");
    for (const item of available) {
      const amount = (Number(item.amountMinor) / 10 ** exponent(item.currency)).toFixed(2);
      const allergens = item.allergens.length > 0 ? ` (contains ${item.allergens.join(", ")})` : "";
      lines.push(`- ${item.name} — ${amount} ${item.currency}${allergens}${item.description ? ` — ${item.description}` : ""}`);
    }
  }
  lines.push("");
  lines.push(`${options.origin.replace(/\/$/, "")}/${options.locale}/r/${location.slug ?? location.id}`);
  return lines.join("\n");
}
