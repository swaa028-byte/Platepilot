import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyPaystackSignature } from "@/server/payments/paystack";

describe("Paystack webhook contract", () => {
  const raw = new TextEncoder().encode('{"event":"charge.success","data":{"reference":"ref"}}');
  const secret = "sk_test_contract_fixture";
  it("accepts only the raw-body SHA-512 signature", () => {
    const signature = createHmac("sha512", secret).update(raw).digest("hex");
    expect(verifyPaystackSignature(raw, signature, secret)).toBe(true);
    const altered = new TextEncoder().encode('{"event":"charge.success","data":{"reference":"other"}}');
    expect(verifyPaystackSignature(altered, signature, secret)).toBe(false);
  });
  it("fails closed for absent or malformed signatures and wrong credentials", () => {
    expect(verifyPaystackSignature(raw, null, secret)).toBe(false);
    expect(verifyPaystackSignature(raw, "abc", secret)).toBe(false);
    expect(verifyPaystackSignature(raw, createHmac("sha512", "wrong").update(raw).digest("hex"), secret)).toBe(false);
  });
});
