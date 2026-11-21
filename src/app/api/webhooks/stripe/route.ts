import { NextResponse } from "next/server";
import { getDbClient } from "@/server/db/client";
import { verifyStripeWebhook, verifyStripeCheckout, stripeClient } from "@/server/payments/stripe";
import { resolveProviderSecret } from "@/server/payments/secrets";
import { apiError } from "@/server/security/http";

const SESSION_EVENTS = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded"]);

/**
 * Stripe webhook. Fails closed: the signature is checked against the
 * connection's own webhook signing secret, the event is made durable before
 * anything is applied, and the payment is re-verified against the Stripe API
 * before the order is marked paid — the same shape as the Paystack receiver.
 */
export async function POST(request: Request) {
  try {
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 1_000_000) return NextResponse.json({ error: "BODY_TOO_LARGE" }, { status: 413 });
    const raw = await request.text();
    if (raw.length > 1_000_000) return NextResponse.json({ error: "BODY_TOO_LARGE" }, { status: 413 });
    const signature = request.headers.get("stripe-signature");

    const parsed = JSON.parse(raw) as { type?: string; data?: { object?: { id?: string } } };
    const sessionId = parsed?.data?.object?.id;
    if (!sessionId) return NextResponse.json({ error: "UNKNOWN_REFERENCE" }, { status: 404 });
    const admin = await getDbClient();
    const { data: attempt, error } = await admin.from("payment_attempts").select("id,order_id,payment_connection_id,amount_minor,currency,environment,provider_reference").eq("provider", "stripe").eq("provider_reference", sessionId).single();
    if (error || !attempt) return NextResponse.json({ error: "UNKNOWN_REFERENCE" }, { status: 404 });
    const { data: connection } = await admin.from("payment_connections").select("secret_ref,webhook_secret_ref").eq("id", attempt.payment_connection_id).single();
    if (!connection?.webhook_secret_ref) return NextResponse.json({ error: "UNKNOWN_CONNECTION" }, { status: 404 });

    const event = verifyStripeWebhook(raw, signature, resolveProviderSecret(connection.webhook_secret_ref));
    if (!event) return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
    if (!SESSION_EVENTS.has(event.type)) return NextResponse.json({ status: "ignored" });

    const providerEventId = event.id;
    const { error: receiptError } = await admin.from("payment_events").insert({ payment_attempt_id: attempt.id, provider: "stripe", provider_event_id: providerEventId, event_type: event.type, payload: parsed, status: "received" });
    if (receiptError) {
      if (receiptError.code === "23505") return NextResponse.json({ status: "duplicate_acknowledged" });
      throw new Error("EVENT_NOT_DURABLE");
    }

    // Re-verify against the provider API; a webhook alone never moves money.
    const stripe = stripeClient(resolveProviderSecret(connection.secret_ref));
    const verification = await verifyStripeCheckout(stripe, attempt.provider_reference, {
      amountMinor: BigInt(attempt.amount_minor), currency: attempt.currency, orderId: attempt.order_id,
    });
    if (verification.kind === "mismatch") {
      await admin.from("payment_attempts").update({ status: "review_required" }).eq("id", attempt.id);
      return NextResponse.json({ error: "PAYMENT_MISMATCH" }, { status: 409 });
    }
    if (verification.kind === "not_paid") {
      await admin.from("payment_attempts").update({ status: "not_paid" }).eq("id", attempt.id);
      return NextResponse.json({ status: "not_paid" });
    }
    const { error: applyError } = await admin.rpc("app_apply_verified_payment", { p_payment_attempt_id: attempt.id, p_provider_event_id: providerEventId, p_provider_reference: verification.providerReference });
    if (applyError) throw new Error("PAYMENT_APPLY_REJECTED");
    await admin.from("payment_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("provider", "stripe").eq("provider_event_id", providerEventId);
    return NextResponse.json({ status: "processed" });
  } catch (error) { return apiError(error); }
}
