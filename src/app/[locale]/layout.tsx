import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { SiteChrome } from "@/components/ui/SiteChrome";
import { chivoMono, notoSansArabic } from "../fonts";
import { appBaseUrl, ogAlternateLocales, ogLocale } from "@/domain/seo";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const base = appBaseUrl();
  return {
    metadataBase: new URL(base),
    title: t("title"),
    description: t("description"),
    applicationName: "PlatePilot",
    robots: { index: true, follow: true },
    manifest: "/manifest.webmanifest",
    alternates: {
      canonical: `${base}/${locale}`,
      // hreflang alternates so search engines serve the right language.
      languages: Object.fromEntries(routing.locales.map((item) => [item, `${base}/${item}`])),
    },
    // Open Graph (https://ogp.me/): filled for every locale-scoped page;
    // the og:image itself comes from opengraph-image.tsx in this segment.
    openGraph: {
      type: "website",
      siteName: "PlatePilot",
      locale: ogLocale(locale),
      alternateLocale: ogAlternateLocales(locale),
      url: `${base}/${locale}`,
      title: t("title"),
      description: t("description"),
    },
    twitter: {
      card: "summary_large_image",
      title: t("title"),
      description: t("description"),
    },
    icons: {
      icon: [
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    },
    // Set GOOGLE_SITE_VERIFICATION to the value Search Console gives you
    // (the meta-tag method) to claim the site and submit the sitemap.
    verification: process.env.GOOGLE_SITE_VERIFICATION
      ? { google: process.env.GOOGLE_SITE_VERIFICATION }
      : undefined,
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const direction = locale === "ar" ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={direction} className={`${chivoMono.variable} ${notoSansArabic.variable}`}>
      <body>
        <NextIntlClientProvider>
          <SiteChrome>{children}</SiteChrome>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}