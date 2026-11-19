import { addMoney, fromMinor, multiplyMoney, type Money } from "./money";

export type PricedSelection = { unitPrice: Money; quantity: number };
export type QuoteInput = {
  items: readonly PricedSelection[];
  taxBasisPoints?: number;
  discount?: Money;
  tip?: Money;
  serviceFee?: Money;
};

export type Quote = {
  currency: Money["currency"];
  subtotal: Money;
  discount: Money;
  taxable: Money;
  tax: Money;
  serviceFee: Money;
  tip: Money;
  total: Money;
};

function sameCurrency(value: Money, currency: Money["currency"]) {
  if (value.currency !== currency) throw new Error("CURRENCY_MISMATCH");
  return value;
}

export function calculateQuote(input: QuoteInput): Quote {
  if (input.items.length === 0) throw new Error("EMPTY_ORDER");
  const currency = input.items[0].unitPrice.currency;
  const zero = fromMinor(0n, currency);
  const subtotal = input.items.reduce(
    (sum, item) => addMoney(sum, multiplyMoney(sameCurrency(item.unitPrice, currency), item.quantity)),
    zero,
  );
  const discount = sameCurrency(input.discount ?? zero, currency);
  if (discount.minor > subtotal.minor) throw new Error("DISCOUNT_EXCEEDS_SUBTOTAL");
  const taxable = fromMinor(subtotal.minor - discount.minor, currency);
  const basisPoints = input.taxBasisPoints ?? 0;
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    throw new Error("INVALID_TAX_RATE");
  }
  // Half-up minor-unit rounding is explicit and deterministic.
  const taxMinor = (taxable.minor * BigInt(basisPoints) + 5_000n) / 10_000n;
  const tax = fromMinor(taxMinor, currency);
  const serviceFee = sameCurrency(input.serviceFee ?? zero, currency);
  const tip = sameCurrency(input.tip ?? zero, currency);
  const total = [tax, serviceFee, tip].reduce<Money>((sum, value) => addMoney(sum, value), taxable);
  return { currency, subtotal, discount, taxable, tax, serviceFee, tip, total };
}
