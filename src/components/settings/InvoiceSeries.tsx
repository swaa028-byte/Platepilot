"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Check, FileText, Loader2, Plus } from "lucide-react";

/**
 * Invoice series.
 *
 * A series is a numbered counter: invoice numbers run without gaps, which is
 * what several tax authorities require. An invoice is issued from a paid
 * order; the export on the reports page is the accountant's view.
 */
type Series = { seriesId: string; name: string; prefix: string; nextNumber: string; active: boolean };

export function InvoiceSeries({ locationId }: { locationId: string }) {
  const t = useTranslations("Settings");
  const [series, setSeries] = useState<Series[] | null>(null);
  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("");
  const [busy, setBusy] = useState<"idle" | "writing">("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/staff/invoice-series?locationId=${locationId}`);
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "REQUEST_REJECTED");
      setSeries((await response.json()) as Series[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "REQUEST_REJECTED");
      setSeries([]);
    }
  }, [locationId]);

  useEffect(() => {
    void (async () => { await load(); })();
  }, [load]);

  async function create() {
    setBusy("writing"); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/staff/invoice-series", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId, name, prefix }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "REQUEST_REJECTED");
      setNotice(t("invoices.created", { name }));
      setName(""); setPrefix("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "REQUEST_REJECTED");
    } finally { setBusy("idle"); }
  }

  return (
    <section className="op-card" aria-labelledby="invoice-series-title">
      <header className="op-card__head">
        <div>
          <p className="op-label">{t("invoices.eyebrow")}</p>
          <h2 id="invoice-series-title">{t("invoices.title")}</h2>
          <p className="op-note">{t("invoices.description")}</p>
        </div>
      </header>

      {error && <p className="op-error" role="alert"><AlertCircle size={16} aria-hidden="true" />{error}</p>}
      {notice && <p className="op-ok"><Check size={16} aria-hidden="true" />{notice}</p>}

      <div className="op-inline-form">
        <label className="op-figure">
          <span className="op-label">{t("invoices.name")}</span>
          <input value={name} placeholder="Sales" onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="op-figure op-figure--narrow">
          <span className="op-label">{t("invoices.prefix")}</span>
          <input value={prefix} placeholder="INV-" onChange={(event) => setPrefix(event.target.value)} />
        </label>
        <button type="button" className="op-save" onClick={create} disabled={busy === "writing" || name.trim() === ""}>
          {busy === "writing" ? <Loader2 size={16} className="op-spin" aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
          {t("invoices.create")}
        </button>
      </div>

      {series && series.length > 0 && (
        <div className="op-rows">
          {series.map((item) => (
            <div className="op-line-row" key={item.seriesId}>
              <span className="op-note"><FileText size={14} aria-hidden="true" /> <strong>{item.prefix}{item.nextNumber}</strong> · {item.name}</span>
              <span className="op-note">{t("invoices.nextNumber", { number: item.nextNumber })}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
