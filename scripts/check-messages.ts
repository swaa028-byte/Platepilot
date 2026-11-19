import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const locales = ["en", "fr", "es", "pt", "ar"] as const;
const messagesDir = resolve(process.cwd(), "messages");

type Messages = Record<string, unknown>;

function flatten(value: Messages, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === "object" && !Array.isArray(child)
      ? flatten(child as Messages, path)
      : [path];
  });
}

async function main() {
  const catalogs = new Map<string, Set<string>>();
  for (const locale of locales) {
    const source = await readFile(resolve(messagesDir, `${locale}.json`), "utf8");
    const parsed = JSON.parse(source) as Messages;
    catalogs.set(locale, new Set(flatten(parsed)));
  }

  const reference = catalogs.get("en")!;
  let failed = false;
  for (const locale of locales) {
    const current = catalogs.get(locale)!;
    const missing = [...reference].filter((key) => !current.has(key));
    const extra = [...current].filter((key) => !reference.has(key));
    if (missing.length || extra.length) {
      failed = true;
      console.error(`${locale}: missing=[${missing.join(", ")}] extra=[${extra.join(", ")}]`);
    }
  }

  if (failed) process.exit(1);
  console.log(`Translation catalogs OK: ${locales.join(", ")} (${reference.size} messages each).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "MESSAGE_CHECK_FAILED");
  process.exitCode = 1;
});
