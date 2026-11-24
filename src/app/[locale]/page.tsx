import {
  ArrowRight,
  Bike,
  CalendarCheck,
  Check,
  Globe2,
  Minus,
  ShieldCheck,
  ShoppingBag,
  UtensilsCrossed,
} from "lucide-react";
import Image from "next/image";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { appBaseUrl, ogAlternateLocales, ogLocale } from "@/domain/seo";
import FeatureTabs from "@/components/home/FeatureTabs";

const modeIcons = [ShoppingBag, UtensilsCrossed, Bike, CalendarCheck];

const languages = [
  { name: "English", code: "EN", rtl: false },
  { name: "Français", code: "FR", rtl: false },
  { name: "Español", code: "ES", rtl: false },
  { name: "Português", code: "PT", rtl: false },
  { name: "العربية", code: "AR", rtl: true },
];

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

/**
 * The landing page reads as one board: a stage with the room in it, the four
 * service platforms, the route an order takes, and the live floor it lands on.
 * Every line of copy comes from the Home namespace; the product views are
 * labelled as illustrative, never presented as customer results.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
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
  const board = [
    { table: "T1", state: t("available"), live: false },
    { table: "T2", state: t("seated"), live: true },
    { table: "T3", state: t("reserved"), live: false },
  ];
  const room = [
    { table: "T1", state: t("available"), note: "2" },
    { table: "T2", state: t("seated"), note: "4" },
    { table: "T3", state: t("reserved"), note: "6" },
    { table: "T4", state: t("resetting"), note: "2" },
    { table: "T5", state: t("available"), note: "4" },
  ];
  const faqs = [
    { q: t("faqOneQ"), a: t("faqOneA") },
    { q: t("faqTwoQ"), a: t("faqTwoA") },
    { q: t("faqThreeQ"), a: t("faqThreeA") },
    { q: t("faqFourQ"), a: t("faqFourA") },
  ];

  return (
    <>
      <section className="lp-hero">
        <div className="shell lp-hero__grid">
          <div className="lp-hero__copy">
            <h1>{t("title")}<span>{t("titleAccent")}</span></h1>
            <p className="lp-hero__lede">{t("description")}</p>
            <div className="lp-hero__actions">
              <Link href="/onboarding" className="button button--hero">
                {t("primaryCta")}<ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link href="/operations" className="button button--ghost">
                {t("secondaryCta")}
              </Link>
            </div>
            <p className="lp-hero__note"><Check size={14} aria-hidden="true" />{t("note")}</p>
          </div>

          <figure className="lp-stage">
            <div className="lp-stage__frame">
              <span className="lp-stage__tag">{t("previewTitle")}</span>
              <Image
                src="/images/hero-restaurant.jpg"
                alt={t("previewTitle")}
                fill
                sizes="(max-width: 1024px) 100vw, 640px"
                priority
              />
            </div>
            <div className="lp-board">
              <div className="lp-board__head">
                <span>{t("previewLabel")}</span>
                <span className="lp-live"><i aria-hidden="true" />LIVE</span>
              </div>
              <div className="lp-board__rows">
                {board.map((row) => (
                  <div key={row.table} className={`lp-board__row${row.live ? " is-live" : ""}`}>
                    <span className="lp-board__no">{row.table}</span>
                    <span className="lp-board__state" data-state={row.state.toLowerCase()}>{row.state}</span>
                  </div>
                ))}
              </div>
              <div className="lp-board__foot">{t("floorPointThree")}</div>
            </div>
            <figcaption className="lp-stage__caption">
              <span>2D / 3D</span>
              <Link href="/floor-planner" className="text-link">{t("previewCta")} →</Link>
            </figcaption>
          </figure>
        </div>

        <ul className="shell lp-strip">
          <li><Check size={16} aria-hidden="true" />{t("stripOne")}</li>
          <li><Globe2 size={16} aria-hidden="true" />{t("stripTwo")}</li>
          <li><ShieldCheck size={16} aria-hidden="true" />{t("stripThree")}</li>
        </ul>
      </section>

      <section className="section" id="product">
      <div className="lp-interlude" aria-hidden="true">
        <Image src="/images/menu/bobotie.jpg" alt="" fill sizes="100vw" />
      </div>

        <div className="shell">
          <div className="lp-head">
            <h2>{t("modesTitle")}</h2>
            <p>{t("modesBody")}</p>
          </div>
          <div className="lp-modes">
            {modes.map((mode, index) => {
              const Icon = modeIcons[index];
              return (
                <Link href={mode.href} className="lp-mode" key={mode.title}>
                  <h3>
                    <span className="lp-mode__no">{String(index + 1).padStart(2, "0")}</span>
                    <span className="lp-mode__icon"><Icon size={18} strokeWidth={1.6} aria-hidden="true" /></span>
                    {mode.title}
                  </h3>
                  <p>{mode.body}</p>
                  <span className="lp-mode__go" aria-hidden="true"><ArrowRight size={14} /></span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section section--band">
        <div className="shell">
          <div className="lp-head">
            <h2>{t("productTitle")}</h2>
            <p>{t("productDescription")}</p>
          </div>
          <div className="lp-route">
            {steps.map((step) => (
              <article className="lp-stop" key={step.number}>
                <span className="lp-stop__no">{step.number}</span>
                <div className="lp-stop__copy">
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                  <Link href={step.href} className="text-link">{step.cta} →</Link>
                </div>
                <div className="lp-stop__visual">
                  {step.visual === "photo" && (
                    <Image
                      src="/images/menu/bobotie.jpg"
                      alt={step.title}
                      width={900}
                      height={600}
                      sizes="(max-width: 1024px) 100vw, 560px"
                    />
                  )}
                  {step.visual === "kitchen" && (
                    <Image
                      src="/images/kitchen-pass.jpg"
                      alt={step.title}
                      width={900}
                      height={600}
                      sizes="(max-width: 1024px) 100vw, 560px"
                    />
                  )}
                  {step.visual === "payment" && (
                    <div className="lp-ticket">
                      <div className="lp-ticket__head">
                        <span>{s("kitchen")}</span>
                        <span>{t("stripThree")}</span>
                      </div>
                      <div className="lp-ticket__row"><span>{s("received")}</span><Check size={16} aria-hidden="true" /></div>
                      <div className="lp-ticket__row"><span>{s("preparing")}</span><Check size={16} aria-hidden="true" /></div>
                      <div className="lp-ticket__row"><span>{s("ready")}</span><Check size={16} aria-hidden="true" /></div>
                      <div className="lp-ticket__row"><span>{s("completed")}</span><Minus size={16} aria-hidden="true" /></div>
                      <div className="lp-ticket__total"><span>{s("payment")}</span><b>{s("paymentPaid")}</b></div>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-floor">
        <div className="shell">
          <div className="lp-floor__grid">
            <div>
              <h2>{t("floorSectionTitle")}</h2>
              <p>{t("floorSectionBody")}</p>
              <ul className="lp-floor__points">
                <li><Check size={16} aria-hidden="true" />{t("floorPointOne")}</li>
                <li><Check size={16} aria-hidden="true" />{t("floorPointTwo")}</li>
                <li><Check size={16} aria-hidden="true" />{t("floorPointThree")}</li>
              </ul>
              <Link href="/floor-planner" className="button button--light">
                {t("floorCta")}<ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <div className="lp-floor__board">
              <div className="lp-floor__board-head">
                <span>{t("boardLive")}</span>
                <span>{t("boardNote")}</span>
              </div>
              {room.map((row) => (
                <div key={row.table} className="lp-floor__row" data-state={row.state.toLowerCase()}>
                  <b>{row.table}</b>
                  <span>{row.state}</span>
                  <em>{row.note}</em>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <FeatureTabs />

      <section className="section">
        <div className="shell">
          <div className="lp-head">
            <h2>{t("faqTitle")}</h2>
          </div>
          <div className="cw-faq-list">
            {faqs.map((faq) => (
              <details className="cw-faq-item" key={faq.q}>
                <summary>{faq.q}</summary>
                <p>{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="section section--band" id="security">
        <div className="shell">
          <div className="lp-global">
            <div>
              <h2>{t("globalTitle")}</h2>
              <p>{t("globalBody")}</p>
            </div>
            <div>
              <h3>{t("integrationsTitle")}</h3>
              <p>{t("integrationsBody")}</p>
              <ul className="lp-chips" aria-label={t("integrationsTitle")}>
                {["Stripe", "Paystack", "PayPal", "Google", "SMS"].map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div className="lp-langband" aria-label={t("stripTwo")}>
          {languages.map((language) => (
            <div className={`lp-langband__item${language.rtl ? " is-rtl" : ""}`} key={language.code}>
              <span className="lp-langband__code">{language.code}</span>
              <b>{language.name}</b>
            </div>
          ))}
        </div>
        <div className="shell">
          <div className="lp-security">
            <div>
              <h2>{t("securityTitle")}</h2>
              <p>{t("securityBody")}</p>
              <Link href="/security" className="button button--ghost">
                {t("securityCta")}<ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <ul className="lp-security__panel">
              <li className="lp-security__row"><span>{t("stripOne")}</span><Check size={16} aria-hidden="true" /></li>
              <li className="lp-security__row"><span>{t("stripTwo")}</span><Globe2 size={16} aria-hidden="true" /></li>
              <li className="lp-security__row"><span>{t("stripThree")}</span><ShieldCheck size={16} aria-hidden="true" /></li>
            </ul>
          </div>
        </div>
      </section>

      <section className="closing-section">
        <div className="shell closing-inner">
          <h2>{t("closingTitle")}</h2>
          <p>{t("closingBody")}</p>
          <Link href="/onboarding" className="button button--light button--hero">
            {t("closingCta")}<ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </>
  );
}