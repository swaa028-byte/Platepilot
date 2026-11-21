import { describe, expect, it } from "vitest";
import {
  buildMenuJsonLd,
  buildPlainSummary,
  buildRestaurantJsonLd,
  openingHoursSpecification,
  priceRange,
  type PublicMenu,
} from "@/domain/seo";

const menu: PublicMenu = {
  location: {
    id: "loc-1",
    slug: "the-local-cafe",
    name: "The Local Cafe",
    address: "1 Loop Street, Cape Town",
    timezone: "Africa/Johannesburg",
    currency: "ZAR",
    serviceSettings: {
      openingHours: {
        "1": [["09:00", "17:00"]],
        "2": [["09:00", "17:00"], ["18:00", "21:00"]],
        "6": [["20:00", "23:00"]],
      },
    },
  },
  items: [
    { id: "i1", name: "Bunny chow", description: "Curry in a hollowed loaf", allergens: ["gluten"], category: "Mains", amountMinor: "9500", currency: "ZAR", available: true, imageUrl: "/images/menu/bunny-chow.jpg" },
    { id: "i2", name: "Rooibos", description: "", allergens: [], category: "Drinks", amountMinor: "3500", currency: "ZAR", available: true, imageUrl: null },
    { id: "i3", name: "Sold out breakfast", description: "", allergens: [], category: "Mains", amountMinor: "1000", currency: "ZAR", available: false, imageUrl: null },
  ],
};

describe("opening hours", () => {
  it("maps the declared weekly windows onto named days", () => {
    const hours = openingHoursSpecification(menu.location.serviceSettings);
    expect(hours).toContainEqual({ "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday"], opens: "09:00", closes: "17:00" });
    expect(hours).toContainEqual({ "@type": "OpeningHoursSpecification", dayOfWeek: ["Tuesday"], opens: "18:00", closes: "21:00" });
  });

  it("splits a window that crosses midnight into the two days it covers", () => {
    const hours = openingHoursSpecification({ openingHours: { "6": [["20:00", "02:00"]] } });
    expect(hours).toEqual([
      { "@type": "OpeningHoursSpecification", dayOfWeek: ["Saturday"], opens: "20:00", closes: "23:59" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: ["Sunday"], opens: "00:00", closes: "02:00" },
    ]);
  });

  it("returns nothing when the merchant has not declared hours", () => {
    expect(openingHoursSpecification(null)).toEqual([]);
    expect(openingHoursSpecification({})).toEqual([]);
    expect(openingHoursSpecification({ openingHours: {} })).toEqual([]);
  });

  it("ignores a malformed window rather than reporting a wrong one", () => {
    expect(openingHoursSpecification({ openingHours: { "9": [["09:00", "17:00"]] } })).toEqual([]);
    expect(openingHoursSpecification({ openingHours: { "1": [["09:00"]] } })).toEqual([]);
    expect(openingHoursSpecification({ openingHours: { "1": [["09:00", "09:00"]] } })).toEqual([]);
  });
});

describe("price range", () => {
  it("derives the range from the published, available items only", () => {
    expect(priceRange(menu.items)).toBe("R35–R95");
  });

  it("uses the currency's own minor unit", () => {
    expect(priceRange([{ ...menu.items[0], amountMinor: "1200", currency: "JPY" }])).toBe("¥1200");
    expect(priceRange([{ ...menu.items[0], amountMinor: "1234", currency: "KWD" }])).toBe("KD1.23");
  });

  it("does not invent a range when nothing is published", () => {
    expect(priceRange([])).toBeNull();
    expect(priceRange([{ ...menu.items[0], available: false }])).toBeNull();
  });
});

describe("structured data", () => {
  it("describes the restaurant and links only its own listing", () => {
    const ld = buildRestaurantJsonLd(menu, { origin: "https://example.test", locale: "en", placeId: "ChIJ123" });
    expect(ld["@type"]).toBe("Restaurant");
    expect(ld.name).toBe("The Local Cafe");
    expect(ld.currenciesAccepted).toBe("ZAR");
    expect(ld.priceRange).toBe("R35–R95");
    expect((ld.address as { streetAddress: string }).streetAddress).toBe("1 Loop Street, Cape Town");
    expect(JSON.stringify(ld.sameAs)).toContain("query_place_id=ChIJ123");
  });

  it("omits opening hours and the price range when the merchant supplied neither", () => {
    const bare: PublicMenu = { ...menu, location: { ...menu.location, serviceSettings: {} } };
    const ld = buildRestaurantJsonLd(bare, { origin: "https://example.test", locale: "en" });
    expect(ld.openingHoursSpecification).toBeUndefined();
  });

  it("lists only available items in the menu", () => {
    const ld = buildMenuJsonLd(menu) as { hasMenuSection: { name: string; hasMenuItem: { name: string; offers: { price: string; priceCurrency: string } }[] }[] };
    const names = ld.hasMenuSection.flatMap((section) => section.hasMenuItem.map((item) => item.name));
    expect(names).toContain("Bunny chow");
    expect(names).not.toContain("Sold out breakfast");
    const mains = ld.hasMenuSection.find((section) => section.name === "Mains");
    expect(mains?.hasMenuItem[0].offers.price).toBe("95.00");
    expect(mains?.hasMenuItem[0].offers.priceCurrency).toBe("ZAR");
  });

  it("produces no menu entity when nothing is available", () => {
    const empty: PublicMenu = { ...menu, items: menu.items.map((item) => ({ ...item, available: false })) };
    expect(buildMenuJsonLd(empty)).toBeNull();
  });
});

describe("plain text summary", () => {
  it("states only published information", () => {
    const text = buildPlainSummary(menu, { origin: "https://example.test", locale: "en" });
    expect(text).toContain("The Local Cafe");
    expect(text).toContain("1 Loop Street, Cape Town");
    expect(text).toContain("95.00 ZAR");
    expect(text).toContain("contains gluten");
    expect(text).not.toContain("Sold out breakfast");
  });
});
