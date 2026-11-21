"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Calculator, Check, ClipboardList, Loader2 } from "lucide-react";

/**
 * Stock counting.
 *
 * The ledger knows what should be on the shelf; only a physical count knows
 * what is. A count snapshots the ledger when it opens, the staff type in what
 * they actually found, and completing it writes one adjustment per differing
 * ingredient — once.
 */
type CountLine = { ingredientId: string; name: string; baseUnit: string; systemMilliUnits: string };
type CountHistory = { stockCountId: string; status: string; createdAt: string; completedAt: string | null; lines: number; varianceLines: number };
type Variance = { name: string; baseUnit: string; systemMilliUnits: string; countedMilliUnits: string; varianceMilliUnits: string };

function units(milli: string) {
  return (Number(milli) / 1000).toString();
}

export function StockCounts({ locationId }: { locationId: string }) {
  const t = useTranslations("Settings");
  const [open, setOpen] = useState<{ stockCountId: string; lines: CountLine[] } | null>(null);
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<CountHistory[] | null>(null);
  const [variance, setVariance] = useState<Variance[] | null>(null);
  const [busy, setBusy] = useState<"idle" | "writing">("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/staff/stock-counts?locationId=${locationId}`);
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "REQUEST_REJECTED");
      setHistory((await response.json()) as CountHistory[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "REQUEST_REJECTED");
      setHistory([]);
    }
  }, [locationId]);

  useEffect(() => {
    void (async () => { await load(); })();
  }, [load]);

  async function start() {
    setBusy("writing"); setError(null); setNotice(null); setVariance(null);
    try {
      const response = await fetch("/api/staff/stock-counts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "REQUEST_REJECTED");
      setOpen({ stockCountId: body.stockCountId, lines: body.lines });
      setCounted(Object.fromEntries(body.lines.map((line: CountLine) => [line.ingredientId, units(line.systemMilliUnits)])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "REQUEST_REJECTED");
    } finally { setBusy("idle"); }
  }

  async function submit() {
    if (!open) return;
    setBusy("writing"); setError(null);
    try {
      const lines = open.lines.map((line) => ({
        ingredientId: line.ingredientId,
        countedMilliUnits: String(Math.max(0, Math.round(Number((counted[line.ingredientId] ?? "0").replace(",", ".") || "0") * 1000))),
      }));
      const response = await fetch("/api/staff/stock-counts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId, stockCountId: open.stockCountId, lines }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "REQUEST_REJECTED");
      setOpen(null);
      setCounted({});
      setVariance(body.variance as Variance[]);
      setNotice(body.adjusted === 0 ? t("stockCount.matched") : t("stockCount.completed", { count: body.adjusted }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "REQUEST_REJECTED");
    } finally { setBusy("idle"); }
  }

  return (
    <section className="op-card" aria-labelledby="stock-counts-title">
      <header className="op-card__head">
        <div>
          <p className="op-label">{t("stockCount.eyebrow")}</p>
          <h2 id="stock-counts-title">{t("stockCount.title")}</h2>
          <p className="op-note">{t("stockCount.description")}</p>
        </div>
      </header>

      {error && <p className="op-error" role="alert"><AlertCircle size={16} aria-hidden="true" />{error}</p>}
      {notice && <p className="op-ok"><Check size={16} aria-hidden="true" />{notice}</p>}

      {!open ? (
        <div className="op-inline-form">
          <button type="button" className="op-save" onClick={start} disabled={busy === "writing"}>
            {busy === "writing" ? <Loader2 size={16} className="op-spin" aria-hidden="true" /> : <ClipboardList size={16} aria-hidden="true" />}
            {t("stockCount.start")}
          </button>
        </div>
      ) : (
        <div className="op-rows">
          {open.lines.map((line) => (
            <div className="op-line-row" key={line.ingredientId}>
              <label className="op-figure">
                <span className="op-label">{line.name}</span>
                <span className="op-note">{t("stockCount.system", { amount: units(line.systemMilliUnits), unit: line.baseUnit })}</span>
              </label>
              <label className="op-figure op-figure--narrow">
                <span className="op-label">{t("stockCount.counted")}</span>
                <input inputMode="decimal" value={counted[line.ingredientId] ?? ""}
                  onChange={(event) => setCounted((current) => ({ ...current, [line.ingredientId]: event.target.value }))} />
              </label>
            </div>
          ))}
          <div className="op-line-row">
            <button type="button" className="op-save" onClick={submit} disabled={busy === "writing"}>
              {busy === "writing" ? <Loader2 size={16} className="op-spin" aria-hidden="true" /> : <Calculator size={16} aria-hidden="true" />}
              {t("stockCount.submit")}
            </button>
            <button type="button" className="op-add" onClick={() => { setOpen(null); setCounted({}); }}>{t("stockCount.abandon")}</button>
          </div>
        </div>
      )}

      {variance !== null && variance.length > 0 && (
        <ul className="op-rows">
          <li className="op-row"><strong>{t("stockCount.varianceTitle")}</strong></li>
          {variance.map((line) => (
            <li key={line.name} className="op-row">
              <span className="op-row__name">{line.name}</span>
              <span className="op-row__meta">{units(line.systemMilliUnits)} → {units(line.countedMilliUnits)} {line.baseUnit}</span>
              <span className={`op-pill ${line.varianceMilliUnits.startsWith("-") ? "op-pill--cancelled" : "op-pill--received"}`}>
                {Number(line.varianceMilliUnits) > 0 ? "+" : ""}{units(line.varianceMilliUnits)} {line.baseUnit}
              </span>
            </li>
          ))}
        </ul>
      )}

      {history === null ? (
        <p className="op-empty"><Loader2 size={16} className="op-spin" aria-hidden="true" />{t("loading")}</p>
      ) : history.length === 0 ? (
        <p className="op-empty"><ClipboardList size={16} aria-hidden="true" />{t("stockCount.none")}</p>
      ) : (
        <ul className="op-rows">
          {history.slice(0, 8).map((item) => (
            <li key={item.stockCountId} className="op-row">
              <span className="op-row__name">{new Date(item.createdAt).toLocaleDateString()}</span>
              <span className="op-row__meta">{t("stockCount.lines", { count: item.lines })}</span>
              <span className={`op-pill op-pill--${item.status}`}>
                {item.status === "completed" ? t("stockCount.state.completed") : item.status === "open" ? t("stockCount.state.open") : t("stockCount.state.cancelled")}
                {item.varianceLines > 0 ? ` · ${t("stockCount.variances", { count: item.varianceLines })}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
