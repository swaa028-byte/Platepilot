"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  BarChart3, ChefHat, LayoutGrid, Map, QrCode, Settings, ArrowUpRight,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/brand/Logo";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";

const SERVICE = [
  { root: "operations", href: "/operations", labelKey: "operations", Icon: LayoutGrid },
  { root: "floor-planner", href: "/floor-planner", labelKey: "liveFloor", Icon: Map },
  { root: "kitchen", href: "/kitchen", labelKey: "kitchen", Icon: ChefHat },
  { root: "qr-codes", href: "/qr-codes", labelKey: "tableCodes", Icon: QrCode },
  { root: "reports", href: "/reports", labelKey: "reports", Icon: BarChart3 },
] as const;

/**
 * The operator shell: a station rail (what is running) and a ruled working
 * surface (what you are looking at). The rail collapses to a scrolling
 * platform strip on small screens rather than hiding the destinations.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const t = useTranslations("Header");
  const segments = pathname.split("/").filter(Boolean);
  const root = segments[1] ?? "operations";
  const current = [...SERVICE, { root: "settings", labelKey: "settings" as const }].find((item) => item.root === root);
  const label = current ? t(current.labelKey) : t("operations");

  return (
    <div className="app-shell">
      <aside className="app-rail" aria-label={t("product")}>
        <div className="app-rail__brand-label">
          <Logo inverse />
        </div>
        <div className="app-rail__group">
          <p className="app-rail__label">{t("product")}</p>
          {SERVICE.map(({ root: key, href, labelKey, Icon }) => (
            <Link key={key} href={href} className={`app-rail__link ${root === key ? "is-active" : ""}`} aria-current={root === key ? "page" : undefined}>
              <Icon size={16} aria-hidden="true" />
              {t(labelKey)}
            </Link>
          ))}
          <Link href="/settings" className={`app-rail__link ${root === "settings" ? "is-active" : ""}`} aria-current={root === "settings" ? "page" : undefined}>
            <Settings size={16} aria-hidden="true" />
            {t("settings")}
          </Link>
        </div>
        <div className="app-rail__foot">
          <LanguageSwitcher compact />
          <Link href="/" className="app-rail__site">
            {t("findUs")} <ArrowUpRight size={13} aria-hidden="true" />
          </Link>
        </div>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <div className="app-topbar__where">
            <span className="app-topbar__crumb">PlatePilot</span>
            <span className="app-topbar__section">{label}</span>
          </div>
          <div className="app-topbar__tools">
            <span className="app-topbar__live"><i />{t("liveFloor")}</span>
            <Link href="/login" className="text-link">{t("signIn")}</Link>
          </div>
        </header>
        <main id="main-content">{children}</main>
      </div>
    </div>
  );
}