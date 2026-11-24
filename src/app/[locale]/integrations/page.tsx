import { ArrowRight, Check, CreditCard, FileText, MapPin, MessageSquare, Server, Smartphone } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { buildPageMetadata } from "@/domain/seo";

export const dynamic = "force-static";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "IntegrationsPage" });
  return buildPageMetadata({ locale, title: t("title"), description: t("lede"), path: "integrations" });
}

export default async function IntegrationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("IntegrationsPage");
  const h = await getTranslations("Home");

  const groups = [
    {
      icon: CreditCard,
      title: t("catPay"),
      body: t("catPayBody"),
      chips: [t("payStripe"), t("payPaystack"), t("payPaypal")],
    },
    {
      icon: MapPin,
      title: t("catDiscovery"),
      body: t("catDiscoveryBody"),
      chips: [t("discGoogle")],
    },
    {
      icon: MessageSquare,
      title: t("catMessages"),
      body: t("catMessagesBody"),
      chips: [t("msgEmail"), t("msgSms")],
    },
    {
      icon: Server,
      title: t("catData"),
      body: t("catDataBody"),
      chips: [t("dataSupabase"), t("dataEmbedded")],
    },
    {
      icon: Smartphone,
      title: t("catBrand"),
      body: t("catBrandBody"),
      chips: [t("brandDomain"), t("brandStore")],
    },
  ];

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
          {groups.map((group) => {
            const Icon = group.icon;
            return (
              <div className="int-group" key={group.title}>
                <div className="int-group-head">
                  <span className="int-group-icon"><Icon size={20} aria-hidden="true" /></span>
                  <div>
                    <h3>{group.title}</h3>
                    <p>{group.body}</p>
                  </div>
                </div>
                <div className="int-chips">
                  {group.chips.map((chip) => (
                    <span className="int-chip" key={chip}><Check size={16} />{chip}</span>
                  ))}
                </div>
              </div>
            );
          })}
          <p className="int-docs"><FileText size={16} aria-hidden="true" />{t("docsNote")}</p>
        </div>
      </section>

      <section className="closing-section">
        <div className="shell closing-inner">
          <h2>{t("ctaTitle")}</h2>
          <p>{t("ctaBody")}</p>
          <Link href="/settings" className="button button--light button--hero">{h("secondaryCta")}<ArrowRight size={18} /></Link>
        </div>
      </section>
    </>
  );
}