"use client";

import { useLocale } from "next-intl";
import { Languages } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type AppLocale } from "@/i18n/routing";

const names: Record<AppLocale, string> = {
  en: "English",
  fr: "Français",
  es: "Español",
  pt: "Português",
  ar: "العربية",
};

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const locale = useLocale() as AppLocale;
  const pathname = usePathname();
  const router = useRouter();

  return (
    <label className={`language-switcher ${compact ? "language-switcher--compact" : ""}`}>
      <Languages size={16} aria-hidden="true" />
      <span className="sr-only">Language / Langue / Idioma / Idioma / اللغة</span>
      <select
        value={locale}
        onChange={(event) => router.replace(pathname, { locale: event.target.value })}
        aria-label="Language"
      >
        {routing.locales.map((item) => (
          <option key={item} value={item}>
            {names[item]}
          </option>
        ))}
      </select>
    </label>
  );
}
