"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Check, CreditCard, Gift, Loader2, Save } from "lucide-react";

/**
 * Loyalty and gift cards.
 *
 * The programme is two rates: points earned per unit of money spent, and
 * points a unit of discount costs. Guests earn when an order is actually
 * paid, and spend points as a discount at checkout. Gift cards are issued
 * here with a code a guest can spend at checkout; a card can be disabled if
 * it is lost or was issued in error.
 */
type LoyaltyConfig = { earnPointsPerMinor: string; pointsPerDiscountMinor: string; enabled: boolean };
type GiftCard = { giftCardId: string; code: string; currency: string; initialMinor: string; balanceMinor: string; disabled: boolean };

function money(minor: string, currency: string) {
  return `${currency} ${(Number(minor) / 100).toFixed(2)}`;
}

export function Loyalty({ organizationId, currency }: { organizationId: string; currency: string }) {
  const t = useTranslations("Settings");
  const [config, setConfig] = useState<LoyaltyConfig | null>(null);
  const [earn, setEarn] = useState("1");
  const [redeem, setRedeem] = useState("100");
  const [enabled, setEnabled] = useState(false);
  const [cards, setCards] = useState<GiftCard[] | null>(null);
  const [amount, setAmount] = useState("");
  const [issued, setIssued] = useState<GiftCard | null>(null);
  const [busy, setBusy] = useState<"idle" | "writing">("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/staff/loyalty?organizationId=${organizationId}`);
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "REQUEST_REJECTED");
      const body = (await response.json()) as { config: LoyaltyConfig; giftCards: GiftCard[] };
      setConfig(body.config);
      setEarn(body.config.earnPointsPerMinor);
      setRedeem(body.config.pointsPerDiscountMinor);
      setEnabled(body.config.enabled);
      setCards(body.giftCards);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "REQUEST_REJECTED");
      setCards([]);
    }
  }, [organizationId]);

  useEffect(() => {
    void (async () => { await load(); })();
  }, [load]);

  async function post(payload: Record<string, unknown>) {
    const response = await fetch("/api/staff/loyalty", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "REQUEST_REJECTED");
    return body;
  }

  async function saveConfig() {
    setBusy("writing"); setError(null); setNotice(null);
    try {
      await post({
        action: "configure", organizationId,
        earnPointsPerMinor: String(Math.max(0, Math.round(Number(earn.replace(",", ".") || "0")))),
        pointsPerDiscountMinor: String(Math.max(1, Math.round(Number(redeem.replace(",", ".") || "100")))),
        enabled,
      });
      setNotice(t("loyalty.saved"));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "REQUEST_REJECTED");
    } finally { setBusy("idle"); }
  }

  async function issueCard() {
    setBusy("writing"); setError(null); setNotice(null); setIssued(null);
    try {
      const minor = String(Math.max(0, Math.round(Number(amount.replace(",", ".") || "0") * 100)));
      if (Number(minor) <= 0) throw new Error("INVALID_REQUEST");
      const card = (await post({ action: "issue", organizationId, initialMinor: minor, currency })) as GiftCard;
      setIssued(card);
      setAmount("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "REQUEST_REJECTED");
    } finally { setBusy("idle"); }
  }

  async function disableCard(giftCardId: string) {
    setBusy("writing"); setError(null);
    try {
      await post({ action: "disable", giftCardId });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "REQUEST_REJECTED");
    } finally { setBusy("idle"); }
  }

  return (
    <section className="op-card" aria-labelledby="loyalty-title">
      <header className="op-card__head">
        <div>
          <p className="op-label">{t("loyalty.eyebrow")}</p>
          <h2 id="loyalty-title">{t("loyalty.title")}</h2>
          <p className="op-note">{t("loyalty.description")}</p>
        </div>
      </header>

      {error && <p className="op-error" role="alert"><AlertCircle size={16} aria-hidden="true" />{error}</p>}
      {notice && <p className="op-ok"><Check size={16} aria-hidden="true" />{notice}</p>}

      {config && (
        <div className="op-rows">
          <div className="op-line-row">
            <label className="op-figure op-figure--narrow">
              <span className="op-label">{t("loyalty.earnRate")}</span>
              <input inputMode="decimal" value={earn} onChange={(event) => setEarn(event.target.value)} />
              <span className="op-note">{t("loyalty.earnHint")}</span>
            </label>
            <label className="op-figure op-figure--narrow">
              <span className="op-label">{t("loyalty.redeemRate")}</span>
              <input inputMode="decimal" value={redeem} onChange={(event) => setRedeem(event.target.value)} />
              <span className="op-note">{t("loyalty.redeemHint")}</span>
            </label>
            <label className="op-toggle">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
              />
              <span className="op-toggle__track" aria-hidden="true"><span className="op-toggle__dot" /></span>
              <span className="op-toggle__text">{t("loyalty.enabled")}</span>
            </label>
            <button type="button" className="op-save" onClick={saveConfig} disabled={busy === "writing"}>
              {busy === "writing" ? <Loader2 size={16} className="op-spin" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
              {t("loyalty.save")}
            </button>
          </div>
        </div>
      )}

      <div className="op-inline-form">
        <label className="op-figure op-figure--narrow">
          <span className="op-label">{t("loyalty.cardAmount")}</span>
          <input inputMode="decimal" placeholder="50.00" value={amount} onChange={(event) => setAmount(event.target.value)} />
        </label>
        <button type="button" className="op-save" onClick={issueCard} disabled={busy === "writing"}>
          {busy === "writing" ? <Loader2 size={16} className="op-spin" aria-hidden="true" /> : <Gift size={16} aria-hidden="true" />}
          {t("loyalty.issue")}
        </button>
      </div>

      {issued && (
        <p className="op-ok"><Check size={16} aria-hidden="true" />
          {t("loyalty.issued", { code: issued.code, value: money(issued.initialMinor, issued.currency) })}
        </p>
      )}

      {cards && cards.length > 0 && (
        <div className="op-rows">
          <p className="op-label">{t("loyalty.cards")}</p>
          {cards.map((card) => (
            <div className="op-line-row" key={card.giftCardId}>
              <span className="op-note">
                <CreditCard size={14} aria-hidden="true" /> <strong>{card.code}</strong> · {money(card.balanceMinor, card.currency)}
                {card.disabled ? ` · ${t("loyalty.disabled")}` : ""}
              </span>
              {!card.disabled && (
                <button type="button" className="op-add" onClick={() => disableCard(card.giftCardId)} disabled={busy === "writing"}>
                  {t("loyalty.disable")}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
