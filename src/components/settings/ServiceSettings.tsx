"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Check, Loader2, Plus, Trash2 } from "lucide-react";

/**
 * The settings a merchant orders by.
 *
 * The panel is a draft over what the server holds: nothing reaches the
 * storefront until Save, and a rejected save keeps the draft so the merchant can
 * correct the one value that was refused instead of retyping the form.
 */
type Window = [string, string];

type ServiceSettings = {
  openingHours?: Record<string, Window[]>;
  deliveryFeeMinor?: string;
  minimumOrderMinor?: string;
  taxBasisPoints?: number;
  prepMinutes?: number;
  serviceArea?: { postalCodes?: string[] };
  sms?: { enabled?: boolean; phone?: string };
};

type Response = {
  locationId: string;
  orderingEnabled: boolean;
  serviceSettings: ServiceSettings;
};

type Draft = {
  orderingEnabled: boolean;
  hours: Record<string, Window[]>;
  deliveryFee: string;
  minimumOrder: string;
  taxPercent: string;
  prepMinutes: string;
  postalCodes: string;
  smsEnabled: boolean;
  smsPhone: string;
};

const DAYS = ["1", "2", "3", "4", "5", "6", "0"];

function fromMinor(value?: string) {
  const minor = Number(value ?? "0");
  return Number.isFinite(minor) ? (minor / 100).toFixed(2) : "0.00";
}

function toMinor(value: string) {
  const major = Number(value.replace(",", "."));
  if (!Number.isFinite(major) || major < 0) return "0";
  return String(Math.round(major * 100));
}

function draftOf(settings: Response): Draft {
  const source = settings.serviceSettings ?? {};
  const hours: Record<string, Window[]> = {};
  for (const day of DAYS) {
    const windows = source.openingHours?.[day];
    hours[day] = Array.isArray(windows) ? windows.map((window) => [window[0], window[1]] as Window) : [];
  }
  return {
    orderingEnabled: settings.orderingEnabled,
    hours,
    deliveryFee: fromMinor(source.deliveryFeeMinor),
    minimumOrder: fromMinor(source.minimumOrderMinor),
    taxPercent: String((source.taxBasisPoints ?? 0) / 100),
    prepMinutes: String(source.prepMinutes ?? 0),
    postalCodes: (source.serviceArea?.postalCodes ?? []).join(", "),
    smsEnabled: Boolean(source.sms?.enabled),
    smsPhone: source.sms?.phone ?? "",
  };
}

function payloadOf(draft: Draft) {
  const openingHours: Record<string, Window[]> = {};
  for (const day of DAYS) {
    const windows = draft.hours[day].filter(([start, end]) => start && end);
    if (windows.length > 0) openingHours[day] = windows;
  }
  const postalCodes = draft.postalCodes.split(",").map((code) => code.trim()).filter(Boolean);
  return {
    orderingEnabled: draft.orderingEnabled,
    serviceSettings: {
      openingHours,
      deliveryFeeMinor: toMinor(draft.deliveryFee),
      minimumOrderMinor: toMinor(draft.minimumOrder),
      taxBasisPoints: Math.round(Number(draft.taxPercent || "0") * 100),
      prepMinutes: Math.round(Number(draft.prepMinutes || "0")),
      ...(postalCodes.length > 0 ? { serviceArea: { postalCodes } } : {}),
      ...(draft.smsPhone.trim() || draft.smsEnabled ? { sms: { enabled: draft.smsEnabled, phone: draft.smsPhone.trim() } } : {}),
    },
  };
}

