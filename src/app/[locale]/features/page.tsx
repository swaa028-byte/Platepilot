import { ArrowRight, ShoppingBag, UtensilsCrossed, Bike, CalendarCheck } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buildPageMetadata } from "@/domain/seo";

export const dynamic = "force-static";

const modeIcons = [ShoppingBag, UtensilsCrossed, Bike, CalendarCheck];

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "FeaturesPage" });
  return buildPageMetadata({ locale, title: t("title"), description: t("lede"), path: "features" });
}

export default async function FeaturesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("FeaturesPage");
  const h = await getTranslations("Home");

  const modes = [
    { title: h("modePickupTitle"), body: h("modePickupBody"), href: "/locations" },
    { title: h("modeDineTitle"), body: h("modeDineBody"), href: "/floor-planner" },
    { title: h("modeDeliveryTitle"), body: h("modeDeliveryBody"), href: "/locations" },
    { title: h("modeReserveTitle"), body: h("modeReserveBody"), href: "/floor-planner" },
  ];
  const cores = [
    h("orderingTitle"),
    h("kitchenTitle"),
    h("paymentsTitle"),
    h("floorTitle"),
  ];
  const coresBody = [h("orderingBody"), h("kitchenBody"), h("paymentsBody"), h("floorBody")];
  const box = [
    t("feat1"), t("feat2"), t("feat3"), t("feat4"),
    t("feat5"), t("feat6"), t("feat7"), t("feat8"),
    t("feat9"), t("feat10"), t("feat11"), t("feat12"),
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
          <h2>{h("modesTitle")}</h2>
          <p className="info-lede">{h("modesBody")}</p>
          <div className="cw-mode-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            {modes.map((mode, index) => {
              const Icon = modeIcons[index];
              return (
                <article className="cw-mode-card" key={mode.title}>
                  <span className="cw-mode-icon"><Icon size={24} strokeWidth={1.7} /></span>
                  <h3>{mode.title}</h3>
                  <p>{mode.body}</p>
                  <Link href={mode.href} className="cw-mode-link">{h("modeCta")}<ArrowRight size={15} /></Link>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="info-section">
        <div className="shell">
          <h2>{h("productTitle")}</h2>
          <p className="info-lede">{h("productDescription")}</p>
          <div className="info-grid info-grid--two">
            {cores.map((title, index) => (
              <div className="info-card" key={title}>
                <h3>{title}</h3>
                <p>{coresBody[index]}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="info-section info-section--tint">
        <div className="shell">
          <h2>{t("boxTitle")}</h2>
          <p className="info-lede">{t("boxBody")}</p>
          <div className="info-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            {box.map((item) => (
              <div className="info-card info-card--icon" key={item}>
                <span className="info-card-icon"><ArrowRight size={18} /></span>
                <p style={{ fontSize: 15, color: "#3f4d45", fontWeight: 600 }}>{item}</p>
              </div>
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
