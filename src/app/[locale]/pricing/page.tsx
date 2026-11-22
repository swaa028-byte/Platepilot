import { ArrowRight, BadgeCheck, Check, Wallet } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buildPageMetadata } from "@/domain/seo";

export const dynamic = "force-static";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Pricing" });
  return buildPageMetadata({ locale, title: t("title"), description: t("lede"), path: "pricing" });
}

export default async function PricingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Pricing");
  const h = await getTranslations("Home");

  const included = [t("inc1"), t("inc2"), t("inc3"), t("inc4"), t("inc5"), t("inc6")];
  const costs = [
    { icon: Wallet, label: t("cost1Label"), body: t("cost1Body") },
    { icon: BadgeCheck, label: t("cost2Label"), body: t("cost2Body") },
    { icon: Check, label: t("cost3Label"), body: t("cost3Body") },
  ];
  const rows = [
    [t("cmp1"), t("cmp1a"), t("cmp1b")],
    [t("cmp2"), t("cmp2a"), t("cmp2b")],
    [t("cmp3"), t("cmp3a"), t("cmp3b")],
    [t("cmp4"), t("cmp4a"), t("cmp4b")],
    [t("cmp5"), t("cmp5a"), t("cmp5b")],
  ];
  const faqs = [
    { q: h("faqOneQ"), a: h("faqOneA") },
    { q: h("faqTwoQ"), a: h("faqTwoA") },
    { q: h("faqThreeQ"), a: h("faqThreeA") },
    { q: h("faqFourQ"), a: h("faqFourA") },
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
          <h2>{t("includedTitle")}</h2>
          <p className="info-lede">{t("includedBody")}</p>
          <div className="info-grid info-grid--two">
            {included.map((item) => (
              <div className="info-card info-card--icon" key={item}>
                <span className="info-card-icon"><Check size={20} /></span>
                <p>{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="info-section">
        <div className="shell">
          <h2>{t("costsTitle")}</h2>
          <p className="info-lede">{t("costsBody")}</p>
          <div className="info-grid info-grid--two" style={{ maxWidth: 900 }}>
            {costs.map((cost) => {
              const Icon = cost.icon;
              return (
                <div className="info-card info-card--icon" key={cost.label}>
                  <span className="info-card-icon"><Icon size={20} /></span>
                  <div><h3>{cost.label}</h3><p>{cost.body}</p></div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="info-section info-section--tint">
        <div className="shell">
          <h2>{t("compareTitle")}</h2>
          <table className="compare-table">
            <thead>
              <tr>
                <th scope="col" aria-label="&nbsp;" />
                <th scope="col">{t("compareHosted")}</th>
                <th scope="col">{t("comparePlatepilot")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, theirs, ours]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>{theirs}</td>
                  <td className="is-us">{ours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="info-section">
        <div className="shell">
          <h2>{t("faqTitle")}</h2>
          <div className="cw-faq-list">
            {faqs.map((faq) => (
              <details className="cw-faq-item" key={faq.q}>
                <summary>{faq.q}<span aria-hidden="true" /></summary>
                <p>{faq.a}</p>
              </details>
            ))}
          </div>
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
