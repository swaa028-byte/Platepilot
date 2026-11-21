"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Flag, ShieldAlert } from "lucide-react";

/**
 * The anti-theft exception report.
 *
 * One row per staff member seen in the window: what they sold, what they gave
 * away in discounts, what they voided, what they refunded and how their cash
 * drawer came out. Rates past the report's stated thresholds are flagged —
 * a flag is a question to ask, not an accusation.
 */
type StaffRow = {
  actor: string;
  orderCount: number;
  soldMinor: string;
  discountCount: number;
  discountMinor: string;
  voidCount: number;
  voidMinor: string;
  refundCount: number;
  refundMinor: string;
  cashVarianceCount: number;
  cashVarianceMinor: string;
};
type Report = { from: string; to: string; thresholds: { discountShare: number; voidShare: number; refundShare: number }; staff: StaffRow[] };

function day(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function AntiTheftReport({ locationId, currency }: { locationId: string; currency: string }) {
  const t = useTranslations("Reports");
  // The default window is the last seven days, fixed once at mount via lazy
  // initializers so the render itself never reads the clock twice.
  const [from, setFrom] = useState(() => new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10));
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!from || !to) return;
    setBusy(true); setError(null);
    try {
      const query = new URLSearchParams({
        locationId,
        from: new Date(`${from}T00:00:00Z`).toISOString(),
        to: new Date(`${to}T00:00:00Z`).toISOString(),
      });
      const response = await fetch(`/api/staff/theft-report?${query}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "REQUEST_REJECTED");
      setReport(body as Report);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "REQUEST_REJECTED");
      setReport(null);
    } finally { setBusy(false); }
  }, [locationId, from, to]);

  useEffect(() => {
    void (async () => { await load(); })();
  }, [load]);

  function flags(row: StaffRow): string[] {
    if (!report) return [];
    const sold = Number(row.soldMinor);
    const marks: string[] = [];
    if (sold > 0 && Number(row.discountMinor) / sold > report.thresholds.discountShare) marks.push(t("theft.flagDiscount"));
    if (sold > 0 && Number(row.voidMinor) / sold > report.thresholds.voidShare) marks.push(t("theft.flagVoid"));
    if (sold > 0 && Number(row.refundMinor) / sold > report.thresholds.refundShare) marks.push(t("theft.flagRefund"));
    if (Number(row.cashVarianceMinor) !== 0) marks.push(t("theft.flagCash"));
    return marks;
  }

  function money(minor: string) {
    return `${currency} ${(Number(minor) / 100).toFixed(2)}`;
  }

  return (
    <section className="op-card" aria-labelledby="theft-report-title">
      <header className="op-card__head">
        <div>
          <p className="op-label">{t("theft.eyebrow")}</p>
          <h2 id="theft-report-title">{t("theft.title")}</h2>
          <p className="op-note">{t("theft.description")}</p>
        </div>
      </header>

      <div className="op-inline-form">
        <label className="op-figure op-figure--narrow">
          <span className="op-label">{t("theft.from")}</span>
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="op-figure op-figure--narrow">
          <span className="op-label">{t("theft.to")}</span>
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <button type="button" className="op-save" onClick={() => void load()} disabled={busy}>
          {t("theft.refresh")}
        </button>
      </div>

      {error && <p className="op-error" role="alert"><AlertCircle size={16} aria-hidden="true" />{error}</p>}

      {report && (report.staff.length === 0 ? (
        <p className="op-empty">{t("theft.none")}</p>
      ) : (
        <div className="op-rows">
          {report.staff.map((row) => {
            const marks = flags(row);
            return (
              <div className="op-line-row" key={row.actor}>
                <span className="op-note">
                  <strong>{row.actor.slice(0, 8)}</strong> · {t("theft.sold", { amount: money(row.soldMinor), count: row.orderCount })}
                </span>
                <span className="op-note">
                  {t("theft.discounted", { amount: money(row.discountMinor), count: row.discountCount })} ·{" "}
                  {t("theft.voided", { amount: money(row.voidMinor), count: row.voidCount })} ·{" "}
                  {t("theft.refunded", { amount: money(row.refundMinor), count: row.refundCount })} ·{" "}
                  {t("theft.cash", { amount: money(row.cashVarianceMinor) })}
                </span>
                {marks.length > 0 && (
                  <span className="op-error" role="alert">
                    <Flag size={14} aria-hidden="true" />{marks.join(" · ")}
                  </span>
                )}
              </div>
            );
          })}
          <p className="op-note"><ShieldAlert size={14} aria-hidden="true" /> {t("theft.thresholdsNote")}</p>
        </div>
      ))}
    </section>
  );
}
