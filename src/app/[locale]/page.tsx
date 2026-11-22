import {
  ArrowRight,
  Bike,
  CalendarCheck,
  Check,
  Globe2,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  UtensilsCrossed,
} from "lucide-react";
import Image from "next/image";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { appBaseUrl, ogAlternateLocales, ogLocale } from "@/domain/seo";
import FeatureTabs from "@/components/home/FeatureTabs";
import { RotatingWord, RotatingWordLabel } from "@/components/home/RotatingWord";

const modeIcons = [ShoppingBag, UtensilsCrossed, Bike, CalendarCheck];

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Home" });
  const base = appBaseUrl();
  const title = `${t("title")} ${t("titleAccent")}`;
  return {
    title,
    description: t("description"),
    alternates: {
      canonical: `${base}/${locale}`,
      languages: Object.fromEntries(routing.locales.map((item) => [item, `${base}/${item}`])),
    },
    openGraph: {
      type: "website",
      siteName: "PlatePilot",
      locale: ogLocale(locale),
      alternateLocale: ogAlternateLocales(locale),
      url: `${base}/${locale}`,
      title,
      description: t("description"),
    },
    twitter: { card: "summary_large_image", title, description: t("description") },
  };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");
  const s = await getTranslations("OrderStatus");

  const modes = [
    { title: t("modePickupTitle"), body: t("modePickupBody"), href: "/locations" },
    { title: t("modeDineTitle"), body: t("modeDineBody"), href: "/floor-planner" },
    { title: t("modeDeliveryTitle"), body: t("modeDeliveryBody"), href: "/locations" },
    { title: t("modeReserveTitle"), body: t("modeReserveBody"), href: "/floor-planner" },
  ];
  const steps = [
    { number: "01", title: t("orderingTitle"), body: t("orderingBody"), cta: t("modeCta"), href: "/locations", visual: "photo" as const },
    { number: "02", title: t("kitchenTitle"), body: t("kitchenBody"), cta: t("secondaryCta"), href: "/kitchen", visual: "kitchen" as const },
    { number: "03", title: t("paymentsTitle"), body: t("paymentsBody"), cta: t("securityCta"), href: "/security", visual: "payment" as const },
  ];
  const states = [t("available"), t("reserved"), t("seated"), t("resetting")];
  const faqs = [
    { q: t("faqOneQ"), a: t("faqOneA") },
    { q: t("faqTwoQ"), a: t("faqTwoA") },
    { q: t("faqThreeQ"), a: t("faqThreeA") },
    { q: t("faqFourQ"), a: t("faqFourA") },
  ];

  return (
    <>
      {/* Hero: a CloudWaitress-style statement band, in green. */}
      <section className="cw-hero">
        <div className="cw-hero-glow" aria-hidden="true" />
        <div className="shell cw-hero-inner">
          <p className="eyebrow eyebrow--light eyebrow--center"><span />{t("eyebrow")}</p>
          <h1>{t("title")}<em>{t("titleAccent")}</em></h1>
          <p className="cw-hero-rotate">
            <span className="cw-hero-rotate-lead">PlatePilot ·</span>
            <RotatingWord />
            <RotatingWordLabel />
          </p>
          <p className="cw-lede">{t("description")}</p>
          <div className="button-row">
            <Link href="/onboarding" className="button button--light button--hero">
              {t("primaryCta")}<ArrowRight size={18} />
            </Link>
            <Link href="/operations" className="button button--outline-light">
              {t("secondaryCta")}
            </Link>
          </div>
          <p className="cw-hero-note"><Check size={15} />{t("note")}</p>

          {/* Product view under the statement, like CloudWaitress's hero screenshot. */}
          <div className="cw-hero-mockup">
            <div className="stage-card">
              <div className="floor-preview floor-preview--glass">
                <div className="preview-topline">
                  <span>{t("previewLabel")}</span>
                  <span className="live-pill"><i />LIVE</span>
                </div>
                <div className="preview-copy">
                  <h2>{t("previewTitle")}</h2>
                  <p>{t("previewDescription")}</p>
                </div>
                <div className="illustrative-room" aria-label={t("previewLabel")}>
                  <span className="room-table room-table--round room-table--available room-table--t1" aria-hidden="true">T1</span>
                  <span className="room-table room-table--booth room-table--reserved room-table--t2" aria-hidden="true">T2</span>
                  <span className="room-table room-table--round room-table--seated room-table--t3" aria-hidden="true">T3</span>
                  <span className="room-table room-table--booth room-table--available room-table--t4" aria-hidden="true">T4</span>
                  <span className="room-table room-table--round room-table--resetting room-table--t5" aria-hidden="true">T5</span>
                  <div className="room-line room-line--one" />
                  <div className="room-line room-line--two" />
                  <span className="room-coordinate room-coordinate--x">X · m</span>
                  <span className="room-coordinate room-coordinate--z">Z · m</span>
                </div>
                <div className="preview-bottom">
                  <div className="state-legend" aria-label={t("previewLabel")}>
                    {states.map((state, index) => (
                      <span key={state}><i className={`state-dot state-dot--${index}`} />{state}</span>
                    ))}
                  </div>
                  <Link href="/floor-planner" className="preview-link" aria-label={t("previewCta")}>
                    <ArrowRight size={19} />
                  </Link>
                </div>
              </div>
              <div className="stage-note stage-note--top" aria-hidden="true"><Sparkles size={15} /> 2D + 3D</div>
              <div className="stage-note stage-note--bottom" aria-hidden="true"><ShieldCheck size={15} /> ACCESSIBLE BY DESIGN</div>
            </div>
          </div>
        </div>
      </section>

      <section className="trust-strip" aria-label={t("productEyebrow")}>
        <div className="shell trust-strip-inner">
          <span><Check size={16} />{t("stripOne")}</span>
          <span><Globe2 size={16} />{t("stripTwo")}</span>
          <span><ShieldCheck size={16} />{t("stripThree")}</span>
        </div>
      </section>

      {/* "One system that does it all": the four service modes. */}
      <section className="section cw-modes">
        <div className="shell">
          <div className="cw-center-head">
            <p className="eyebrow eyebrow--center"><span />{t("modesEyebrow")}</p>
            <h2>{t("modesTitle")}</h2>
            <p className="cw-section-lede">{t("modesBody")}</p>
          </div>
          <div className="cw-mode-grid">
            {modes.map((mode, index) => {
              const Icon = modeIcons[index];
              return (
                <article className="cw-mode-card" key={mode.title}>
                  <span className="cw-mode-icon"><Icon size={24} strokeWidth={1.7} /></span>
                  <h3>{mode.title}</h3>
                  <p>{mode.body}</p>
                  <Link href={mode.href} className="cw-mode-link">
                    {t("modeCta")}<ArrowRight size={15} />
                  </Link>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* 01 / 02 / 03: the numbered walk-through. */}
      <section className="section cw-steps" id="product">
        <div className="shell">
          <div className="cw-center-head">
            <p className="eyebrow eyebrow--center"><span />{t("productEyebrow")}</p>
            <h2>{t("productTitle")}</h2>
            <p className="cw-section-lede">{t("productDescription")}</p>
          </div>
          <div className="cw-step-list">
            {steps.map((step, index) => (
              <div className={`cw-step${index % 2 === 1 ? " cw-step--flip" : ""}`} key={step.number}>
                <div className="cw-step-copy">
                  <span className="cw-step-num">{step.number}</span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                  <Link href={step.href} className="button button--small">{step.cta}<ArrowRight size={15} /></Link>
                </div>
                <div className="cw-step-visual">
                  {step.visual === "photo" && (
                    <div className="cw-step-photo">
                      <Image
                        src="/images/hero-restaurant.jpg"
                        alt={step.title}
                        width={900}
                        height={600}
                        sizes="(max-width: 820px) 100vw, 520px"
                      />
                    </div>
                  )}
                  {step.visual === "kitchen" && (
                    <div className="cw-step-photo cw-step-photo--kitchen">
                      <Image
                        src="/images/kitchen-pass.jpg"
                        alt={step.title}
                        width={900}
                        height={600}
                        sizes="(max-width: 820px) 100vw, 520px"
                      />
                      <div className="craft-chip craft-chip--orders" aria-hidden="true"><UtensilsCrossed size={14} /> 1042</div>
                      <div className="craft-chip craft-chip--live" aria-hidden="true"><i />LIVE</div>
                    </div>
                  )}
                  {step.visual === "payment" && (
                    <div className="pay-mock" role="presentation">
                      <div className="pay-mock-row">
                        <span>{s("reference")}</span>
                        <strong>PP-1042</strong>
                      </div>
                      <div className="pay-mock-row">
                        <span>{s("total")}</span>
                        <strong>4 800 XOF</strong>
                      </div>
                      <div className="pay-mock-row">
                        <span>{s("payment")}</span>
                        <span className="pay-badge">{s("paymentPaid")}</span>
                      </div>
                      <div className="pay-mock-flow" aria-hidden="true">
                        <span className="pay-flow-step is-done">{s("received")}</span>
                        <span className="pay-flow-step is-done">{s("preparing")}</span>
                        <span className="pay-flow-step is-done">{s("ready")}</span>
                        <span className="pay-flow-step">{s("completed")}</span>
                      </div>
                      <p className="pay-mock-note"><ShieldCheck size={14} />{t("stripThree")}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Signature feature: the live floor. */}
      <section className="section floor-story">
        <div className="shell floor-story-grid">
          <div className="floor-story-visual" aria-hidden="true">
            <div className="blueprint-grid">
              <span className="blueprint-label">LIVE FLOOR / 2D FIRST</span>
              <div className="blueprint-table blueprint-table--one"><i /><i /><i /><i /></div>
              <div className="blueprint-table blueprint-table--two"><i /><i /></div>
              <div className="blueprint-table blueprint-table--three"><i /><i /><i /></div>
              <div className="blueprint-path" />
              <span className="blueprint-scale">0 ─── 1 m</span>
            </div>
            <div className="dimension-tag dimension-tag--width">12.0 m</div>
            <div className="dimension-tag dimension-tag--depth">8.0 m</div>
          </div>
          <div className="floor-story-copy">
            <p className="eyebrow eyebrow--light"><span />{t("floorEyebrow")}</p>
            <h2>{t("floorSectionTitle")}</h2>
            <p>{t("floorSectionBody")}</p>
            <ul className="check-list">
              <li><Check size={18} />{t("floorPointOne")}</li>
              <li><Check size={18} />{t("floorPointTwo")}</li>
              <li><Check size={18} />{t("floorPointThree")}</li>
            </ul>
            <Link href="/floor-planner" className="button button--cream">{t("floorCta")}<ArrowRight size={17} /></Link>
          </div>
        </div>
      </section>

      <FeatureTabs />

      {/* Integrations, named honestly. */}
      <section className="section cw-integrations">
        <div className="shell">
          <div className="cw-center-head">
            <p className="eyebrow eyebrow--center"><span />{t("integrationsEyebrow")}</p>
            <h2>{t("integrationsTitle")}</h2>
            <p className="cw-section-lede">{t("integrationsBody")}</p>
          </div>
          <ul className="cw-integration-row" aria-label={t("integrationsTitle")}>
            {["Stripe", "Paystack", "PayPal", "Google", "SMS"].map((name) => (
              <li className="cw-integration-chip" key={name}>{name}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section global-section">
        <div className="shell global-grid">
          <div>
            <p className="eyebrow"><span />{t("globalEyebrow")}</p>
            <h2>{t("globalTitle")}</h2>
            <p className="section-lede">{t("globalBody")}</p>
            <p className="language-line">{t("languageLabel")}</p>
          </div>
          <div className="currency-diagram" aria-label="USD · EUR · GBP · ZAR · NGN · JPY · KWD">
            <div className="currency-center"><Globe2 size={32} /><span>ONE ORDER</span><strong>EXACT MONEY</strong></div>
            {["USD", "EUR", "ZAR", "JPY", "KWD", "GBP"].map((currency, index) => (
              <span className={`currency-chip currency-chip--${index + 1}`} key={currency}>{currency}</span>
            ))}
            <div className="currency-ring currency-ring--one" /><div className="currency-ring currency-ring--two" />
          </div>
        </div>
      </section>

      {/* FAQ: native details/summary, keyboard and screen-reader friendly. */}
      <section className="section cw-faq">
        <div className="shell">
          <div className="cw-center-head">
            <p className="eyebrow eyebrow--center"><span />{t("faqEyebrow")}</p>
            <h2>{t("faqTitle")}</h2>
          </div>
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

      <section className="section security-section" id="security">
        <div className="shell security-card">
          <div className="security-icon"><ShieldCheck size={35} strokeWidth={1.4} /></div>
          <div className="security-copy">
            <p className="eyebrow"><span />{t("securityEyebrow")}</p>
            <h2>{t("securityTitle")}</h2>
            <p>{t("securityBody")}</p>
          </div>
          <Link className="button button--outline" href="/security">{t("securityCta")}<ArrowRight size={17} /></Link>
        </div>
      </section>

      {/* Closing banner: CloudWaitress's full-bleed CTA band, in green. */}
      <section className="closing-section">
        <div className="shell closing-inner">
          <p className="eyebrow eyebrow--light eyebrow--center"><span />PLATEPILOT</p>
          <h2>{t("closingTitle")}</h2>
          <p>{t("closingBody")}</p>
          <Link href="/onboarding" className="button button--light button--hero">{t("closingCta")}<ArrowRight size={18} /></Link>
        </div>
      </section>
    </>
  );
}
