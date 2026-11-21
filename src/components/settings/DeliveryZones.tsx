"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Loader2, Plus, Trash2 } from "lucide-react";

/**
 * Delivery zones for one location: named areas matched by postal-code prefix,
 * each with its own fee and minimum order. The longest matching prefix wins,
 * so "8001" can price the city bowl differently from the wider "80" region.
 */
type Zone = {
  zoneId: string | null;
  name: string;
  prefixes: string;
  fee: string;
  minOrder: string;
  active: boolean;
};

function fromMinor(value?: string) {
  const minor = Number(value ?? "0");
  return Number.isFinite(minor) ? (minor / 100).toFixed(2) : "0.00";
}

function toMinor(value: string) {
  const major = Number(value.replace(",", "."));
  if (!Number.isFinite(major) || major < 0) return "0";
  return String(Math.round(major * 100));
}

export function DeliveryZones({ locationId }: { locationId: string }) {
  const t = useTranslations("Settings");
  const [zones, setZones] = useState<Zone[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "saving" | "saved" | "failed">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(`/api/staff/delivery-zones?locationId=${locationId}`, { signal: controller.signal });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "REQUEST_REJECTED");
        const data = (await response.json()) as Array<{
          id: string; name: string; postalPrefixes: string[]; feeMinor: string; minOrderMinor: string; active: boolean;
        }>;
        setZones(data.map((zone) => ({
          zoneId: zone.id, name: zone.name, prefixes: zone.postalPrefixes.join(", "),
          fee: fromMinor(zone.feeMinor), minOrder: fromMinor(zone.minOrderMinor), active: zone.active,
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

  function update(index: number, patch: Partial<Zone>) {
    setZones((current) => (current ? current.map((zone, at) => (at === index ? { ...zone, ...patch } : zone)) : current));
    if (state === "saved") setState("ready");
  }

  function addZone() {
    setZones((current) => (current ? [...current, { zoneId: null, name: "", prefixes: "", fee: "0.00", minOrder: "0.00", active: true }] : current));
    if (state === "saved") setState("ready");
  }

  function removeZone(index: number) {
    setZones((current) => (current ? current.filter((_, at) => at !== index) : current));
    if (state === "saved") setState("ready");
  }

  async function save() {
    if (!zones) return;
    setState("saving");
    setError(null);
    try {
      for (const zone of zones) {
        if (!zone.name.trim() || !zone.prefixes.trim()) {
          setError("ZONE_INCOMPLETE");
          setState("failed");
          return;
        }
        const response = await fetch("/api/staff/delivery-zones", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            locationId, zoneId: zone.zoneId, name: zone.name,
            postalPrefixes: zone.prefixes.split(",").map((code) => code.trim()).filter(Boolean),
            feeMinor: toMinor(zone.fee), minOrderMinor: toMinor(zone.minOrder), active: zone.active,
          }),
        });
        if (!response.ok) {
          setError((await response.json().catch(() => ({}))).error ?? "REQUEST_REJECTED");
          setState("failed");
          return;
        }
      }
      const kept = new Set(zones.map((zone) => zone.zoneId).filter(Boolean));
      const response = await fetch(`/api/staff/delivery-zones?locationId=${locationId}`);
      const data = (await response.json()) as Array<{ id: string }>;
      for (const zone of data) {
        if (!kept.has(zone.id)) {
          await fetch(`/api/staff/delivery-zones?zoneId=${zone.id}`, { method: "DELETE" });
        }
      }
      setState("saved");
    } catch {
      setError("REQUEST_REJECTED");
      setState("failed");
    }
  }

  if (state === "loading") {
    return (
      <section className="op-card op-card--loading" aria-busy="true">
        <Loader2 size={18} className="op-spin" aria-hidden="true" />
        <span>{t("loading")}</span>
      </section>
    );
  }

  if (state === "failed" && !zones) {
    return (
      <section className="op-card" role="alert">
        <p className="op-error"><AlertCircle size={16} aria-hidden="true" />{t(`errors.${error ?? "REQUEST_REJECTED"}`, { fallback: t("errors.REQUEST_REJECTED") })}</p>
      </section>
    );
  }

  if (!zones) return null;

  return (
    <section className="op-card">
      <header className="op-card__head">
        <div>
          <p className="op-label">{t("zones.eyebrow")}</p>
          <h2>{t("zones.title")}</h2>
          <p className="op-note">{t("zones.description")}</p>
        </div>
      </header>
      {zones.length === 0 ? (
        <p className="op-empty">{t("zones.empty")}</p>
      ) : (
        <div className="op-rows op-zones">
          {zones.map((zone, index) => (
            <div className="op-zones__row" key={zone.zoneId ?? `new-${index}`}>
              <label className="op-figure">
                <span className="op-label">{t("zones.name")}</span>
                <input value={zone.name} maxLength={80} onChange={(event) => update(index, { name: event.target.value })} />
              </label>
              <label className="op-figure op-figure--wide">
                <span className="op-label">{t("zones.prefixes")}</span>
                <input value={zone.prefixes} placeholder="8001, 8005" onChange={(event) => update(index, { prefixes: event.target.value })} />
                <small>{t("zones.prefixesHint")}</small>
              </label>
              <label className="op-figure">
                <span className="op-label">{t("zones.fee")}</span>
                <input inputMode="decimal" value={zone.fee} onChange={(event) => update(index, { fee: event.target.value })} />
              </label>
              <label className="op-figure">
                <span className="op-label">{t("zones.minOrder")}</span>
                <input inputMode="decimal" value={zone.minOrder} onChange={(event) => update(index, { minOrder: event.target.value })} />
              </label>
              <label className="op-toggle">
                <input type="checkbox" checked={zone.active} onChange={(event) => update(index, { active: event.target.checked })} />
                <span className="op-toggle__track" aria-hidden="true"><span className="op-toggle__dot" /></span>
                <span className="op-toggle__text">{t("zones.active")}</span>
              </label>
              <button type="button" className="op-add" aria-label={t("zones.delete")} onClick={() => removeZone(index)}>
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
      {error && state === "failed" && (
        <p className="op-error" role="alert"><AlertCircle size={16} aria-hidden="true" />{t(`errors.${error}`, { fallback: t("errors.REQUEST_REJECTED") })}</p>
      )}
      {state === "saved" && <p className="op-success">{t("zones.saved")}</p>}
      <div className="op-sticky">
        <button type="button" className="op-save" onClick={addZone}>
          <Plus size={15} aria-hidden="true" />{t("zones.add")}
        </button>
        <button type="button" className="op-save" onClick={save} disabled={state === "saving"}>
          {state === "saving" ? <Loader2 size={15} className="op-spin" aria-hidden="true" /> : null}
          {state === "saving" ? t("zones.saving") : t("zones.save")}
        </button>
      </div>
    </section>
  );
}
