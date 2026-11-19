import { CircleAlert, TrendingDown, TrendingUp } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/server/auth/server";

/**
 * The day-end report.
 *
 * Everything is read from the orders the location has actually taken. The
 * headline is the net sales for the trading day, with the same weekday a week
 * earlier underneath it, because a number without a comparison only says that
 * money came in.
 */
type Report = {
  currency: string;
  from: string;
  to: string;
  totals: {
    orderCount: number;
    covers: number;
    grossSubtotalMinor: string;
    discountMinor: string;
    taxMinor: string;
    tipMinor: string;
    netTotalMinor: string;
    cancelledCount: number;
    cancelledMinor: string;
  };
  hourly: { hour: number; orderCount: number; netTotalMinor: string }[];
  channels: { channel: string; orderCount: number; netTotalMinor: string }[];
  serviceTypes: { serviceType: string; orderCount: number; netTotalMinor: string }[];
  exceptions: {
    discountOrderCount: number;
    discountMinor: string;
    largestDiscountMinor: string;
    fullyDiscountedCount: number;
    cancelledOrderCount: number;
  };
};

function formatMoney(minor: string, currency: string) {
  const value = Number(minor) / 100;
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(value);
  } catch {
    // A currency the runtime does not know is still a number to the merchant.
    return `${value.toFixed(2)} ${currency}`;
  }
}

export async function DayEndReport({ locationId }: { locationId: string }) {
  const t = await getTranslations("Reports");
  const { supabase, user } = await requireUser();

  const window = (await supabase.rpc("app_day_end_window", {
    p_location_id: locationId,
    p_from: null,
    p_to: null,
    p_actor: user.id,
  })).data as { from: string; to: string; timezone: string } | null;

  if (!window) {
    return <p className="report-empty">{t("notAvailable")}</p>;
  }

  const [current, previous] = await Promise.all([
    supabase.rpc("app_day_end_report", {
      p_location_id: locationId,
      p_from: window.from,
      p_to: window.to,
      p_actor: user.id,
    }),
    supabase.rpc("app_day_end_report", {
      p_location_id: locationId,
      p_from: new Date(new Date(window.from).getTime() - 7 * 86_400_000).toISOString(),
      p_to: new Date(new Date(window.to).getTime() - 7 * 86_400_000).toISOString(),
      p_actor: user.id,
    }),
  ]);

  if (current.error || !current.data) {
    return <p className="report-empty">{t("notAvailable")}</p>;
  }

  const report = current.data as unknown as Report;
  const lastWeek = previous.data as unknown as Report | null;
  const currency = report.currency;

  const net = Number(report.totals.netTotalMinor);
  const previousNet = lastWeek ? Number(lastWeek.totals.netTotalMinor) : null;
  const delta = previousNet && previousNet > 0 ? ((net - previousNet) / previousNet) * 100 : null;

  const peak = report.hourly.reduce(
    (best, hour) => (Number(hour.netTotalMinor) > Number(best?.netTotalMinor ?? "0") ? hour : best),
    report.hourly[0] ?? null,
  );

  return (
    <div className="report">
      <div className="report-headline">
        <p className="report-label">{t("netSales")}</p>
        <p className="report-figure">{formatMoney(report.totals.netTotalMinor, currency)}</p>
        {delta !== null && (
          <p className={`report-delta ${delta >= 0 ? "is-up" : "is-down"}`}>
            {delta >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
            {Math.abs(delta).toFixed(1)}% {t("versusLastWeek")}
          </p>
        )}
      </div>

      <div className="report-cards">
        <article className="report-card">
          <p className="report-label">{t("covers")}</p>
          <p className="report-value">{report.totals.covers}</p>
          <p className="report-note">{t("orders", { count: report.totals.orderCount })}</p>
        </article>
        <article className="report-card">
          <p className="report-label">{t("averageCheck")}</p>
          <p className="report-value">
            {report.totals.orderCount > 0
              ? formatMoney(String(Math.round(net / report.totals.orderCount)), currency)
              : t("no")}
          </p>
        </article>
        <article className="report-card">
          <p className="report-label">{t("discounts")}</p>
          <p className="report-value">{formatMoney(report.totals.discountMinor, currency)}</p>
          <p className="report-note">{t("discountOrders", { count: report.exceptions.discountOrderCount })}</p>
        </article>
        <article className="report-card">
          <p className="report-label">{t("cancelled")}</p>
          <p className="report-value">{formatMoney(report.totals.cancelledMinor, currency)}</p>
          <p className="report-note">{t("cancelledOrders", { count: report.totals.cancelledCount })}</p>
        </article>
      </div>

      {report.hourly.length > 0 && (
        <section className="report-block">
          <h3>{t("byHour")}</h3>
          <ul className="report-hours">
            {report.hourly.map((hour) => (
              <li key={hour.hour} className="report-hour">
                <span className="report-hour-label">{String(hour.hour).padStart(2, "0")}:00</span>
                <span className="report-hour-bar" aria-hidden="true">
                  <span
                    style={{
                      width: `${peak && peak.hour === hour.hour
                        ? 100
                        : Math.max(4, Math.round((Number(hour.netTotalMinor) / Math.max(1, Number(peak?.netTotalMinor ?? "1"))) * 100))}%`,
                    }}
                  />
                </span>
                <span className="report-hour-value">{formatMoney(hour.netTotalMinor, currency)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="report-columns">
        <section className="report-block">
          <h3>{t("byChannel")}</h3>
          {report.channels.length === 0 ? (
            <p className="report-note">{t("no")}</p>
          ) : (
            <ul className="report-list">
              {report.channels.map((channel) => (
                <li key={channel.channel}>
                  <span>{channel.channel}</span>
                  <span>{t("orders", { count: channel.orderCount })}</span>
                  <strong>{formatMoney(channel.netTotalMinor, currency)}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="report-block">
          <h3>{t("byServiceType")}</h3>
          {report.serviceTypes.length === 0 ? (
            <p className="report-note">{t("no")}</p>
          ) : (
            <ul className="report-list">
              {report.serviceTypes.map((service) => (
                <li key={service.serviceType}>
                  <span>{service.serviceType.replace("_", " ")}</span>
                  <span>{t("orders", { count: service.orderCount })}</span>
                  <strong>{formatMoney(service.netTotalMinor, currency)}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {(report.exceptions.largestDiscountMinor !== "0" || report.exceptions.fullyDiscountedCount > 0) && (
        <p className="report-warning">
          <CircleAlert size={16} />
          {t("largestDiscount", { amount: formatMoney(report.exceptions.largestDiscountMinor, currency) })}
        </p>
      )}
    </div>
  );
}
