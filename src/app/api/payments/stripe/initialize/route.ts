import { NextResponse } from "next/server";
import { z } from "zod";
import { getDbClient } from "@/server/db/client";
import { createStripeCheckoutSession, stripeClient } from "@/server/payments/stripe";
import { resolveProviderSecret } from "@/server/payments/secrets";
import { checkRateLimit } from "@/server/security/rate-limit";
import { apiError } from "@/server/security/http";

const input = z.object({ orderId: z.string().uuid(), trackingToken: z.string().min(32).max(128), locale: z.enum(["en", "fr", "es", "pt", "ar"]).default("en") });

/**
 * Starts a Stripe Checkout session for an order. Mirrors the Paystack
 * initializer: the attempt is persisted first, the provider is only then
 * contacted, and an unreachable provider leaves the attempt marked for
 * reconciliation instead of silently retrying.
 */
export async function POST(request: Request) {
  try {
    checkRateLimit(`stripe:${request.headers.get("x-forwarded-for") || "local"}`, 10);
    const body = input.parse(await request.json());
    const admin = await getDbClient();
    const { data: order, error: orderError } = await admin.from("orders").select("id,organization_id,location_id,total_minor,currency,payment_status,tracking_token").eq("id", body.orderId).eq("tracking_token", body.trackingToken).single();
    if (orderError || !order || order.payment_status === "paid") throw new Error("ORDER_NOT_PAYABLE");
    const { data: connection, error: connectionError } = await admin.from("payment_connections").select("id,environment,secret_ref").eq("organization_id", order.organization_id).eq("location_id", order.location_id).eq("provider", "stripe").eq("currency", order.currency).eq("verified", true).eq("enabled", true).single();
    if (connectionError || !connection) throw new Error("PAYMENT_METHOD_UNAVAILABLE");
    const reference = `pp_${crypto.randomUUID().replaceAll("-", "")}`;
    const { data: attempt, error: attemptError } = await admin.from("payment_attempts").insert({
      organization_id: order.organization_id, location_id: order.location_id, order_id: order.id,
      payment_connection_id: connection.id, provider: "stripe", provider_reference: reference,
      amount_minor: order.total_minor, currency: order.currency, environment: connection.environment, status: "initializing",
    }).select("id").single();
    if (attemptError || !attempt) throw new Error("PAYMENT_ATTEMPT_NOT_PERSISTED");

    try {
      const appUrl = new URL(process.env.APP_URL || "http://localhost:3000");
      if (appUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(appUrl.hostname)) throw new Error("INVALID_APP_URL");
      const stripe = stripeClient(resolveProviderSecret(connection.secret_ref));
      const checkout = await createStripeCheckoutSession(stripe, {
        reference, orderId: order.id, trackingToken: order.tracking_token, locale: body.locale,
        amountMinor: BigInt(order.total_minor), currency: order.currency,
        orderLabel: `PlatePilot order ${order.tracking_token.slice(0, 12)}`,
        appOrigin: appUrl.origin, mode: connection.environment,
      });
      // The provider_reference is the checkout session id: that is what the
      // webhook names, so the attempt must be findable by it.
      await admin.from("payment_attempts").update({ status: "awaiting_customer", provider_reference: checkout.sessionId, checkout_url: checkout.url, updated_at: new Date().toISOString() }).eq("id", attempt.id);
      return NextResponse.json({ attemptId: attempt.id, reference, checkoutUrl: checkout.url }, { headers: { "Cache-Control": "private, no-store" } });
    } catch {
      await admin.from("payment_attempts").update({ status: "reconciliation_required", updated_at: new Date().toISOString() }).eq("id", attempt.id);
      return NextResponse.json({ attemptId: attempt.id, reference, status: "reconciliation_required" }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
    }
  } catch (error) { return apiError(error); }
}
