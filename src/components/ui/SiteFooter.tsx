import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/brand/Logo";
import { LanguageSwitcher } from "./LanguageSwitcher";

/**
 * Footer on the reference-site pattern: brand column plus three link
 * columns (the ordering system, the product, and support), with the
 * language switcher and the legal line below. Every link points at a page
 * or section that actually exists in the app.
 */
export function SiteFooter() {
  const t = useTranslations("Footer");
  return (
    <footer className="site-footer">
      <div className="shell footer-grid">
        <div className="footer-brand">
          <Logo inverse />
          <p>{t("tagline")}</p>
          <span className="footer-status"><i />{t("status")}</span>
        </div>
        <div className="footer-links">
          <strong>{t("orderingSystem")}</strong>
          <Link href="/locations">{t("pickup")}</Link>
          <Link href="/locations">{t("delivery")}</Link>
          <Link href="/#product">{t("dineIn")}</Link>
          <Link href="/#product">{t("reservations")}</Link>
        </div>
        <div className="footer-links">
          <strong>{t("product")}</strong>
          <Link href="/features">{t("features")}</Link>
          <Link href="/pricing">{t("pricing")}</Link>
          <Link href="/how-it-works">{t("howItWorks")}</Link>
          <Link href="/integrations">{t("integrations")}</Link>
          <Link href="/white-label">{t("whiteLabel")}</Link>
        </div>
        <div className="footer-links">
          <strong>{t("support")}</strong>
          <Link href="/about">{t("about")}</Link>
          <Link href="/about#contact">{t("contact")}</Link>
          <Link href="/security">{t("securityPage")}</Link>
          <Link href="/locations">{t("locations")}</Link>
          <a href="https://github.com/MarcusK-ai/rea-cloudwaitress">{t("docs")}</a>
          <Link href="/login">{t("signIn")}</Link>
        </div>
        <div className="footer-locale"><LanguageSwitcher /></div>
      </div>
      <div className="shell footer-bottom">
        <span>© {new Date().getFullYear()} PlatePilot</span>
        <span>{t("workingBrand")}</span>
      </div>
    </footer>
  );
}
