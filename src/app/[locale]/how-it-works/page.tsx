import { ArrowDownLeft, ArrowRight, ArrowUpRight, BadgeCheck, Check, Receipt, Server } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buildPageMetadata } from "@/domain/seo";

export const dynamic = "force-static";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "HowItWorks" });
  return buildPageMetadata({ locale, title: t("title"), description: t("lede"), path: "how-it-works" });
}

export default async function HowItWorksPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("HowItWorks");
  const h = await getTranslations("Home");

  const steps = [
    [t("step1"), t("step1Body")],
    [t("step2"), t("step2Body")],
    [t("step3"), t("step3Body")],
    [t("step4"), t("step4Body")],
    [t("step5"), t("step5Body")],
    [t("step6"), t("step6Body")],
  ] as const;
  const guest = [t("guest1"), t("guest2"), t("guest3"), t("guest4"), t("guest5")];
  const flows = [
    { icon: ArrowDownLeft, dir: "is-in", text: t("flow1") },
    { icon: Server, dir: "is-in", text: t("flow2") },
    { icon: ArrowUpRight, dir: "is-out", text: t("flow3") },
    { icon: ArrowDownLeft, dir: "is-in", text: t("flow4") },
    { icon: BadgeCheck, dir: "is-in", text: t("flow5") },
    { icon: Receipt, dir: "is-out", text: t("flow6") },
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
          <h2>{t("setupTitle")}</h2>
          <p className="info-lede">{t("setupBody")}</p>
          <ol className="step-list">
            {steps.map(([title, body], index) => (
              <li className="step-row" key={title}>
                <span className="step-row-num">{index + 1}</span>
                <div><h3>{title}</h3><p>{body}</p></div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="info-section">
        <div className="shell">
          <h2>{t("guestTitle")}</h2>
          <p className="info-lede">{t("guestBody")}</p>
          <div className="journey" role="list">
            {guest.map((step, index) => (
              <div className="journey-step" role="listitem" key={step}>
                <i>{index + 1}</i>
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="info-section info-section--tint">
        <div className="shell">
          <h2>{t("flowTitle")}</h2>
          <p className="info-lede">{t("flowBody")}</p>
          <div className="flow-list">
            {flows.map((flow) => {
              const Icon = flow.icon;
              return (
                <div className={`flow-row ${flow.dir}`} key={flow.text}>
                  <Icon size={19} />
                  <span>{flow.text}</span>
                </div>
              );
            })}
          </div>
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
