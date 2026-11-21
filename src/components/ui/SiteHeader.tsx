"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/brand/Logo";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function SiteHeader() {
  const t = useTranslations("Header");
  const [open, setOpen] = useState(false);

  return (
    <>
    <header className="site-header">
      <div className="shell header-inner">
        <Logo />
        <button
          type="button"
          className="icon-button mobile-menu-button"
          aria-expanded={open}
          aria-controls="main-navigation"
          aria-label={open ? t("close") : t("menu")}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X size={21} /> : <Menu size={21} />}
        </button>
        <div id="main-navigation" className={`header-navigation ${open ? "is-open" : ""}`}>
          <nav className="main-nav" aria-label="Main navigation">
            <Link href="/#product" onClick={() => setOpen(false)}>{t("product")}</Link>
            <Link href="/operations" onClick={() => setOpen(false)}>{t("operations")}</Link>
            <Link href="/floor-planner" onClick={() => setOpen(false)}>{t("liveFloor")}</Link>
            <Link href="/kitchen" onClick={() => setOpen(false)}>{t("kitchen")}</Link>
            <Link href="/qr-codes" onClick={() => setOpen(false)}>{t("tableCodes")}</Link>
            <Link href="/reports" onClick={() => setOpen(false)}>{t("reports")}</Link>
            <Link href="/settings" onClick={() => setOpen(false)}>{t("settings")}</Link>
            <Link href="/locations" onClick={() => setOpen(false)}>{t("findUs")}</Link>
            <Link href="/#security" onClick={() => setOpen(false)}>{t("security")}</Link>
          </nav>
          <div className="header-actions">
            <LanguageSwitcher compact />
            <Link className="text-link sign-in-link" href="/login">{t("signIn")}</Link>
            <Link className="button button--small" href="/onboarding">
              {t("start")}<ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </header>
    {open && <button type="button" className="nav-backdrop" aria-label={t("close")} onClick={() => setOpen(false)} />}
    </>
  );
}
