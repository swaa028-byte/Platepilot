/**
 * ESC/POS receipt rendering.
 *
 * Thermal receipt printers speak ESC/POS: a byte stream of escape commands and
 * text. Building it here means any POS receipt request returns bytes a real
 * printer accepts over a network or USB tunnel, with no driver in between.
 * The format details that matter: ESC @ resets, ESC a n sets justification,
 * GS V B 0 is a full cut, and columns are padded to 42 or 48 characters
 * depending on the printer width — 42 is the safe default.
 */

const INIT = [0x1b, 0x40];
const ALIGN_CENTER = [0x1b, 0x61, 0x31];
const ALIGN_LEFT = [0x1b, 0x61, 0x30];
const BOLD_ON = [0x1b, 0x45, 0x31];
const BOLD_OFF = [0x1b, 0x45, 0x30];
const FEED = [0x1b, 0x64, 0x05];
const CUT = [0x1d, 0x56, 0x42, 0x00];

const WIDTH = 42;

export type ReceiptOrder = {
  orderNumber: string;
  restaurantName: string;
  locationName: string;
  createdAt: string;
  currency: string;
  lines: Array<{ name: string; quantity: number; lineTotalMinor: number }>;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  serviceFeeMinor: number;
  deliveryFeeMinor: number;
  tipMinor: number;
  totalMinor: number;
  paymentStatus: string;
};

function money(minor: number, currency: string): string {
  const symbol = currencySymbol(currency);
  return `${symbol}${(minor / 100).toFixed(2)}`;
}

function currencySymbol(currency: string): string {
  // ESC/POS code pages differ per printer; ASCII prefixes are the portable
  // choice, so "EUR 12.00" prints correctly where "€" might not.
  const symbols: Record<string, string> = { USD: "$", EUR: "EUR ", GBP: "GBP ", ZAR: "R", JPY: "JPY ", NGN: "NGN ", KWD: "KD " };
  return symbols[currency] ?? `${currency} `;
}

function columns(left: string, right: string): string {
  const space = Math.max(1, WIDTH - left.length - right.length);
  return left + " ".repeat(space) + right;
}

function text(value: string): number[] {
  // ESC/POS code pages vary by printer; plain ASCII is the portable subset.
  return Array.from(value.replace(/[^\x20-\x7e]/g, "?"), (char) => char.charCodeAt(0));
}

export function buildEscPosReceipt(order: ReceiptOrder): Uint8Array {
  const bytes: number[] = [...INIT];
  const push = (...values: number[]) => bytes.push(...values);
  const line = (value: string) => push(...text(value), 0x0a);

  push(...ALIGN_CENTER, ...BOLD_ON);
  line(order.restaurantName.toUpperCase());
  push(...BOLD_OFF);
  if (order.locationName && order.locationName !== order.restaurantName) line(order.locationName);
  line("");
  push(...ALIGN_LEFT);
  line(`Order ${order.orderNumber.slice(0, 13)}`);
  line(new Date(order.createdAt).toISOString().replace("T", " ").slice(0, 19));
  line("-".repeat(WIDTH));
  for (const item of order.lines) {
    const name = item.name.length > WIDTH - 8 ? `${item.name.slice(0, WIDTH - 9)}…` : item.name;
    line(`${item.quantity} x ${name}`.padEnd(WIDTH - 10) + money(item.lineTotalMinor, order.currency).padStart(10));
  }
  line("-".repeat(WIDTH));
  if (order.discountMinor > 0) line(columns("Discount", `-${money(order.discountMinor, order.currency)}`));
  if (order.taxMinor > 0) line(columns("Tax", money(order.taxMinor, order.currency)));
  if (order.serviceFeeMinor > 0) line(columns("Service", money(order.serviceFeeMinor, order.currency)));
  if (order.deliveryFeeMinor > 0) line(columns("Delivery", money(order.deliveryFeeMinor, order.currency)));
  if (order.tipMinor > 0) line(columns("Tip", money(order.tipMinor, order.currency)));
  push(...BOLD_ON);
  line(columns("TOTAL", money(order.totalMinor, order.currency)));
  push(...BOLD_OFF);
  line(order.paymentStatus === "paid" ? "PAID" : "PAYMENT DUE");
  line("");
  push(...ALIGN_CENTER);
  line("Thank you");
  push(...FEED, ...CUT);
  return new Uint8Array(bytes);
}
