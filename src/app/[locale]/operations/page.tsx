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
import { createClient } from "@/server/auth/server";

export const dynamic = "force-dynamic";

export default async function OperationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Operations");
  // The page must reflect the merchant's reality: a signed-in owner with a
  // workspace sees their restaurant, not a pitch to create one.
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  let workspaces: { locationId: string; name: string; address: string; role: string }[] = [];
  if (auth.user) {
    // Must run as the user's session — the RPC checks auth.uid() — so the
    // cookie-scoped client, never the service role.
    const result = await supabase.rpc("app_my_locations", { p_actor: auth.user.id });
    if (!result.error) workspaces = (result.data ?? []) as typeof workspaces;
  }
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
          {auth.user && workspaces.length > 0 ? (
            <div className="workspace-callout workspace-callout--live">
              <div>
                <span className="status-badge">YOUR WORKSPACE</span>
                <h2>{workspaces[0].name}</h2>
                <p>{workspaces[0].address}</p>
              </div>
              <div className="button-row">
                <Link className="button" href="/kitchen">{t("kitchen")}<ArrowRight size={16} /></Link>
                <Link className="button button--ghost" href="/settings">Settings</Link>
              </div>
            </div>
          ) : auth.user ? (
            <div className="workspace-callout">
              <div><span className="status-badge">EMPTY BY DEFAULT</span><h2>{t("workspaceTitle")}</h2><p>{t("workspaceBody")}</p></div>
              <div className="button-row"><Link className="button" href="/onboarding">{t("setupCta")}<ArrowRight size={16} /></Link></div>
            </div>
          ) : (
            <div className="workspace-callout">
              <div><span className="status-badge">EMPTY BY DEFAULT</span><h2>{t("workspaceTitle")}</h2><p>{t("workspaceBody")}</p></div>
              <div className="button-row"><Link className="button" href="/onboarding">{t("setupCta")}<ArrowRight size={16} /></Link><Link className="button button--ghost" href="/login">{t("signInCta")}</Link></div>
            </div>
          )}
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
