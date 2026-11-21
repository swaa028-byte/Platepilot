import "server-only";
import Stripe from "stripe";

export function stripeClient(secret: string) {
  if (!secret.startsWith("sk_test_") && !secret.startsWith("sk_live_")) throw new Error("STRIPE_CREDENTIAL_INVALID");
  return new Stripe(secret);
}

export async function createStripeCheckoutSession(stripe: Stripe, input: {
  reference: string; orderId: string; trackingToken: string; locale: string;
  amountMinor: bigint; currency: string; orderLabel: string; appOrigin: string; mode: "test" | "live";
}) {
  if (!Number.isSafeInteger(Number(input.amountMinor)) || input.amountMinor < 50n) throw new Error("STRIPE_AMOUNT_OUT_OF_RANGE");
  const orderUrl = `${input.appOrigin.replace(/\/$/, "")}/${input.locale}/orders/${input.orderId}`;
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{
      quantity: 1,
      price_data: {
        currency: input.currency.toLowerCase(),
        unit_amount: Number(input.amountMinor),
        product_data: { name: input.orderLabel.slice(0, 120) },
      },
    }],
    metadata: { orderId: input.orderId, reference: input.reference },
    success_url: `${orderUrl}?t=${input.trackingToken}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${orderUrl}?t=${input.trackingToken}`,
  }, { idempotencyKey: input.reference });
  if (!session.id || !session.url || !session.url.startsWith("https://")) throw new Error("STRIPE_CHECKOUT_MISMATCH");
  return { sessionId: session.id, url: session.url };
}

/** Verifies a Stripe webhook payload against the endpoint's signing secret. */
export function verifyStripeWebhook(payload: string, signature: string | null, secret: string): Stripe.Event | null {
  if (!signature || !secret.startsWith("whsec_")) return null;
  try {
    return Stripe.webhooks.constructEvent(payload, signature, secret);
  } catch {
    return null;
  }
}

export async function verifyStripeCheckout(stripe: Stripe, sessionId: string, expected: { amountMinor: bigint; currency: string; orderId: string }) {
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["payment_intent"] });
  if (session.metadata?.orderId !== expected.orderId || session.amount_total === null || BigInt(session.amount_total) !== expected.amountMinor || session.currency?.toUpperCase() !== expected.currency.toUpperCase()) {
    return { kind: "mismatch" } as const;
  }
  const intent = session.payment_intent;
  const cleared = session.payment_status === "paid" && typeof intent !== "string" && intent?.status === "succeeded";
  if (!cleared) return { kind: "not_paid", providerStatus: session.payment_status } as const;
  return { kind: "verified", providerReference: session.id } as const;
}
