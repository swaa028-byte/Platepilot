import { ArrowRight, Check, Globe, Languages, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buildPageMetadata } from "@/domain/seo";

export const dynamic = "force-static";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "WhiteLabelPage" });
  return buildPageMetadata({ locale, title: t("title"), description: t("lede"), path: "white-label" });
}

export default async function WhiteLabelPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("WhiteLabelPage");
  const h = await getTranslations("Home");

  const points = [
    { icon: Globe, title: t("point1Title"), body: t("point1Body") },
    { icon: ShieldCheck, title: t("point2Title"), body: t("point2Body") },
    { icon: MonitorSmartphone, title: t("point3Title"), body: t("point3Body") },
    { icon: Languages, title: t("point4Title"), body: t("point4Body") },
  ];

  return (
    <>
      <section className="info-hero">
        <div className="shell">
          <p className="eyebrow"><span />{t("eyebrow")}</p>
          <h1>{t("title")}</h1>
          <p className="cw-lede">{t("lede")}</p>
        </div>
      </section>

      <section className="info-section info-section--tint">
        <div className="shell">
          <div className="info-grid info-grid--two">
            {points.map((point) => {
              const Icon = point.icon;
              return (
                <div className="info-card info-card--icon" key={point.title}>
                  <span className="info-card-icon"><Icon size={21} /></span>
                  <div><h3>{point.title}</h3><p>{point.body}</p></div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="info-section">
        <div className="shell">
          <h2>{h("securityTitle")}</h2>
          <p className="info-lede">{h("securityBody")}</p>
          <ul className="belief-list">
            {[h("stripOne"), h("stripTwo"), h("stripThree")].map((item) => (
              <li key={item}><Check size={17} />{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="closing-section">
        <div className="shell closing-inner">
          <p className="eyebrow eyebrow--light eyebrow--center"><span />PLATEPILOT</p>
          <h2>{t("ctaTitle")}</h2>
          <p>{t("ctaBody")}</p>
          <Link href="/onboarding" className="button button--light button--hero">{h("primaryCta")}<ArrowRight size={18} /></Link>
        </div>
      </section>
    </>
  );
}
