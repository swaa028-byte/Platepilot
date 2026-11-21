export const currencyExponents = {
  USD: 2, EUR: 2, GBP: 2, ZAR: 2, CAD: 2, AUD: 2,
  NGN: 2, KES: 2, JPY: 0, KWD: 3,
  // The CFA franc is issued in two zones with fixed parity and no decimals:
  // XOF (West Africa) and XAF (Central Africa — Cameroon, Congo, …).
  XOF: 0, XAF: 0,
} as const;

export type Currency = keyof typeof currencyExponents;
export type Money = Readonly<{ currency: Currency; minor: bigint }>;
const MAX_INT64 = 9_223_372_036_854_775_807n;

export function assertCurrency(code: string): asserts code is Currency {
  if (!Object.prototype.hasOwnProperty.call(currencyExponents, code)) {
    throw new Error("UNSUPPORTED_CURRENCY");
  }
}

export function parseMoney(input: string, code: string): Money {
  assertCurrency(code);
  if (input.length > 32 || !/^(0|[1-9]\d*)(\.\d+)?$/.test(input)) {
    throw new Error("INVALID_CANONICAL_AMOUNT");
  }
  const exponent = currencyExponents[code];
  const [whole, fraction = ""] = input.split(".");
  if (fraction.length > exponent) throw new Error("INVALID_PRECISION");
  const minor = BigInt(whole + fraction.padEnd(exponent, "0"));
  if (minor > MAX_INT64) throw new Error("AMOUNT_OUT_OF_RANGE");
  return { currency: code, minor };
}

export function fromMinor(minor: bigint, code: string): Money {
  assertCurrency(code);
  if (minor < 0n || minor > MAX_INT64) throw new Error("AMOUNT_OUT_OF_RANGE");
  return { currency: code, minor };
}

export function addMoney(left: Money, right: Money): Money {
  if (left.currency !== right.currency) throw new Error("CURRENCY_MISMATCH");
  return fromMinor(left.minor + right.minor, left.currency);
}

export function multiplyMoney(money: Money, quantity: number): Money {
  if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > 10_000) {
    throw new Error("INVALID_QUANTITY");
  }
  return fromMinor(money.minor * BigInt(quantity), money.currency);
}

export function formatMoney({ currency, minor }: Money, locale = "en") {
  const exponent = currencyExponents[currency];
  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  const divisor = 10n ** BigInt(exponent);
  const whole = absolute / divisor;
  const fraction = absolute % divisor;
  const amount = `${negative ? "-" : ""}${whole}${exponent ? `.${fraction.toString().padStart(exponent, "0")}` : ""}`;
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(Number(amount));
}

export function moneyToJSON({ currency, minor }: Money) {
  return { currency, amountMinor: minor.toString() };
}
