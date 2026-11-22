"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpRight, ChevronDown, Menu, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/brand/Logo";
import { LanguageSwitcher } from "./LanguageSwitcher";

type MenuId = "product" | "resources" | null;

/**
 * Site header, modelled on CloudWaitress's: brand at the left, two grouped
 * dropdown menus (Product, Resources), and the language switcher, sign-in
 * link and the accent CTA at the right. Dropdowns follow the disclosure
 * pattern: a real button with aria-expanded, closed by Escape or a click
 * outside, and every destination stays a plain link so it works without
 * JavaScript.
 */
export function SiteHeader() {
  const t = useTranslations("Header");
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<MenuId>(null);
  const navRef = useRef<HTMLDivElement>(null);

  const productItems: { href: string; label: string }[] = [
    { href: "/operations", label: t("operations") },
    { href: "/floor-planner", label: t("liveFloor") },
    { href: "/kitchen", label: t("kitchen") },
    { href: "/qr-codes", label: t("tableCodes") },
    { href: "/reports", label: t("reports") },
    { href: "/settings", label: t("settings") },
  ];
  const resourceItems: { href: string; label: string }[] = [
    { href: "/locations", label: t("findUs") },
    { href: "/security", label: t("security") },
  ];

  // Close a dropdown when the pointer goes down outside of the navigation,
  // or when Escape is pressed anywhere.
  useEffect(() => {
    if (!menu) return;
    function onPointerDown(event: PointerEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) setMenu(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menu]);

  function closeAll() {
    setOpen(false);
    setMenu(null);
  }

  function renderGroup(id: Exclude<MenuId, null>, label: string, items: { href: string; label: string }[]) {
    const expanded = menu === id;
    return (
      <div className="nav-group">
        <button
          type="button"
          className="nav-drop-btn"
          aria-expanded={expanded}
          aria-haspopup="true"
          onClick={() => setMenu(expanded ? null : id)}
        >
          {label}
          <ChevronDown size={15} aria-hidden="true" />
        </button>
        <div className={`nav-drop ${expanded ? "is-open" : ""}`}>
          {items.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setMenu(null)}>{item.label}</Link>
          ))}
        </div>
      </div>
    );
  }

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
            {/* Desktop: grouped dropdowns, CloudWaitress-style. */}
            <nav ref={navRef} className="main-nav main-nav--drop" aria-label="Main navigation">
              {renderGroup("product", t("product"), productItems)}
              {renderGroup("resources", t("resources"), resourceItems)}
            </nav>
            {/* Mobile: one flat list; the whole panel is already toggled. */}
            <nav className="main-nav main-nav--flat" aria-label="Main navigation">
              <Link href="/#product" onClick={closeAll}>{t("product")}</Link>
              <Link href="/operations" onClick={closeAll}>{t("operations")}</Link>
              <Link href="/floor-planner" onClick={closeAll}>{t("liveFloor")}</Link>
              <Link href="/kitchen" onClick={closeAll}>{t("kitchen")}</Link>
              <Link href="/qr-codes" onClick={closeAll}>{t("tableCodes")}</Link>
              <Link href="/reports" onClick={closeAll}>{t("reports")}</Link>
              <Link href="/settings" onClick={closeAll}>{t("settings")}</Link>
              <Link href="/locations" onClick={closeAll}>{t("findUs")}</Link>
              <Link href="/#security" onClick={closeAll}>{t("security")}</Link>
            </nav>
            <div className="header-actions">
              <LanguageSwitcher compact />
              <Link className="text-link sign-in-link" href="/login" onClick={closeAll}>{t("signIn")}</Link>
              <Link className="button button--small" href="/onboarding" onClick={closeAll}>
                {t("start")}<ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </header>
      {open && <button type="button" className="nav-backdrop" aria-label={t("close")} onClick={closeAll} />}
    </>
  );
}
