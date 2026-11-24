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
import { requireUser } from "@/server/auth/server";

export const dynamic = "force-dynamic";

export default async function OperationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Operations");
  // The page must reflect the merchant's reality: a signed-in owner with a
  // workspace sees their restaurant, not a pitch to create one.
  // requireUser() serves both hosted (Supabase Auth) and local (embedded
  // database, cookie session) mode — the raw Supabase client would throw
  // SUPABASE_NOT_CONFIGURED in local mode.
  let user: { id: string } | null = null;
  let workspaces: { locationId: string; name: string; address: string; role: string }[] = [];
  try {
    const auth = await requireUser();
    user = auth.user;
    const { data } = await auth.supabase.rpc("app_my_locations", { p_actor: user.id });
    workspaces = (data ?? []) as typeof workspaces;
  } catch {
    user = null;
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
          <h1>{t("title")}</h1>
          <p className="page-lede">{t("description")}</p>
        </div>
      </section>
      <section className="section operations-content">
        <div className="shell">
          {user && workspaces.length > 0 ? (
            <div className="workspace-callout workspace-callout--live">
              <div>
                <h2>{workspaces[0].name}</h2>
                <p>{workspaces[0].address}</p>
              </div>
              <div className="button-row">
                <Link className="button" href="/kitchen">{t("kitchen")}<ArrowRight size={16} /></Link>
                <Link className="button button--ghost" href="/settings">Settings</Link>
              </div>
            </div>
          ) : user ? (
            <div className="workspace-callout">
              <div><h2>{t("workspaceTitle")}</h2><p>{t("workspaceBody")}</p></div>
              <div className="button-row"><Link className="button" href="/onboarding">{t("setupCta")}<ArrowRight size={16} /></Link></div>
            </div>
          ) : (
            <div className="workspace-callout">
              <div><h2>{t("workspaceTitle")}</h2><p>{t("workspaceBody")}</p></div>
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