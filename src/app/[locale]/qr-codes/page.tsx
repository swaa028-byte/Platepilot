import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import QRCode from "qrcode";
import { requireUser } from "@/server/auth/server";
import { PrintButton } from "@/components/staff/PrintButton";

export const dynamic = "force-dynamic";

type Location = { locationId: string; organizationId: string; name: string; currency: string; role: string };
type TableRow = { id: string; name: string; capacity: number };

export const metadata: Metadata = { title: "Table QR codes", robots: { index: false } };

/**
 * A printable sheet of table QR codes.
 *
 * Each code opens the location's menu page with the table in the address, so
 * a guest who scans it lands on the menu already identified as sitting at
 * that table. The sheet is plain HTML sized for A4; the browser's print
 * dialog does the rest, and the codes are vector SVG so they survive scaling.
 */
export default async function QrCodesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ location?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("QrCodes");

  let locations: Location[] = [];
  let signedIn = true;
  let supabaseRef: Awaited<ReturnType<typeof requireUser>>["supabase"] | null = null;
  try {
    const auth = await requireUser();
    supabaseRef = auth.supabase;
    const { data } = await auth.supabase.rpc("app_my_locations", { p_actor: auth.user.id });
    locations = (data ?? []) as Location[];
  } catch {
    signedIn = false;
  }

  const requested = (await searchParams).location;
  const selected = locations.find((item) => item.locationId === requested) ?? locations[0];

  let tables: TableRow[] = [];
  let slug: string | null = null;
  if (supabaseRef && selected) {
    const [tableResult, locationResult] = await Promise.all([
      supabaseRef.from("restaurant_tables").select("id,name,capacity").eq("location_id", selected.locationId),
      supabaseRef.from("locations").select("slug").eq("id", selected.locationId).maybeSingle(),
    ]);
    tables = ((tableResult.data ?? []) as TableRow[]).sort((a, b) => a.name.localeCompare(b.name));
    slug = (locationResult.data as { slug: string | null } | null)?.slug ?? null;
  }

  const origin = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const codes = slug
    ? await Promise.all(
        tables.map(async (table) => ({
          table,
          svg: await QRCode.toString(`${origin}/${locale}/r/${slug}/menu?table=${table.id}`, {
            type: "svg",
            margin: 1,
            errorCorrectionLevel: "M",
          }),
        })),
      )
    : [];

  return (
    <div className="op-page qr-page">
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
          ) : !slug ? (
            <p className="op-empty">{t("noStorefront")}</p>
          ) : codes.length === 0 ? (
            <p className="op-empty">{t("noTables")}</p>
          ) : (
            <>
              <div className="op-actions qr-page__actions no-print">
                <p className="qr-page__hint">{t("scanHint")}</p>
                <PrintButton label={t("print")} />
              </div>
              <div className="qr-sheet">
                {codes.map(({ table, svg }) => (
                  <figure key={table.id} className="qr-card">
                    <div
                      className="qr-card__code"
                      data-qr-url={`${origin}/${locale}/r/${slug}/menu?table=${table.id}`}
                      dangerouslySetInnerHTML={{ __html: svg }}
                    />
                    <figcaption>
                      <strong>{selected.name}</strong>
                      <span className="qr-card__table">{table.name}</span>
                      <span className="qr-card__hint">{t("scanHint")}</span>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
