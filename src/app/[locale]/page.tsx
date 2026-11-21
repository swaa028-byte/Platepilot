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
  UtensilsCrossed,
} from "lucide-react";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

const featureIcons = [ShoppingBag, CreditCard, LayoutGrid];

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
  ];
  const states = [t("available"), t("reserved"), t("seated"), t("resetting")];

  return (
    <>
      <section className="hero hero--photo">
        <div className="hero-photo" aria-hidden="true">
          <Image
            src="/images/hero-restaurant.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="hero-photo-img"
          />
          <div className="hero-scrim" />
        </div>
        <div className="shell hero-grid">
          <div className="hero-copy hero-copy--photo">
            <p className="eyebrow eyebrow--gold"><span />{t("eyebrow")}</p>
            <h1>{t("title")}<em>{t("titleAccent")}</em></h1>
            <p className="hero-lede">{t("description")}</p>
            <div className="button-row">
              <Link href="/onboarding" className="button button--light">
                {t("primaryCta")}<ArrowRight size={18} />
              </Link>
              <Link href="/operations" className="button button--outline-light">
                {t("secondaryCta")}
              </Link>
            </div>
            <p className="hero-note hero-note--photo"><Check size={15} />{t("note")}</p>
          </div>

          <div className="hero-stage">
            <div className="stage-scene">
              <div className="stage-orbit stage-orbit--one" aria-hidden="true" />
              <div className="stage-orbit stage-orbit--two" aria-hidden="true" />
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
        </div>
      </section>

      <section className="trust-strip" aria-label={t("productEyebrow")}>
        <div className="shell trust-strip-inner">
          <span><Check size={16} />{t("stripOne")}</span>
          <span><Globe2 size={16} />{t("stripTwo")}</span>
          <span><ShieldCheck size={16} />{t("stripThree")}</span>
        </div>
      </section>

      <section className="section craft-section" id="experience">
        <div className="shell craft-grid">
          <div className="craft-stage">
            <div className="craft-scene">
              <div className="craft-card">
                <Image
                  src="/images/kitchen-pass.jpg"
                  alt={t("kitchenTitle")}
                  width={900}
                  height={600}
                  sizes="(max-width: 820px) 100vw, 560px"
                  className="craft-img"
                />
                <div className="craft-chip craft-chip--orders" aria-hidden="true">
                  <UtensilsCrossed size={14} /> 1042
                </div>
                <div className="craft-chip craft-chip--live" aria-hidden="true"><i />LIVE</div>
              </div>
              <div className="craft-shadow" aria-hidden="true" />
            </div>
          </div>
          <div className="craft-copy">
            <p className="eyebrow"><span />{t("productEyebrow")}</p>
            <h2>{t("kitchenTitle")}</h2>
            <p>{t("kitchenBody")}</p>
            <Link href="/kitchen" className="button button--cream">{t("secondaryCta")}<ArrowRight size={17} /></Link>
          </div>
        </div>
      </section>

      <section className="section features-section" id="product">
        <div className="shell">
          <div className="section-heading section-heading--split">
            <div><p className="eyebrow"><span />{t("productEyebrow")}</p><h2>{t("productTitle")}</h2></div>
            <p>{t("productDescription")}</p>
          </div>
          <div className="feature-grid feature-grid--three">
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
          <Link className="button button--outline" href="/security">{t("securityCta")}<ArrowRight size={17} /></Link>
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
