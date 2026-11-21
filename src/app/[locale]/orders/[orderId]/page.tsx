import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { setRequestLocale } from "next-intl/server";
import { getDbClient } from "@/server/db/client";
import { currencySymbol, exponent } from "@/domain/seo";

export const dynamic = "force-dynamic";

type Status = {
  orderId: string; paymentStatus: string; fulfillmentStatus: string;
  totalMinor: string; currency: string; createdAt: string;
};

async function loadStatus(orderId: string, token: string): Promise<Status | null> {
  const admin = await getDbClient();
  const { data, error } = await admin.rpc("app_public_order_status", { p_order_id: orderId, p_tracking_token: token });
  if (error || !data) return null;
  return data as Status;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; orderId: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: locale === "en" ? "Your order" : "Votre commande" };
}

const paymentDone = new Set(["paid", "partially_refunded", "refunded"]);
const fulfillmentDone = new Set(["ready", "served", "completed"]);

/**
 * The customer's order status page. The tracking token in the URL is the
 * capability: payment providers return the customer here, and the page shows
 * only this one order's state — never menu data, never other orders.
 */
export default async function OrderStatusPage({ params, searchParams }: {
  params: Promise<{ locale: string; orderId: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { locale, orderId } = await params;
  const { t } = await searchParams;
  setRequestLocale(locale);
  const tr = await getTranslations("OrderStatus");
  const status = t ? await loadStatus(orderId, t) : null;

  if (!status) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-xl font-semibold">{tr("notFound")}</h1>
        <p className="text-sm opacity-70">{tr("notFoundBody")}</p>
        <Link href={`/${locale}`} className="text-sm underline">{tr("backHome")}</Link>
      </main>
    );
  }

  const paid = paymentDone.has(status.paymentStatus);
  const done = fulfillmentDone.has(status.fulfillmentStatus);
  const total = `${currencySymbol(status.currency)}${(BigInt(status.totalMinor) / 10n ** BigInt(exponent(status.currency))).toString()}`;

  const steps = [
    { key: "received", reached: true },
    { key: "preparing", reached: ["preparing", "ready", "served", "completed"].includes(status.fulfillmentStatus) },
    { key: "ready", reached: ["ready", "served", "completed"].includes(status.fulfillmentStatus) },
    { key: "completed", reached: status.fulfillmentStatus === "completed" },
  ] as const;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
      <h1 className="text-xl font-semibold">{tr("title")}</h1>
      <section className="rounded-xl border border-black/10 p-4 dark:border-white/15" aria-live="polite">
        <p className="text-sm opacity-70">{tr("payment")}</p>
        <p className={`text-lg font-semibold ${paid ? "text-green-700 dark:text-green-400" : ""}`}>
          {paid ? tr("paymentPaid") : tr("paymentPending")}
        </p>
        <p className="mt-3 text-sm opacity-70">{tr("kitchen")}</p>
        <ol className="mt-1 flex gap-2 text-sm">
          {steps.map((step, index) => (
            <li key={step.key} className={step.reached ? "font-semibold" : "opacity-50"}>
              {index > 0 ? " · " : ""}{tr(step.key)}
            </li>
          ))}
        </ol>
        {done ? <p className="mt-3 text-sm font-medium">{tr("thankYou")}</p> : null}
      </section>
      <section className="rounded-xl border border-black/10 p-4 dark:border-white/15">
        <p className="text-sm opacity-70">{tr("total")}</p>
        <p className="text-lg font-semibold">{total}</p>
        <p className="mt-1 text-xs opacity-60">{tr("reference")}: <span className="font-mono">{status.orderId.slice(0, 8)}</span></p>
      </section>
      <Link href={`/${locale}`} className="text-sm underline">{tr("backHome")}</Link>
    </main>
  );
}
