import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, CalendarCheck, ChefHat, ScanLine } from "lucide-react";

import { StartAuth } from "@/components/auth/StartAuth";
import { StartMedia } from "@/components/auth/StartMedia";
import { isSupabaseConfigured } from "@/server/auth/config";
import { isLocalModeEnabled } from "@/server/auth/local-session";

/**
 * The vendor door.
 *
 * The marketing website (WordPress) explains the product to customers; this page
 * exists for one person: the restaurant owner deciding whether to open a shop.
 * Register and sign in happen here, and the promise of "what happens next" is
 * the three steps below, in the order they actually happen.
 *
 * Video: drop a clip at public/media/welcome.mp4 (poster at welcome-poster.jpg)
 * or point NEXT_PUBLIC_WELCOME_VIDEO at a URL. Without one the hero runs a slow
 * gradient instead, so the page never looks broken or half-built.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Start");
  return { title: t("metaTitle"), description: t("metaDescription"), robots: { index: true, follow: true } };
}

const steps = [
  {
    icon: ChefHat,
    title: "Your menu, in your words",
    body: "Type it or import it. Prices in your currency, your language, with your photos.",
  },
  {
    icon: ScanLine,
    title: "A page and a table code",
    body: "We publish your page. Print one sheet of table codes and the room can order.",
  },
  {
    icon: CalendarCheck,
    title: "Orders, paid and priced by the server",
    body: "Every total is calculated on our side, so a tampered basket is refused.",
  },
];

export default async function StartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Start");

  return (
    <>
      <section className="start-hero">
        <div className="start-hero-glow" aria-hidden="true" />
        <div className="shell start-hero-inner">
          <div className="start-hero-copy">
            <p className="eyebrow"><span />{t("eyebrow")}</p>
            <h1>{t("title")}</h1>
            <p className="start-lede">{t("lede")}</p>
            <ul className="start-points">
              <li>Your own page, your name on it</li>
              <li>200 orders a month free, no commission</li>
              <li>Card payments straight to your account</li>
            </ul>
            <div className="start-hero-actions">
              <a className="button" href="#join">Open your restaurant <ArrowRight size={17} aria-hidden="true" /></a>
              <Link className="button button--ghost" href={`/${locale}/login`}>Sign in</Link>
            </div>
          </div>

          <StartMedia caption="La Divine Eden, Parow — the plate that starts the queue." />
        </div>
      </section>

      <section className="start-body">
        <div className="shell start-body-inner">
          <div className="start-steps">
            <h2>{t("howTitle")}</h2>
            <ol>
              {steps.map((step, index) => (
                <li key={step.title}>
                  <span className="start-step-number">{index + 1}</span>
                  <step.icon size={20} aria-hidden="true" />
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="start-signin-line">
              Already a vendor? <Link href={`/${locale}/login`}>Sign in</Link> and you land on your dashboard.
            </p>
          </div>

          <StartAuth configured={isSupabaseConfigured()} localMode={isLocalModeEnabled()} />
        </div>
      </section>
    </>
  );
}
