"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Check, Loader2, Search, Trash2 } from "lucide-react";

/**
 * Integration surfaces a merchant configures once and trusts: their own domain
 * and their Google listing. Verification here always re-checks the real world
 * (DNS, or the Places service) instead of remembering a past success.
 */

type DomainRecord = {
  id: string; domain: string; status: string; verificationToken: string;
  verifiedAt: string | null; lastError: string | null;
};

export function DomainsPanel() {
  const t = useTranslations("Settings");
  const [domains, setDomains] = useState<DomainRecord[] | null>(null);
  const [dnsTarget, setDnsTarget] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/staff/domains");
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "REQUEST_REJECTED");
    const data = await response.json();
    setDomains(data.domains);
    setDnsTarget(data.dnsTarget);
  }

  useEffect(() => {
    (async () => {
      try { await load(); setState("ready"); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "REQUEST_REJECTED"); setState("failed"); }
    })();
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await action(); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "REQUEST_REJECTED"); }
    finally { setBusy(false); }
  }

  if (state === "loading") {
    return <section className="op-card op-card--loading" aria-busy="true"><Loader2 size={18} className="op-spin" aria-hidden="true" /><span>{t("loading")}</span></section>;
  }
  if (state === "failed") {
    return <section className="op-card" role="alert"><p className="op-error"><AlertCircle size={16} aria-hidden="true" />{t(`errors.${error ?? "REQUEST_REJECTED"}`, { fallback: t("errors.REQUEST_REJECTED") })}</p></section>;
  }

  return (
    <section className="op-card">
      <header className="op-card__head">
        <div>
          <p className="op-label">{t("domains.eyebrow")}</p>
          <h2>{t("domains.title")}</h2>
          <p className="op-note">{t("domains.description", { target: dnsTarget })}</p>
        </div>
      </header>
      {(domains ?? []).length === 0 && <p className="op-empty">{t("domains.empty")}</p>}
      <div className="op-rows">
        {(domains ?? []).map((record) => (
          <div className="op-line-row" key={record.id}>
            <span className="op-row__name">{record.domain}</span>
            <span className={`op-pill ${record.status === "verified" ? "op-pill--received" : "op-pill--draft"}`}>
              {record.status === "verified" ? t("domains.verified") : t("domains.pending")}
            </span>
            {record.status !== "verified" && record.lastError && <span className="op-row__meta">{record.lastError}</span>}
            <button type="button" className="op-save" disabled={busy} onClick={() => run(async () => {
              const response = await fetch("/api/staff/domains", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ domainId: record.id }),
              });
              if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "REQUEST_REJECTED");
            })}>{t("domains.verify")}</button>
            <button type="button" className="op-add" aria-label={t("domains.delete")} disabled={busy} onClick={() => run(async () => {
              await fetch(`/api/staff/domains?domainId=${record.id}`, { method: "DELETE" });
            })}><Trash2 size={14} aria-hidden="true" /></button>
          </div>
        ))}
      </div>
      <div className="op-inline-form">
        <label className="op-figure op-figure--wide">
          <span className="op-label">{t("domains.claim")}</span>
          <input value={draft} placeholder="orders.yourrestaurant.co.za" onChange={(event) => setDraft(event.target.value)} />
          <small>{t("domains.claimHint")}</small>
        </label>
        <button type="button" className="op-save" disabled={busy || draft.trim().length < 4} onClick={() => run(async () => {
          const response = await fetch("/api/staff/domains", {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ domain: draft.trim() }),
          });
          if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "REQUEST_REJECTED");
          setDraft("");
        })}>{t("domains.add")}</button>
      </div>
      {error && <p className="op-error" role="alert"><AlertCircle size={16} aria-hidden="true" />{t(`errors.${error}`, { fallback: t("errors.REQUEST_REJECTED") })}</p>}
    </section>
  );
}

type PlaceResult = { placeId: string; displayName: string; formattedAddress: string };

export function GoogleListingPanel({ locationId }: { locationId: string }) {
  const t = useTranslations("Settings");
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pasted, setPasted] = useState("");
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const response = await fetch(`/api/staff/places/link?locationId=${locationId}`);
      if (response.ok) setPlaceId((await response.json()).placeId ?? null);
    })();
  }, [locationId]);

  async function search() {
    setBusy(true); setNotice(null); setResults(null);
    const response = await fetch(`/api/staff/places/search?q=${encodeURIComponent(query)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setNotice(data.error ?? "REQUEST_REJECTED"); setBusy(false); return; }
    setResults(data.results ?? []);
    setBusy(false);
  }

  async function link(id: string) {
    setBusy(true);
    await fetch("/api/staff/places/link", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationId, placeId: id }),
    });
    setPlaceId(id); setResults(null); setBusy(false);
  }

  async function unlink() {
    setBusy(true);
    await fetch(`/api/staff/places/link?locationId=${locationId}`, { method: "DELETE" });
    setPlaceId(null); setBusy(false);
  }

  return (
    <section className="op-card">
      <header className="op-card__head">
        <div>
          <p className="op-label">{t("google.eyebrow")}</p>
          <h2>{t("google.title")}</h2>
          <p className="op-note">{t("google.description")}</p>
        </div>
      </header>
      <p className="op-sticky__state">
        {placeId ? <><Check size={15} aria-hidden="true" />{t("google.linked", { placeId })}</> : t("google.notLinked")}
      </p>
      {placeId && (
        <button type="button" className="op-add" onClick={unlink} disabled={busy}>{t("google.unlink")}</button>
      )}
      <div className="op-inline-form">
        <label className="op-figure op-figure--wide">
          <span className="op-label">{t("google.search")}</span>
          <input value={query} placeholder={t("google.searchPlaceholder")} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <button type="button" className="op-save" disabled={busy || query.trim().length < 3} onClick={search}>
          {busy ? <Loader2 size={15} className="op-spin" aria-hidden="true" /> : <Search size={15} aria-hidden="true" />}
          {t("google.find")}
        </button>
      </div>
      <div className="op-inline-form">
        <label className="op-figure op-figure--wide">
          <span className="op-label">{t("google.paste")}</span>
          <input value={pasted} placeholder={t("google.pastePlaceholder")} onChange={(event) => setPasted(event.target.value)} />
        </label>
        <button type="button" className="op-save" disabled={busy || pasted.trim().length < 10} onClick={() => link(pasted.trim())}>
          {t("google.link")}
        </button>
      </div>
      {notice && <p className="op-error" role="alert"><AlertCircle size={16} aria-hidden="true" />{t(`errors.${notice}`, { fallback: notice === "GOOGLE_NOT_CONFIGURED" ? t("google.notConfigured") : t("errors.REQUEST_REJECTED") })}</p>}
      {(results ?? []).map((result) => (
        <div className="op-line-row" key={result.placeId}>
          <span className="op-row__name">{result.displayName}</span>
          <span className="op-row__meta">{result.formattedAddress}</span>
          <button type="button" className="op-save" disabled={busy} onClick={() => link(result.placeId)}>{t("google.link")}</button>
        </div>
      ))}
    </section>
  );
}
