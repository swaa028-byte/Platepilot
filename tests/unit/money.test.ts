import { describe, expect, it } from "vitest";
import { addMoney, formatMoney, moneyToJSON, parseMoney } from "@/domain/money";
import { calculateQuote } from "@/domain/pricing";

describe("exact money", () => {
  it("handles zero-decimal JPY and three-decimal KWD", () => {
    expect(moneyToJSON(parseMoney("1200", "JPY"))).toEqual({ currency: "JPY", amountMinor: "1200" });
    expect(moneyToJSON(parseMoney("1.234", "KWD"))).toEqual({ currency: "KWD", amountMinor: "1234" });
    expect(() => parseMoney("1.1", "JPY")).toThrow("INVALID_PRECISION");
    expect(() => parseMoney("1.23", "KWD")).not.toThrow();
  });
  it("rejects mixed currencies, negative amounts and excess precision", () => {
    expect(() => addMoney(parseMoney("1", "USD"), parseMoney("1", "EUR"))).toThrow("CURRENCY_MISMATCH");
    expect(() => parseMoney("-1", "USD")).toThrow("INVALID_CANONICAL_AMOUNT");
    expect(() => parseMoney("0.001", "USD")).toThrow("INVALID_PRECISION");
  });
  it("serializes bigint minor units without JSON loss", () => {
    expect(JSON.stringify(moneyToJSON(parseMoney("92233720368547758.07", "USD")))).toContain("9223372036854775807");
  });
  it("formats without using bigint as a floating point intermediate", () => {
    expect(formatMoney(parseMoney("12.34", "USD"), "en-US")).toContain("12.34");
  });
});

describe("server quote rules", () => {
  it("calculates tax, fees and tip in one currency", () => {
    const quote = calculateQuote({ items: [{ unitPrice: parseMoney("10.00", "USD"), quantity: 2 }], taxBasisPoints: 875, tip: parseMoney("1.00", "USD") });
    expect(quote.tax.minor).toBe(175n);
    expect(quote.total.minor).toBe(2275n);
  });
  it("rejects cross-currency tips and excess discounts", () => {
    const items = [{ unitPrice: parseMoney("10.00", "USD"), quantity: 1 }];
    expect(() => calculateQuote({ items, tip: parseMoney("1.00", "EUR") })).toThrow("CURRENCY_MISMATCH");
    expect(() => calculateQuote({ items, discount: parseMoney("11.00", "USD") })).toThrow("DISCOUNT_EXCEEDS_SUBTOTAL");
  });
});
