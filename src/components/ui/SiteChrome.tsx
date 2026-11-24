"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { Logo } from "@/components/brand/Logo";
import { AppShell } from "@/components/app/AppShell";

/**
 * Route-aware chrome. Marketing pages keep the signage bar and the ink mast;
 * the operator pages get the station rail; sign-in and setup get one quiet
 * bar so the task owns the screen; a guest storefront supplies its own header.
 */
export function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const t = useTranslations("Header");
  const segments = pathname.split("/").filter(Boolean);
  const root = segments[1] ?? "";

  if (root === "r") return <>{children}</>;

  if (["operations", "kitchen", "floor-planner", "settings", "reports", "qr-codes", "orders"].includes(root)) {
    return <AppShell>{children}</AppShell>;
  }

  if (root === "login" || root === "start" || root === "onboarding") {
    return (
      <>
        <a href="#main-content" className="skip-link">Skip to content</a>
        <header className="auth-bar">
          <div className="shell auth-bar__inner">
            <Logo />
            <div className="auth-bar__tools">
              <LanguageSwitcher compact />
              <Link className="auth-bar__exit" href="/">{t("product")} →</Link>
            </div>
          </div>
        </header>
        <main id="main-content">{children}</main>
      </>
    );
  }

  return (
    <>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <SiteHeader />
      <main id="main-content">{children}</main>
      <SiteFooter />
    </>
  );
}
