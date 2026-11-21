"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Check, MessageSquare, Send, UserPlus } from "lucide-react";

/**
 * SMS marketing campaigns.
 *
 * Consent first: a phone number enters the audience only when staff record it
 * together with the customer's verbal opt-in, and the consent event is kept
 * either way. A campaign is a draft until a manager sends it; sending
 * snapshots the audience once, one message per person, and the list shows how
 * many the worker has actually delivered.
 */
type AudienceEntry = { customerId: string; name: string; phone: string };
type Campaign = {
  campaignId: string; name: string; body: string; status: string;
  sentAt: string | null; recipients: number; delivered: number;
};

export function SmsCampaigns({ locationId, organizationId, role }: { locationId: string; organizationId: string; role: string }) {
  const t = useTranslations("Settings");
  const [audience, setAudience] = useState<AudienceEntry[] | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [campaignBody, setCampaignBody] = useState("");
  const [busy, setBusy] = useState<"idle" | "writing">("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/staff/sms-campaigns?locationId=${locationId}`);
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "REQUEST_REJECTED");
      const body = (await response.json()) as { audience: AudienceEntry[]; campaigns: Campaign[] };
      setAudience(body.audience);
      setCampaigns(body.campaigns);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "REQUEST_REJECTED");
      setAudience([]);
      setCampaigns([]);
    }
  }, [locationId]);

  useEffect(() => {
    void (async () => { await load(); })();
  }, [load]);

  async function post(payload: Record<string, unknown>) {
    const response = await fetch("/api/staff/sms-campaigns", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "REQUEST_REJECTED");
    return body;
  }

  async function recordConsent(optIn: boolean) {
    setBusy("writing"); setError(null); setNotice(null);
    try {
      await post({ action: "consent", organizationId, name, phone: optIn ? phone : undefined, optIn });
      setNotice(t("sms.consentRecorded"));
      setName(""); setPhone("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "REQUEST_REJECTED");
    } finally { setBusy("idle"); }
  }

  async function saveCampaign() {
    setBusy("writing"); setError(null); setNotice(null);
    try {
      await post({ action: "save", locationId, name: campaignName, body: campaignBody });
      setNotice(t("sms.draftSaved"));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "REQUEST_REJECTED");
    } finally { setBusy("idle"); }
  }

  async function sendCampaign(campaignId: string) {
    setBusy("writing"); setError(null); setNotice(null);
    try {
      const sent = (await post({ action: "send", campaignId })) as { enqueued?: number };
      setNotice(t("sms.sent", { count: sent.enqueued ?? 0 }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "REQUEST_REJECTED");
    } finally { setBusy("idle"); }
  }

  const manager = role === "owner" || role === "manager";

  return (
    <section className="op-card" aria-labelledby="sms-title">
      <header className="op-card__head">
        <div>
          <p className="op-label">{t("sms.eyebrow")}</p>
          <h2 id="sms-title">{t("sms.title")}</h2>
          <p className="op-note">{t("sms.description")}</p>
        </div>
      </header>

      {error && <p className="op-error" role="alert"><AlertCircle size={16} aria-hidden="true" />{error}</p>}
      {notice && <p className="op-ok"><Check size={16} aria-hidden="true" />{notice}</p>}

      <div className="op-inline-form">
        <label className="op-figure op-figure--narrow">
          <span className="op-label">{t("sms.customerName")}</span>
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
        </label>
        <label className="op-figure op-figure--narrow">
          <span className="op-label">{t("sms.phone")}</span>
          <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+15550101" inputMode="tel" />
          <span className="op-note">{t("sms.phoneHint")}</span>
        </label>
        <button type="button" className="op-save" onClick={() => recordConsent(true)} disabled={busy === "writing" || name.trim() === ""}>
          <UserPlus size={16} aria-hidden="true" />{t("sms.optIn")}
        </button>
        <button type="button" className="op-save" onClick={() => recordConsent(false)} disabled={busy === "writing" || name.trim() === ""}>
          {t("sms.optOut")}
        </button>
      </div>

      {audience !== null && audience.length > 0 && (
        <ul className="op-list">
          {audience.map((entry) => (
            <li className="op-line-row" key={entry.customerId}>
              <span>{entry.name}</span>
              <span className="op-note">{entry.phone}</span>
            </li>
          ))}
        </ul>
      )}
      {audience !== null && audience.length === 0 && <p className="op-note">{t("sms.noAudience")}</p>}

      {manager && (
        <div className="op-inline-form">
          <label className="op-figure op-figure--narrow">
            <span className="op-label">{t("sms.campaignName")}</span>
            <input value={campaignName} onChange={(event) => setCampaignName(event.target.value)} maxLength={60} />
          </label>
          <label className="op-figure">
            <span className="op-label">{t("sms.campaignBody")}</span>
            <textarea value={campaignBody} onChange={(event) => setCampaignBody(event.target.value)} maxLength={320} rows={2} />
            <span className="op-note">{t("sms.bodyHint")}</span>
          </label>
          <button type="button" className="op-save" onClick={saveCampaign} disabled={busy === "writing" || campaignName.trim() === "" || campaignBody.trim() === ""}>
            <MessageSquare size={16} aria-hidden="true" />{t("sms.saveDraft")}
          </button>
        </div>
      )}

      {campaigns !== null && campaigns.length > 0 && (
        <ul className="op-list">
          {campaigns.map((campaign) => (
            <li className="op-line-row" key={campaign.campaignId}>
              <span>{campaign.name}</span>
              <span className="op-note">
                {campaign.status === "draft"
                  ? t("sms.draft")
                  : t("sms.progress", { recipients: campaign.recipients, delivered: campaign.delivered })}
              </span>
              {manager && campaign.status === "draft" && (
                <button type="button" className="op-save" onClick={() => sendCampaign(campaign.campaignId)} disabled={busy === "writing"}>
                  <Send size={15} aria-hidden="true" />{t("sms.send")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {campaigns !== null && campaigns.length === 0 && <p className="op-note">{t("sms.noCampaigns")}</p>}
    </section>
  );
}
