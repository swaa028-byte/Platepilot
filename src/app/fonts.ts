import localFont from "next/font/local";

/**
 * Wayfind sets the whole product in Chivo Mono, so the type is loaded once,
 * here, and referenced only through --font-display / --font-arabic. Arabic
 * needs a face with actual Arabic glyphs; Chivo Mono has none, so the RTL
 * document switches to Noto Sans Arabic and keeps the same weights.
 */
export const chivoMono = localFont({
  src: "./fonts/chivo-mono-latin.woff2",
  weight: "400 800",
  style: "normal",
  variable: "--font-chivo",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
  preload: true,
});

export const notoSansArabic = localFont({
  src: "./fonts/noto-sans-arabic.woff2",
  weight: "400 700",
  style: "normal",
  variable: "--font-noto-arabic",
  display: "swap",
  fallback: ["Segoe UI", "Arial", "sans-serif"],
  preload: false,
});
