"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertCircle, ArrowRight, Check, FileSpreadsheet, MapPin, Search, ShieldCheck } from "lucide-react";
import { displayMinorAmount, parseMenuCsv, type ImportedMenuItem } from "@/domain/menu";

type Place = { id: string; displayName?: { text: string }; formattedAddress?: string; attributions: { provider?: string; providerUri?: string }[] };
type Workspace = { organizationId: string; locationId: string; slug?: string };

export function OnboardingWizard({ persistenceConfigured, googleConfigured, localMode }: { persistenceConfigured: boolean; googleConfigured: boolean; localMode: boolean }) {
  const t = useTranslations("Onboarding");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [items, setItems] = useState<ImportedMenuItem[]>([]);
  const [published, setPublished] = useState(false);
  // Without a Places key the search button would only ever be disabled, so the
  // wizard opens on the manual form and mentions why discovery is absent.
  const [step, setStep] = useState(googleConfigured ? 1 : 2);
  const [session, setSession] = useState<"unknown" | "signedIn" | "signedOut">("unknown");
  const [email, setEmail] = useState("");
  const [form, setForm] = useState({ name: "", legalCountry: "", currency: "", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", locale, address: "" });

  useEffect(() => {
    let active = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { authenticated?: boolean }) => {
        if (active) setSession(body.authenticated ? "signedIn" : "signedOut");
      })
      .catch(() => { if (active) setSession("signedOut"); });
    return () => { active = false; };
  }, []);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) throw new Error("SIGN_IN_FAILED");
      setSession("signedIn");
    } catch {
      setError(t("error"));
    } finally { setBusy(false); }
  }

  function update(key: keyof typeof form, value: string) { setForm((current) => ({ ...current, [key]: value })); }

  async function search(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setSearched(false);
    try {
      const response = await fetch("/api/onboarding/places", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, locale }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "SEARCH_FAILED");
      setPlaces(body.places); setSearched(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("error")); }
    finally { setBusy(false); }
  }

  function selectPlace(place: Place) {
    setSelectedPlace(place);
    setForm((current) => ({ ...current, name: place.displayName?.text || current.name, address: place.formattedAddress || current.address }));
    setStep(2);
  }

  async function createWorkspace(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/onboarding/manual", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, placeId: selectedPlace?.id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "SETUP_FAILED");
      setWorkspace({ organizationId: body.organizationId, locationId: body.locationId, slug: body.slug }); setStep(3);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("error")); }
    finally { setBusy(false); }
  }

  async function preview(file: File | undefined) {
    if (!file) return; setError("");
    try { setItems(parseMenuCsv(await file.text())); }
    catch (cause) { setItems([]); setError(cause instanceof Error ? cause.message : t("error")); }
  }

  async function publish() {
    if (!workspace) { setError(t("authRequired")); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/menus/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...workspace, items }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "PUBLISH_FAILED");
      setPublished(true); setStep(4);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("error")); }
    finally { setBusy(false); }
  }

  return (
    <div className="shell onboarding-layout">
      <ol className="setup-steps" aria-label={t("eyebrow")}>
        {[t("stepOne"), t("stepTwo"), t("stepThree"), t("stepFour")].map((label, index) => <li key={label} className={`setup-step ${step === index + 1 ? "is-active" : ""} ${step > index + 1 ? "is-complete" : ""}`}><span>{step > index + 1 ? <Check size={13} /> : index + 1}</span>{label}</li>)}
      </ol>
      <div className="setup-panel">
        {!persistenceConfigured && <div className="notice notice--warning"><AlertCircle size={18} />{t("configRequired")}</div>}
        {error && <div className="notice notice--error" role="alert"><AlertCircle size={18} />{error}</div>}
        {session === "signedOut" && localMode && <form className="form-card" onSubmit={signIn}>
          <h2>{t("signInTitle")}</h2><p>{t("signInBody")}</p>
          <label className="field"><span>{t("signInEmail")}</span><input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <div className="form-actions"><button className="button" disabled={busy}><ShieldCheck size={16} />{busy ? t("creating") : t("signIn")}</button></div>
        </form>}
        {session === "signedOut" && !localMode && <div className="form-card">
          <h2>{t("signInTitle")}</h2><p>{t("signInRequired")}</p>
          <div className="form-actions"><a className="button" href={`/${locale}/login`}>{t("signInLink")}</a></div>
        </div>}
        {session === "signedIn" && step === 1 && <div className="form-card">
          <h2>{t("findTitle")}</h2><p>{t("findBody")}</p>
          {!googleConfigured && <div className="notice"><MapPin size={18} />{t("googleUnavailable")}</div>}
          <form className="search-row" onSubmit={search}><label className="field"><span>{t("queryLabel")}</span><input minLength={3} maxLength={160} required value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("queryPlaceholder")} /></label><button className="button" disabled={busy || !googleConfigured || !persistenceConfigured}><Search size={16} />{busy ? t("searching") : t("search")}</button></form>
          {searched && places.length === 0 && <p>{t("noResults")}</p>}
          {places.length > 0 && <div className="place-results">{places.map((place) => <article className="place-result" key={place.id}><h3>{place.displayName?.text || place.id}</h3><p>{place.formattedAddress}</p><button className="button button--small" onClick={() => selectPlace(place)}>{t("select")}<ArrowRight size={14} /></button>{place.attributions.map((attribution, index) => <p className="attribution" key={index}>{attribution.providerUri ? <a href={attribution.providerUri} target="_blank" rel="noreferrer">{attribution.provider || attribution.providerUri}</a> : attribution.provider}</p>)}</article>)}<p className="attribution">{t("googleAttribution")}</p></div>}
          <div className="divider-label">{t("or")}</div><button type="button" className="button button--ghost" onClick={() => setStep(2)}>{t("manual")}<ArrowRight size={16} /></button>
        </div>}
        {session === "signedIn" && step === 2 && <form className="form-card" onSubmit={createWorkspace}>
          <h2>{t("manualTitle")}</h2><p>{t("manualBody")}</p>
          {selectedPlace && <div className="notice"><MapPin size={17} />{selectedPlace.displayName?.text} · Place ID {selectedPlace.id}</div>}
          <div className="form-grid">
            <label className="field field--full"><span>{t("name")}</span><input required maxLength={120} value={form.name} onChange={(e) => update("name", e.target.value)} /></label>
            <label className="field field--full"><span>{t("address")}</span><input required maxLength={300} value={form.address} onChange={(e) => update("address", e.target.value)} /></label>
            <label className="field"><span>{t("legalCountry")}</span><input required pattern="[A-Za-z]{2}" maxLength={2} value={form.legalCountry} onChange={(e) => update("legalCountry", e.target.value.toUpperCase())} placeholder={t("countryPlaceholder")} /></label>
            <label className="field"><span>{t("currency")}</span><select required value={form.currency} onChange={(e) => update("currency", e.target.value)}><option value="" disabled>—</option>{["USD", "EUR", "GBP", "ZAR", "CAD", "AUD", "NGN", "KES", "JPY", "KWD"].map((code) => <option key={code}>{code}</option>)}</select></label>
            <label className="field"><span>{t("timezone")}</span><input required value={form.timezone} onChange={(e) => update("timezone", e.target.value)} /></label>
            <label className="field"><span>{t("locale")}</span><select value={form.locale} onChange={(e) => update("locale", e.target.value)}>{["en", "fr", "es", "pt", "ar"].map((item) => <option key={item}>{item}</option>)}</select></label>
          </div>
          <div className="form-actions"><button className="button" disabled={busy}>{busy ? t("creating") : t("continue")}<ArrowRight size={16} /></button><button type="button" className="button button--ghost" onClick={() => setStep(1)}>{t("stepOne")}</button></div>
        </form>}
        {session === "signedIn" && step === 3 && <div className="form-card">
          <h2>{t("menuTitle")}</h2><p>{t("menuBody")}</p>
          <label className="csv-drop"><FileSpreadsheet size={32} /><strong>{t("chooseCsv")}</strong><input type="file" accept=".csv,text/csv" onChange={(event) => preview(event.target.files?.[0])} /><p>{t("csvFormat")}</p></label>
          {items.length > 0 && <><div className="menu-preview"><table><thead><tr><th>Category</th><th>Item</th><th>Price</th><th>Available</th></tr></thead><tbody>{items.map((item) => <tr key={`${item.category}-${item.item}`}><td>{item.category}</td><td>{item.item}<br /><small>{item.allergens.join(", ")}</small></td><td>{displayMinorAmount(item.amountMinor, item.currency)}</td><td>{item.available ? "Yes" : "No"}</td></tr>)}</tbody></table></div><button className="button" disabled={busy || published} onClick={publish}><Check size={16} />{t("publish")}</button></>}
          {!workspace && <div className="notice notice--warning"><ShieldCheck size={18} />{t("authRequired")}</div>}
          <div className="form-actions"><button type="button" className="button button--ghost" onClick={() => setStep(4)}>{t("skipMenu")}</button><button type="button" className="button button--ghost" onClick={() => setStep(2)}>{t("stepTwo")}</button></div>
        </div>}
        {session === "signedIn" && step === 4 && <div className="form-card"><h2>{t("reviewTitle")}</h2><p>{t("reviewBody")}</p>{published && <div className="notice notice--success"><Check size={18} />{t("publish")}</div>}{workspace?.slug && <p className="storefront-link"><Check size={16} aria-hidden="true" /><a href={`/${locale}/r/${workspace.slug}`}>{t("yourStorefront")}</a></p>}<h3>{t("reviewChecklist")}</h3><ul className="release-gates">{["Merchant ownership review", "Service hours, zones and fulfillment settings", "Verified merchant payment account", "Authorized sandbox payment → kitchen ticket test", "Staff pilot and live-release approval"].map((gate) => <li key={gate}><AlertCircle size={16} />{gate}</li>)}</ul></div>}
      </div>
    </div>
  );
}
