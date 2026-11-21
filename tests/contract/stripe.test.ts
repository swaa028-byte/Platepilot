import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createStripeCheckoutSession, stripeClient, verifyStripeWebhook } from "@/server/payments/stripe";

/** Builds a signature exactly the way Stripe signs test deliveries. */
function stripeSignature(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)) {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

const eventPayload = JSON.stringify({
  id: "evt_test_1", type: "checkout.session.completed",
  data: { object: { id: "cs_test_1", object: "checkout.session" } },
});

describe("Stripe webhook contract", () => {
  const secret = "whsec_test_contract_fixture";
  it("accepts only a current, correctly signed payload", () => {
    const event = verifyStripeWebhook(eventPayload, stripeSignature(eventPayload, secret), secret);
    expect(event?.id).toBe("evt_test_1");
    expect(event?.type).toBe("checkout.session.completed");
  });
  it("fails closed for tampered, absent, stale-signed or wrong-secret deliveries", () => {
    expect(verifyStripeWebhook(eventPayload, stripeSignature(eventPayload, secret), "whsec_other")).toBeNull();
    expect(verifyStripeWebhook(eventPayload, null, secret)).toBeNull();
    expect(verifyStripeWebhook(eventPayload, "t=1,v1=deadbeef", secret)).toBeNull();
    const tampered = eventPayload.replace("cs_test_1", "cs_test_2");
    expect(verifyStripeWebhook(tampered, stripeSignature(eventPayload, secret), secret)).toBeNull();
  });
  it("refuses credentials that are not Stripe key shapes", () => {
    expect(() => stripeClient("pk_test_nope")).toThrow();
    expect(() => stripeClient("")).toThrow();
  });
  it("rejects checkout sessions under Stripe's minimum amount", async () => {
    const stripe = stripeClient("sk_test_contract_fixture");
    await expect(createStripeCheckoutSession(stripe, {
      reference: "pp_x", orderId: "00000000-0000-0000-0000-000000000000", trackingToken: "t".repeat(40),
      locale: "en", amountMinor: 10n, currency: "USD", orderLabel: "Order", appOrigin: "https://pp.test", mode: "test",
    })).rejects.toThrow("STRIPE_AMOUNT_OUT_OF_RANGE");
  });
});
