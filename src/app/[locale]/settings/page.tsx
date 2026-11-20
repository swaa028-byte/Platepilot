import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/server/auth/server";
import { ServiceSettings } from "@/components/settings/ServiceSettings";
import { VenueBook } from "@/components/settings/VenueBook";
import { Suppliers } from "@/components/settings/Suppliers";

export const dynamic = "force-dynamic";

type Location = { locationId: string; name: string; currency: string; role: string };

/**
 * Where a merchant changes how the location trades: whether the storefront takes
 * orders, when it is open, what delivery costs, which tables exist and who has
 * been eating here. This is the surface that was missing, which is why ordering
 * and reservations could not be used at all.
 */
export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ location?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Settings");

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
    <div className="op-page">
      <section className="page-hero page-hero--compact">
        <div className="shell">
          <p className="eyebrow"><span />{t("eyebrow")}</p>
          <h1>{t("title")}</h1>
          <p className="page-lede">{t("description")}</p>
        </div>
      </section>

      <section className="section section--tight">
        <div className="shell">
          {!signedIn ? (
            <p className="op-empty">{t("signInRequired")}</p>
          ) : !selected ? (
            <p className="op-empty">{t("noLocation")}</p>
          ) : (
            <>
              {locations.length > 1 && (
                <nav className="op-switcher" aria-label={t("locationSwitch")}>
                  {locations.map((location) => (
                    <Link
                      key={location.locationId}
                      href={`/settings?location=${location.locationId}`}
                      className={`op-switcher__item ${location.locationId === selected.locationId ? "is-active" : ""}`}
                      aria-current={location.locationId === selected.locationId ? "page" : undefined}
                    >
                      {location.name}
                    </Link>
                  ))}
                </nav>
              )}
              <ServiceSettings locationId={selected.locationId} locationName={selected.name} />
              <VenueBook locationId={selected.locationId} currency={selected.currency} />
              <Suppliers locationId={selected.locationId} />
            </>
          )}
        </div>
      </section>
    </div>
  );
}
