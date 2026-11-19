import { describe, expect, it } from "vitest";
import { parseCsv, parseMenuCsv } from "@/domain/menu";

describe("merchant CSV", () => {
  it("parses quoted cells and merchant-approved values", () => {
    const csv = 'category,item,amount,currency,description,allergens,available\n"Mains","Chef, special","12.50","USD","Line one","milk|wheat",true';
    expect(parseMenuCsv(csv)[0]).toMatchObject({ category: "Mains", item: "Chef, special", amountMinor: "1250", available: true, allergens: ["milk", "wheat"] });
  });
  it("defaults missing availability to unavailable, not invented stock", () => {
    expect(parseMenuCsv("category,item,amount,currency\nA,B,1.00,USD")[0].available).toBe(false);
  });
  it("rejects mixed currencies, duplicate items and malformed quotes", () => {
    expect(() => parseMenuCsv("category,item,amount,currency\nA,B,1,USD\nA,C,1,EUR")).toThrow("MIXED_IMPORT_CURRENCIES");
    expect(() => parseMenuCsv("category,item,amount,currency\nA,B,1,USD\nA,B,2,USD")).toThrow("DUPLICATE_MENU_ITEM");
    expect(() => parseCsv('a,"unclosed')).toThrow("UNCLOSED_CSV_QUOTE");
  });
});
