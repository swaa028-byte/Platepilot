"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Archive, CalendarClock, Check, Loader2, Plus } from "lucide-react";
import { displayMinorAmount, parseMenuCsv } from "@/domain/menu";

/**
 * Menus by service period.
 *
 * One price book served every hour; now a location can publish additional
 * scheduled menus — breakfast, lunch, dinner — and the storefront shows the
 * one that is serving at this moment, falling back to the always-on menu.
 */
type Book = {
  priceBookId: string; label: string | null; status: string; publishedAt: string | null; items: number;
  schedule: { days: string[]; start: string; end: string } | null;
};
type ParsedItem = { category: string; item: string; amountMinor: string; currency: string; available: boolean; description: string; allergens: string[] };
const DAY_KEYS = ["0", "1", "2", "3", "4", "5", "6"];

export function ServiceMenus({ locationId, organizationId, currency }: { locationId: string; organizationId: string; currency: string }) {
  const t = useTranslations("Settings");
  const [books, setBooks] = useState<Book[] | null>(null);
  const [label, setLabel] = useState("");
  const [days, setDays] = useState<string[]>(["1", "2", "3", "4", "5"]);
  const [start, setStart] = useState("06:00");
  const [end, setEnd] = useState("11:00");
  const [csv, setCsv] = useState("");
  const [parsed, setParsed] = useState<ParsedItem[] | null>(null);
  const [busy, setBusy] = useState<"idle" | "writing">("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/staff/menus?locationId=${locationId}`);
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "REQUEST_REJECTED");
      setBooks((await response.json()) as Book[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "REQUEST_REJECTED");
      setBooks([]);
    }
  }, [locationId]);

  useEffect(() => {
    void (async () => { await load(); })();
  }, [load]);

  function previewCsv(text: string) {
    setCsv(text);
    setError(null);
    try {
      const items = parseMenuCsv(text).map((item) => ({ ...item, currency }));
      setParsed(items.length > 0 ? items : null);
    } catch { setParsed(null); }
  }

  async function publish() {
    if (!parsed) return;
    setBusy("writing"); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/staff/menus", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId, locationId, label,
          schedule: { days, start, end },
          items: parsed.map((item) => ({
            category: item.category, item: item.item, description: item.description,
            allergens: item.allergens, amountMinor: item.amountMinor, currency, available: item.available,
          })),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "REQUEST_REJECTED");
      setNotice(t("menus.published", { label }));
      setLabel(""); setCsv(""); setParsed(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "REQUEST_REJECTED");
    } finally { setBusy("idle"); }
  }

  async function archive(priceBookId: string) {
    setBusy("writing"); setError(null);
    try {
      const response = await fetch("/api/staff/menus", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceBookId }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "REQUEST_REJECTED");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "REQUEST_REJECTED");
    } finally { setBusy("idle"); }
  }

  return (
    <section className="op-card" aria-labelledby="service-menus-title">
      <header className="op-card__head">
        <div>
          <p className="op-label">{t("menus.eyebrow")}</p>
          <h2 id="service-menus-title">{t("menus.title")}</h2>
          <p className="op-note">{t("menus.description")}</p>
        </div>
      </header>

      {error && <p className="op-error" role="alert"><AlertCircle size={16} aria-hidden="true" />{error}</p>}
      {notice && <p className="op-ok"><Check size={16} aria-hidden="true" />{notice}</p>}

      {books === null ? (
        <p className="op-empty"><Loader2 size={16} className="op-spin" aria-hidden="true" />{t("loading")}</p>
      ) : (
        <ul className="op-rows">
          {books.map((book) => (
            <li key={book.priceBookId} className="op-row">
              <span className="op-row__name">{book.label ?? t("menus.alwaysOn")}</span>
              <span className="op-row__meta">
                {book.schedule
                  ? t("menus.window", { start: book.schedule.start, end: book.schedule.end, days: book.schedule.days.length })
                  : t("menus.windowAlways")}
                {" · "}{t("menus.itemCount", { count: book.items })}
              </span>
              <span className={`op-pill op-pill--${book.status}`}>{book.status === "published" ? t("menus.state.published") : t("menus.state.archived")}</span>
              {book.status === "published" && (
                <button type="button" className="op-icon" aria-label={t("menus.archive", { label: book.label ?? "" })} disabled={busy === "writing"} onClick={() => archive(book.priceBookId)}>
                  <Archive size={14} aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="op-inline-form">
        <label className="op-figure">
          <span className="op-label">{t("menus.label")}</span>
          <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={t("menus.labelPlaceholder")} maxLength={60} />
        </label>
        <label className="op-figure op-figure--narrow">
          <span className="op-label">{t("menus.from")}</span>
          <input type="time" value={start} onChange={(event) => setStart(event.target.value)} />
        </label>
        <label className="op-figure op-figure--narrow">
          <span className="op-label">{t("menus.until")}</span>
          <input type="time" value={end} onChange={(event) => setEnd(event.target.value)} />
        </label>
      </div>
      <div className="op-inline-form" role="group" aria-label={t("menus.days")}>
        {DAY_KEYS.map((key) => (
          <label key={key} className={`op-day ${days.includes(key) ? "is-on" : ""}`}>
            <input type="checkbox" checked={days.includes(key)} onChange={(event) => setDays((current) => event.target.checked ? [...current, key] : current.filter((day) => day !== key))} />
            {t(`days.${key}`)}
          </label>
        ))}
      </div>
      <label className="op-figure op-figure--full">
        <span className="op-label">{t("menus.csv")}</span>
        <textarea rows={4} value={csv} onChange={(event) => previewCsv(event.target.value)} placeholder={t("menus.csvPlaceholder")} />
      </label>
      {parsed && (
        <p className="op-note">{t("menus.parsed", { count: parsed.length })} · {displayMinorAmount(parsed[0].amountMinor, currency)}</p>
      )}
      <div className="op-inline-form">
        <button type="button" className="op-save" disabled={busy === "writing" || !label.trim() || !parsed} onClick={publish}>
          {busy === "writing" ? <Loader2 size={16} className="op-spin" aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
          {t("menus.publish")}
        </button>
      </div>
      <p className="op-note"><CalendarClock size={13} aria-hidden="true" /> {t("menus.hint")}</p>
    </section>
  );
}
