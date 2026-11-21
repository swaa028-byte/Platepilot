"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";

/**
 * The tax export: a plain CSV of every invoice issued in the window, saved by
 * the browser from the export endpoint.
 */
export function TaxExport({ locationId }: { locationId: string }) {
  const t = useTranslations("Reports");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const ready = from !== "" && to !== "";
  const query = ready
    ? `?locationId=${locationId}&from=${encodeURIComponent(new Date(`${from}T00:00:00Z`).toISOString())}&to=${encodeURIComponent(new Date(`${to}T00:00:00Z`).toISOString())}`
    : "";

  return (
    <section className="op-card" aria-labelledby="tax-export-title">
      <header className="op-card__head">
        <div>
          <p className="op-label">{t("taxExport.eyebrow")}</p>
          <h2 id="tax-export-title">{t("taxExport.title")}</h2>
          <p className="op-note">{t("taxExport.description")}</p>
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
        {ready ? (
          <a className="op-save" href={`/api/staff/tax-export${query}`} download>
            <Download size={16} aria-hidden="true" />{t("taxExport.download")}
          </a>
        ) : (
          <button type="button" className="op-save" disabled>
            <Download size={16} aria-hidden="true" />{t("taxExport.download")}
          </button>
        )}
      </div>
    </section>
  );
}
