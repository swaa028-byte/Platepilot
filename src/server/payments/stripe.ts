import "server-only";
import Stripe from "stripe";

export function stripeClient(secret: string) {
  if (!secret.startsWith("sk_test_") && !secret.startsWith("sk_live_")) throw new Error("STRIPE_CREDENTIAL_INVALID");
  return new Stripe(secret);
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
