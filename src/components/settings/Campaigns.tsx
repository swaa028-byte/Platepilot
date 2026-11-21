"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Loader2, Plus, Trash2 } from "lucide-react";

/**
 * Storefront campaigns: the scheduled popup or banner customers see. The
 * discount code it advertises is enforced by the promotions rules at order
 * time, so an expired code in an ad is a wasted ad, never a free discount.
 */
type Campaign = {
  campaignId: string | null;
  kind: "popup" | "banner";
  headline: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  discountCode: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
};

function toStamp(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function fromStamp(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 16);
}

export function Campaigns({ locationId }: { locationId: string }) {
  const t = useTranslations("Settings");
  const [items, setItems] = useState<Campaign[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "saving" | "saved" | "failed">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(`/api/staff/campaigns?locationId=${locationId}`, { signal: controller.signal });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "REQUEST_REJECTED");
        const data = (await response.json()) as Array<Record<string, unknown>>;
        setItems(data.map((row) => ({
          campaignId: (row.id as string) ?? null,
          kind: (row.kind as "popup" | "banner") ?? "popup",
          headline: (row.headline as string) ?? "",
          body: (row.body as string) ?? "",
          ctaLabel: (row.ctaLabel as string) ?? "",
          ctaHref: (row.ctaHref as string) ?? "",
          discountCode: (row.discountCode as string) ?? "",
          startsAt: fromStamp(row.startsAt as string | null),
          endsAt: fromStamp(row.endsAt as string | null),
          active: Boolean(row.active ?? true),
        })));
        setState("ready");
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "REQUEST_REJECTED");
        setState("failed");
      }
    })();
    return () => controller.abort();
  }, [locationId]);

  function update(index: number, patch: Partial<Campaign>) {
    setItems((current) => (current ? current.map((item, at) => (at === index ? { ...item, ...patch } : item)) : current));
    if (state === "saved") setState("ready");
  }

  function addCampaign() {
    setItems((current) => (current ? [...current, {
      campaignId: null, kind: "popup", headline: "", body: "", ctaLabel: "", ctaHref: "",
      discountCode: "", startsAt: "", endsAt: "", active: true,
    }] : current));
    if (state === "saved") setState("ready");
  }

  async function save() {
    if (!items) return;
    setState("saving");
    setError(null);
    try {
      for (const item of items) {
        if (!item.headline.trim()) {
          setError("CAMPAIGN_INCOMPLETE");
          setState("failed");
          return;
        }
        const response = await fetch("/api/staff/campaigns", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locationId, campaignId: item.campaignId, kind: item.kind,
            headline: item.headline, body: item.body,
            ctaLabel: item.ctaLabel.trim() ? item.ctaLabel.trim() : null,
            ctaHref: item.ctaHref.trim() ? item.ctaHref.trim() : null,
            discountCode: item.discountCode.trim() ? item.discountCode.trim() : null,
            startsAt: toStamp(item.startsAt), endsAt: toStamp(item.endsAt), active: item.active,
          }),
        });
        if (!response.ok) {
          setError((await response.json().catch(() => ({}))).error ?? "REQUEST_REJECTED");
          setState("failed");
          return;
        }
      }
      setState("saved");
    } catch {
      setError("REQUEST_REJECTED");
      setState("failed");
    }
  }

  async function remove(index: number, campaignId: string | null) {
    setItems((current) => (current ? current.filter((_, at) => at !== index) : current));
    if (state === "saved") setState("ready");
    if (!campaignId) return;
    await fetch(`/api/staff/campaigns?campaignId=${campaignId}`, { method: "DELETE" });
  }

  if (state === "loading") {
    return (
      <section className="op-card op-card--loading" aria-busy="true">
        <Loader2 size={18} className="op-spin" aria-hidden="true" />
        <span>{t("loading")}</span>
      </section>
    );
  }

  if (state === "failed" && !items) {
    return (
      <section className="op-card" role="alert">
        <p className="op-error"><AlertCircle size={16} aria-hidden="true" />{t(`errors.${error ?? "REQUEST_REJECTED"}`, { fallback: t("errors.REQUEST_REJECTED") })}</p>
      </section>
    );
  }

  if (!items) return null;

  return (
    <section className="op-card">
      <header className="op-card__head">
        <div>
          <p className="op-label">{t("campaigns.eyebrow")}</p>
          <h2>{t("campaigns.title")}</h2>
          <p className="op-note">{t("campaigns.description")}</p>
        </div>
      </header>
      {items.length === 0 ? (
        <p className="op-empty">{t("campaigns.empty")}</p>
      ) : (
        <div className="op-rows op-campaigns">
          {items.map((item, index) => (
            <div className="op-campaigns__row" key={item.campaignId ?? `new-${index}`}>
              <div className="op-campaigns__head">
                <label className="op-figure">
                  <span className="op-label">{t("campaigns.kind")}</span>
                  <select value={item.kind} onChange={(event) => update(index, { kind: event.target.value as "popup" | "banner" })}>
                    <option value="popup">{t("campaigns.popup")}</option>
                    <option value="banner">{t("campaigns.banner")}</option>
                  </select>
                </label>
                <label className="op-toggle">
                  <input type="checkbox" checked={item.active} onChange={(event) => update(index, { active: event.target.checked })} />
                  <span className="op-toggle__track" aria-hidden="true"><span className="op-toggle__dot" /></span>
                  <span className="op-toggle__text">{t("campaigns.active")}</span>
                </label>
                <button type="button" className="op-add" aria-label={t("campaigns.delete")} onClick={() => remove(index, item.campaignId)}>
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
              <label className="op-figure op-figure--wide">
                <span className="op-label">{t("campaigns.headline")}</span>
                <input value={item.headline} maxLength={120} onChange={(event) => update(index, { headline: event.target.value })} />
              </label>
              <label className="op-figure op-figure--wide">
                <span className="op-label">{t("campaigns.body")}</span>
                <input value={item.body} maxLength={400} onChange={(event) => update(index, { body: event.target.value })} />
              </label>
              <div className="op-campaigns__pair">
                <label className="op-figure">
                  <span className="op-label">{t("campaigns.ctaLabel")}</span>
                  <input value={item.ctaLabel} maxLength={40} onChange={(event) => update(index, { ctaLabel: event.target.value })} />
                </label>
                <label className="op-figure">
                  <span className="op-label">{t("campaigns.ctaHref")}</span>
                  <input value={item.ctaHref} placeholder="/en/r/…" onChange={(event) => update(index, { ctaHref: event.target.value })} />
                </label>
              </div>
              <div className="op-campaigns__pair">
                <label className="op-figure">
                  <span className="op-label">{t("campaigns.discountCode")}</span>
                  <input value={item.discountCode} maxLength={40} onChange={(event) => update(index, { discountCode: event.target.value })} />
                </label>
                <label className="op-figure">
                  <span className="op-label">{t("campaigns.startsAt")}</span>
                  <input type="datetime-local" value={item.startsAt} onChange={(event) => update(index, { startsAt: event.target.value })} />
                </label>
                <label className="op-figure">
                  <span className="op-label">{t("campaigns.endsAt")}</span>
                  <input type="datetime-local" value={item.endsAt} onChange={(event) => update(index, { endsAt: event.target.value })} />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}
      {error && state === "failed" && (
        <p className="op-error" role="alert"><AlertCircle size={16} aria-hidden="true" />{t(`errors.${error}`, { fallback: t("errors.REQUEST_REJECTED") })}</p>
      )}
      {state === "saved" && <p className="op-success">{t("campaigns.saved")}</p>}
      <div className="op-sticky">
        <button type="button" className="op-save" onClick={addCampaign}>
          <Plus size={15} aria-hidden="true" />{t("campaigns.add")}
        </button>
        <button type="button" className="op-save" onClick={save} disabled={state === "saving"}>
          {state === "saving" ? <Loader2 size={15} className="op-spin" aria-hidden="true" /> : null}
          {state === "saving" ? t("campaigns.saving") : t("campaigns.save")}
        </button>
      </div>
    </section>
  );
}
