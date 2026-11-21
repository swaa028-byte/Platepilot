import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireUser } from "@/server/auth/server";
import { DayEndReport } from "@/components/reports/DayEndReport";
import { AntiTheftReport } from "@/components/reports/AntiTheftReport";
import { TaxExport } from "@/components/reports/TaxExport";

export const dynamic = "force-dynamic";

type Location = { locationId: string; name: string; currency: string; role: string };

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ location?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Reports");

  let locations: Location[] = [];
  let signedIn = true;
  try {
    const { supabase, user } = await requireUser();
    const { data } = await supabase.rpc("app_my_locations", { p_actor: user.id });
    locations = (data ?? []) as Location[];
  } catch {
    signedIn = false;
  }

  const requested = (await searchParams).location;
  const selected = locations.find((item) => item.locationId === requested) ?? locations[0];

  return (
    <div className="reports-page">
      <section className="page-hero page-hero--compact">
        <div className="shell">
          <p className="eyebrow"><span />{t("eyebrow")}</p>
          <h1>{t("title")}</h1>
          <p className="page-lede">{t("description")}</p>
        </div>
      </section>
      <section className="section">
        <div className="shell">
          {!signedIn ? (
            <p className="report-empty">{t("signInRequired")}</p>
          ) : !selected ? (
            <p className="report-empty">{t("noLocation")}</p>
          ) : (
            <DayEndReport locationId={selected.locationId} />
          )}
          {signedIn && selected && (selected.role === "owner" || selected.role === "manager") && (
            <>
              <AntiTheftReport locationId={selected.locationId} currency={selected.currency} />
              <TaxExport locationId={selected.locationId} />
            </>
          )}
        </div>
      </section>
    </div>
  );
}
