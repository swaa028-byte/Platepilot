import {
  ArrowRight,
  Check,
  ChefHat,
  CreditCard,
  Globe2,
  LayoutGrid,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

const featureIcons = [ShoppingBag, CreditCard, LayoutGrid, ChefHat];

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Home");

  const features = [
    { title: t("orderingTitle"), body: t("orderingBody") },
    { title: t("paymentsTitle"), body: t("paymentsBody") },
    { title: t("floorTitle"), body: t("floorBody") },
    { title: t("kitchenTitle"), body: t("kitchenBody") },
  ];
  const states = [t("available"), t("reserved"), t("seated"), t("resetting")];

  return (
    <>
      <section className="hero">
        <div className="hero-glow" aria-hidden="true" />
        <div className="shell hero-grid">
          <div className="hero-copy">
            <p className="eyebrow"><span />{t("eyebrow")}</p>
            <h1>{t("title")}<em>{t("titleAccent")}</em></h1>
            <p className="hero-lede">{t("description")}</p>
            <div className="button-row">
              <Link href="/onboarding" className="button button--hero">
                {t("primaryCta")}<ArrowRight size={18} />
              </Link>
              <Link href="/operations" className="button button--ghost">
                {t("secondaryCta")}
              </Link>
            </div>
            <p className="hero-note"><Check size={15} />{t("note")}</p>
          </div>

          <div className="floor-preview-wrap">
            <div className="preview-orbit preview-orbit--one" aria-hidden="true" />
            <div className="preview-orbit preview-orbit--two" aria-hidden="true" />
            <div className="floor-preview">
              <div className="preview-topline">
                <span>{t("previewLabel")}</span>
                <span className="live-pill"><i />LIVE</span>
              </div>
              <div className="preview-copy">
                <h2>{t("previewTitle")}</h2>
                <p>{t("previewDescription")}</p>
              </div>
              <div className="illustrative-room" aria-label={t("previewLabel")}>
                <div className="room-line room-line--one" />
                <div className="room-line room-line--two" />
                <div className="preview-empty">
                  <span className="preview-empty-icon"><LayoutGrid size={25} /></span>
                  <strong>{t("previewEmpty")}</strong>
                  <p>{t("previewEmptyBody")}</p>
                </div>
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
            <div className="floating-note floating-note--top" aria-hidden="true"><Sparkles size={15} /> 2D + 3D</div>
            <div className="floating-note floating-note--bottom" aria-hidden="true"><ShieldCheck size={15} /> ACCESSIBLE BY DESIGN</div>
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

      <section className="section features-section" id="product">
        <div className="shell">
          <div className="section-heading section-heading--split">
            <div><p className="eyebrow"><span />{t("productEyebrow")}</p><h2>{t("productTitle")}</h2></div>
            <p>{t("productDescription")}</p>
          </div>
          <div className="feature-grid">
            {features.map((feature, index) => {
              const Icon = featureIcons[index];
              return (
                <article className="feature-card" key={feature.title}>
                  <div className="feature-number">0{index + 1}</div>
                  <span className="feature-icon"><Icon size={23} strokeWidth={1.6} /></span>
                  <h3>{feature.title}</h3>
                  <p>{feature.body}</p>
                  <span className="feature-rule" />
                </article>
              );
            })}
          </div>
        </div>
      </section>

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

      <section className="section security-section" id="security">
        <div className="shell security-card">
          <div className="security-icon"><ShieldCheck size={35} strokeWidth={1.4} /></div>
          <div className="security-copy">
            <p className="eyebrow"><span />{t("securityEyebrow")}</p>
            <h2>{t("securityTitle")}</h2>
            <p>{t("securityBody")}</p>
          </div>
          <a className="button button--outline" href="https://github.com/MarcusK-ai/rea-cloudwaitress/blob/feature/platepilot-core/docs/security.md" target="_blank" rel="noreferrer">
            {t("securityCta")}<ArrowRight size={17} />
          </a>
        </div>
      </section>

      <section className="closing-section">
        <div className="shell closing-inner">
          <p className="eyebrow"><span />PLATEPILOT</p>
          <h2>{t("closingTitle")}</h2>
          <p>{t("closingBody")}</p>
          <Link href="/onboarding" className="button button--hero">{t("closingCta")}<ArrowRight size={18} /></Link>
        </div>
      </section>
    </>
  );
}
