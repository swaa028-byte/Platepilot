import { useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/brand/Logo";
import { LanguageSwitcher } from "./LanguageSwitcher";

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
          <strong>{t("product")}</strong>
          <Link href="/onboarding">{t("onboarding")}</Link>
          <Link href="/floor-planner">{t("floor")}</Link>
          <Link href="/operations">{t("operations")}</Link>
        </div>
        <div className="footer-links">
          <strong>{t("resources")}</strong>
          <a href="https://github.com/MarcusK-ai/rea-cloudwaitress">{t("repository")}<ArrowUpRight size={13} /></a>
          <Link href="/login">{t("signIn")}</Link>
          <a href="mailto:privacy@example.invalid">{t("privacy")}</a>
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
