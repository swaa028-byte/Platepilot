import { z } from "zod";
import { moneyToJSON, parseMoney, type Currency } from "./money";

export const menuItemSchema = z.object({
  category: z.string().trim().min(1).max(100),
  item: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).default(""),
  allergens: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  available: z.boolean().default(false),
  currency: z.string(),
  amountMinor: z.string().regex(/^(0|[1-9]\d*)$/),
});
export type ImportedMenuItem = z.infer<typeof menuItemSchema>;

export function parseCsv(source: string): string[][] {
  if (source.length > 2_000_000) throw new Error("CSV_TOO_LARGE");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') {
      if (cell.length > 0) throw new Error("INVALID_CSV_QUOTE");
      quoted = true;
    } else if (char === "," || char === "\n" || char === "\r") {
      row.push(cell); cell = "";
      if (char !== ",") {
        if (char === "\r" && source[index + 1] === "\n") index += 1;
        if (row.some((value) => value.trim() !== "")) rows.push(row);
        row = [];
      }
    } else cell += char;
  }
  if (quoted) throw new Error("UNCLOSED_CSV_QUOTE");
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

function booleanCell(value: string | undefined) {
  if (value === undefined || value.trim() === "") return false;
  if (["true", "yes", "1"].includes(value.trim().toLowerCase())) return true;
  if (["false", "no", "0"].includes(value.trim().toLowerCase())) return false;
  throw new Error("INVALID_AVAILABILITY");
}

export function parseMenuCsv(source: string): ImportedMenuItem[] {
  const rows = parseCsv(source.replace(/^\uFEFF/, ""));
  const headers = rows.shift()?.map((value) => value.trim().toLowerCase()) ?? [];
  for (const required of ["category", "item", "amount", "currency"]) {
    if (!headers.includes(required)) throw new Error(`MISSING_COLUMN_${required.toUpperCase()}`);
  }
  if (rows.length === 0 || rows.length > 500) throw new Error("INVALID_MENU_ROW_COUNT");
  const items = rows.map((values) => {
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""]));
    const money = parseMoney(record.amount, record.currency.toUpperCase());
    return menuItemSchema.parse({
      category: record.category,
      item: record.item,
      description: record.description || "",
      allergens: record.allergens ? record.allergens.split("|").map((value) => value.trim()).filter(Boolean) : [],
      available: booleanCell(record.available),
      ...moneyToJSON(money),
    });
  });
  const currencies = new Set(items.map((item) => item.currency));
  if (currencies.size !== 1) throw new Error("MIXED_IMPORT_CURRENCIES");
  const unique = new Set(items.map((item) => `${item.category.toLowerCase()}\u0000${item.item.toLowerCase()}`));
  if (unique.size !== items.length) throw new Error("DUPLICATE_MENU_ITEM");
  return items;
}

export function displayMinorAmount(amountMinor: string, currency: string) {
  const money = parseMoney("0", currency);
  const value = BigInt(amountMinor);
  const exponent = currency === "JPY" ? 0 : currency === "KWD" ? 3 : 2;
  const divisor = 10n ** BigInt(exponent);
  return `${value / divisor}${exponent ? `.${(value % divisor).toString().padStart(exponent, "0")}` : ""} ${money.currency as Currency}`;
}
