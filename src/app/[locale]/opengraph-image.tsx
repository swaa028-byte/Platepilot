import { ImageResponse } from "next/og";
import { routing, AppLocale } from "@/i18n/routing";

/**
 * The Open Graph card shared by every page under /:locale — the home page,
 * the operator surfaces, and each restaurant's storefront.
 *
 * Per https://ogp.me/, the image should be at least 1200×630 so it fills
 * link previews on Facebook, WhatsApp, X and messaging apps without
 * cropping. The card is generated at build time and cached.
 */
export const alt = "PlatePilot — Your restaurant, from first order to close";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: { locale: string } }) {
  const locale = (routing.locales as readonly string[]).includes(params.locale) ? (params.locale as AppLocale) : "en";
  const taglines: Record<string, string> = {
    en: "Your restaurant, from first order to close",
    fr: "Votre restaurant, de la première commande à la clôture",
    es: "Tu restaurante, del primer pedido al cierre",
    pt: "O seu restaurante, do primeiro pedido ao fecho",
    ar: "مطعمك، من أول طلب إلى الإغلاق",
  };

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 34,
          background: "linear-gradient(160deg, #16453a 0%, #103028 55%, #0b241d 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div
            style={{
              width: 78,
              height: 78,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 22,
              background: "#16a34a",
              color: "white",
              fontSize: 44,
              fontWeight: 700,
            }}
          >
            PP
          </div>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 700, color: "#fdfbf4", letterSpacing: -2 }}>
            PlatePilot
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 32, color: "#5fd68f", fontWeight: 600 }}>
          {taglines[locale] ?? taglines.en}
        </div>
      </div>
    ),
    { ...size }
  );
}