export function ServiceSettings({ locationId, locationName }: { locationId: string; locationName: string }) {
  const t = useTranslations("Settings");
  const [server, setServer] = useState<Response | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "saving" | "saved" | "failed">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(`/api/staff/settings?locationId=${locationId}`, { signal: controller.signal });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "REQUEST_REJECTED");
        const data = (await response.json()) as Response;
        setServer(data);
        setDraft(draftOf(data));
        setState("ready");
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : "REQUEST_REJECTED");
        setState("failed");
      }
    })();
    return () => controller.abort();
  }, [locationId]);

  const dirty = useMemo(() => {
    if (!server || !draft) return false;
    return JSON.stringify(payloadOf(draft)) !== JSON.stringify(payloadOf(draftOf(server)));
  }, [draft, server]);

  function update(patch: Partial<Draft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    if (state === "saved") setState("ready");
  }

  function setWindow(day: string, index: number, position: 0 | 1, value: string) {
    if (!draft) return;
    const windows = draft.hours[day].map((window, at) =>
      at === index ? ([position === 0 ? value : window[0], position === 1 ? value : window[1]] as Window) : window,
    );
    update({ hours: { ...draft.hours, [day]: windows } });
  }

  function addWindow(day: string) {
    if (!draft) return;
    update({ hours: { ...draft.hours, [day]: [...draft.hours[day], ["17:00", "21:00"]] } });
  }

  function removeWindow(day: string, index: number) {
    if (!draft) return;
    update({ hours: { ...draft.hours, [day]: draft.hours[day].filter((_, at) => at !== index) } });
  }

  async function save() {
    if (!draft) return;
    setState("saving");
    setError(null);
    try {
      const response = await fetch("/api/staff/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId, ...payloadOf(draft) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "REQUEST_REJECTED");
        setState("failed");
        return;
      }
      setServer(data as Response);
      setDraft(draftOf(data as Response));
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

  if (state === "failed" && !draft) {
    return (
      <section className="op-card" role="alert">
        <p className="op-error"><AlertCircle size={16} aria-hidden="true" />{t(`errors.${error ?? "REQUEST_REJECTED"}`, { fallback: t("errors.REQUEST_REJECTED") })}</p>
      </section>
    );
  }

  if (!draft) return null;

  return (
    <section className="op-stack">
      <div className="op-card">
        <header className="op-card__head">
          <div>
            <p className="op-label">{t("service.eyebrow")}</p>
            <h2>{t("service.title", { location: locationName })}</h2>
            <p className="op-note">{t("service.description")}</p>
          </div>
          <label className="op-toggle">
            <input
              type="checkbox"
              checked={draft.orderingEnabled}
              onChange={(event) => update({ orderingEnabled: event.target.checked })}
            />
            <span className="op-toggle__track" aria-hidden="true"><span className="op-toggle__dot" /></span>
            <span className="op-toggle__text">
              {draft.orderingEnabled ? t("service.open") : t("service.closed")}
            </span>
          </label>
        </header>

        {!draft.orderingEnabled && (
          <p className="op-hint"><AlertCircle size={15} aria-hidden="true" />{t("service.closedHint")}</p>
        )}

        <div className="op-hours">
          <div className="op-hours__head">
            <p className="op-label">{t("service.hours")}</p>
            <p className="op-note">{t("service.hoursHint")}</p>
          </div>
          {DAYS.map((day) => (
            <div className="op-hours__row" key={day}>
              <span className="op-hours__day">{t(`days.${day}`)}</span>
              <div className="op-hours__windows">
                {draft.hours[day].length === 0 ? (
                  <span className="op-hours__closed">{t("service.closedDay")}</span>
                ) : (
                  draft.hours[day].map((window, index) => (
                    <div className="op-hours__window" key={`${day}-${index}`}>
                      <input
                        aria-label={t("service.opensAt", { day: t(`days.${day}`) })}
                        type="time"
                        value={window[0]}
                        onChange={(event) => setWindow(day, index, 0, event.target.value)}
                      />
                      <span aria-hidden="true">–</span>
                      <input
                        aria-label={t("service.closesAt", { day: t(`days.${day}`) })}
                        type="time"
                        value={window[1]}
                        onChange={(event) => setWindow(day, index, 1, event.target.value)}
                      />
                      <button type="button" className="op-icon" onClick={() => removeWindow(day, index)} aria-label={t("service.removeWindow")}>
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  ))
                )}
              </div>
              <button type="button" className="op-add" onClick={() => addWindow(day)} disabled={draft.hours[day].length >= 2}>
                <Plus size={14} aria-hidden="true" />{t("service.addWindow")}
              </button>
            </div>
          ))}
        </div>

        <div className="op-figures">
          <label className="op-figure">
            <span className="op-label">{t("service.deliveryFee")}</span>
            <input inputMode="decimal" value={draft.deliveryFee} onChange={(event) => update({ deliveryFee: event.target.value })} />
            <small>{t("service.deliveryFeeHint")}</small>
          </label>
          <label className="op-figure">
            <span className="op-label">{t("service.minimumOrder")}</span>
            <input inputMode="decimal" value={draft.minimumOrder} onChange={(event) => update({ minimumOrder: event.target.value })} />
            <small>{t("service.minimumOrderHint")}</small>
          </label>
          <label className="op-figure">
            <span className="op-label">{t("service.tax")}</span>
            <input inputMode="decimal" value={draft.taxPercent} onChange={(event) => update({ taxPercent: event.target.value })} />
            <small>{t("service.taxHint")}</small>
          </label>
          <label className="op-figure">
            <span className="op-label">{t("service.prepMinutes")}</span>
            <input inputMode="numeric" value={draft.prepMinutes} onChange={(event) => update({ prepMinutes: event.target.value })} />
            <small>{t("service.prepMinutesHint")}</small>
          </label>
          <label className="op-figure op-figure--wide">
            <span className="op-label">{t("service.postalCodes")}</span>
            <input value={draft.postalCodes} placeholder={t("service.postalCodesPlaceholder")} onChange={(event) => update({ postalCodes: event.target.value })} />
            <small>{t("service.postalCodesHint")}</small>
          </label>
        </div>

        <div className="op-figures">
          <label className="op-figure">
            <span className="op-label">{t("service.smsPhone")}</span>
            <input value={draft.smsPhone} placeholder="+27…" onChange={(event) => update({ smsPhone: event.target.value })} />
            <small>{t("service.smsPhoneHint")}</small>
          </label>
          <label className="op-toggle">
            <input type="checkbox" checked={draft.smsEnabled} onChange={(event) => update({ smsEnabled: event.target.checked })} />
            <span className="op-toggle__track" aria-hidden="true"><span className="op-toggle__dot" /></span>
            <span className="op-toggle__text">{t("service.smsEnabled")}</span>
          </label>
        </div>
      </div>

      <div className="op-sticky" data-dirty={dirty ? "true" : "false"}>
        <p className="op-sticky__state">
          {state === "saved" && !dirty ? <><Check size={15} aria-hidden="true" />{t("service.saved")}</> : dirty ? t("service.unsaved") : t("service.upToDate")}
        </p>
        {error && <p className="op-error" role="alert"><AlertCircle size={15} aria-hidden="true" />{t(`errors.${error}`, { fallback: t("errors.REQUEST_REJECTED") })}</p>}
        <button type="button" className="op-save" onClick={save} disabled={!dirty || state === "saving"}>
          {state === "saving" ? <Loader2 size={16} className="op-spin" aria-hidden="true" /> : null}
          {state === "saving" ? t("service.saving") : t("service.save")}
        </button>
      </div>
    </section>
  );
}
