import { ArrowRight, Check, Mail } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buildPageMetadata } from "@/domain/seo";

export const dynamic = "force-static";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "AboutPage" });
  return buildPageMetadata({ locale, title: t("title"), description: t("lede"), path: "about" });
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("AboutPage");
  const h = await getTranslations("Home");

  const beliefs = [t("belief1"), t("belief2"), t("belief3"), t("belief4")];

  return (
    <>
      <section className="info-hero">
        <div className="shell">
          <h1>{t("title")}</h1>
          <p className="cw-lede">{t("lede")}</p>
        </div>
      </section>

      <section className="info-section info-section--tint">
        <div className="shell">
          <h2>{t("whatTitle")}</h2>
          <p className="info-lede">{t("whatBody")}</p>
        </div>
      </section>

      <section className="info-section">
        <div className="shell">
          <h2>{t("beliefTitle")}</h2>
          <ul className="belief-list">
            {beliefs.map((belief) => (
              <li key={belief}><Check size={17} />{belief}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="closing-section" id="contact">
        <div className="shell closing-inner">
          <h2>{t("contactTitle")}</h2>
          <p>{t("contactBody")}</p>
          <div className="button-row">
            <a className="button button--light" href="mailto:team@platepilot.local"><Mail size={17} />{t("contactCta")}</a>
            <Link className="button button--outline-light" href="/security">{h("securityCta")}<ArrowRight size={16} /></Link>
          </div>
        </div>
      </section>
    </>
  );
}