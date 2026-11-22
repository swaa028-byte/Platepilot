import { describe, expect, it } from "vitest";
import { PAYSTACK_CURRENCIES, paystackSupportsCurrency } from "@/server/payments/paystack";

/**
 * Paystack settles in NGN, USD, GHS, ZAR and KES only (their API reference).
 * The CFA francs — the currency a Cameroon restaurant prices in — are not
 * supported, and the initialize call must say so plainly instead of letting a
 * provider reject it.
 */
describe("paystack currency support", () => {
  it("accepts the currencies Paystack actually processes", () => {
    for (const currency of ["NGN", "USD", "GHS", "ZAR", "KES"]) {
      expect(paystackSupportsCurrency(currency)).toBe(true);
      expect(paystackSupportsCurrency(currency.toLowerCase())).toBe(true);
    }
  });

  it("rejects the CFA francs and anything else", () => {
    for (const currency of ["XAF", "XOF", "EUR", "GBP", ""]) {
      expect(paystackSupportsCurrency(currency)).toBe(false);
    }
  });

  it("publishes the list the error message quotes", () => {
    expect(PAYSTACK_CURRENCIES.join("/")).toBe("NGN/USD/GHS/ZAR/KES");
  });
});
