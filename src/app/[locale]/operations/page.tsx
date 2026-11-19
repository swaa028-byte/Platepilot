import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  ChefHat,
  CircleDollarSign,
  Package,
  Plug,
  ShoppingBag,
  Truck,
  Users,
} from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function OperationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Operations");
  const modules = [
    [ShoppingBag, t("orders"), t("ordersBody")],
    [CircleDollarSign, t("pos"), t("posBody")],
    [CalendarDays, t("reservations"), t("reservationsBody")],
    [ChefHat, t("kitchen"), t("kitchenBody")],
    [Package, t("inventory"), t("inventoryBody")],
    [Truck, t("delivery"), t("deliveryBody")],
    [Users, t("crm"), t("crmBody")],
    [BarChart3, t("reports"), t("reportsBody")],
    [Plug, t("integrations"), t("integrationsBody")],
  ] as const;

  return (
    <div className="operations-page">
      <section className="page-hero page-hero--compact">
        <div className="shell">
          <p className="eyebrow"><span />{t("eyebrow")}</p>
          <h1>{t("title")}</h1>
          <p className="page-lede">{t("description")}</p>
        </div>
      </section>
      <section className="section operations-content">
        <div className="shell">
          <div className="workspace-callout">
            <div><span className="status-badge">EMPTY BY DEFAULT</span><h2>{t("workspaceTitle")}</h2><p>{t("workspaceBody")}</p></div>
            <div className="button-row"><Link className="button" href="/onboarding">{t("setupCta")}<ArrowRight size={16} /></Link><Link className="button button--ghost" href="/login">{t("signInCta")}</Link></div>
          </div>
          <div className="operations-grid">
            {modules.map(([Icon, title, body], index) => (
              <article className="operation-card" key={title}>
                <div className="operation-card-top"><span className="feature-icon"><Icon size={22} /></span><span className="operation-index">{String(index + 1).padStart(2, "0")}</span></div>
                <h2>{title}</h2><p>{body}</p><span className="operation-state">{index === 8 ? t("blocked") : t("state")}</span>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
