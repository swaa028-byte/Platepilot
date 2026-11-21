"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Link } from "@/i18n/navigation";

export type Campaign = {
  id: string;
  kind: "popup" | "banner";
  headline: string;
  body: string;
  ctaLabel: string | null;
  ctaHref: string | null;
  discountCode: string | null;
};

/**
 * A merchant's own announcement, shown once per visit. The content is the
 * merchant's; this component only decides when to stop interrupting.
 */
export function CampaignPopup({ campaign }: { campaign: Campaign }) {
  const t = useTranslations("Storefront");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const key = `campaign-seen-${campaign.id}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // Storage can be unavailable (private mode); showing the popup is safe.
    }
    setOpen(true);
  }, [campaign.id]);

  if (!open) return null;

  return (
    <div className="campaign-popup" role="dialog" aria-label={campaign.headline}>
      <div className="campaign-popup__card">
        <button type="button" className="campaign-popup__close" aria-label={t("dismiss")} onClick={() => setOpen(false)}>
          <X size={16} aria-hidden="true" />
        </button>
        <p className="campaign-popup__eyebrow">{t("announcement")}</p>
        <h2>{campaign.headline}</h2>
        {campaign.body && <p>{campaign.body}</p>}
        {campaign.discountCode && <p className="campaign-popup__code">{t("code")}: <strong>{campaign.discountCode}</strong></p>}
        {campaign.ctaLabel && campaign.ctaHref && (
          <Link href={campaign.ctaHref} className="button button--hero campaign-popup__cta" onClick={() => setOpen(false)}>
            {campaign.ctaLabel}
          </Link>
        )}
      </div>
    </div>
  );
}
