import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export function verifyPaystackSignature(rawBody: Uint8Array, signature: string | null, secret: string): boolean {
  if (!secret || !signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const expected = createHmac("sha512", secret).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

const verification = z.object({
  status: z.literal(true),
  data: z.object({
    status: z.string(), reference: z.string(),
    amount: z.number().refine((value) => Number.isSafeInteger(value) && value >= 0),
    currency: z.string(), domain: z.string().optional(),
  }),
});

type Expected = { reference: string; currency: string; providerAmountMinor: bigint; mode: "test" | "live" };

export async function initializePaystack(secret: string, input: { reference: string; email: string; amountMinor: bigint; currency: string; callbackUrl: string; mode: "test" | "live" }) {
  if (!secret.startsWith(`sk_${input.mode}_`)) throw new Error("PAYSTACK_CREDENTIAL_MODE_MISMATCH");
  if (!Number.isSafeInteger(Number(input.amountMinor)) || input.amountMinor <= 0n) throw new Error("PAYSTACK_AMOUNT_OUT_OF_RANGE");
  const response = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ reference: input.reference, email: input.email, amount: input.amountMinor.toString(), currency: input.currency, callback_url: input.callbackUrl }),
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`PAYSTACK_INITIALIZE_HTTP_${response.status}`);
  const body = z.object({ status: z.literal(true), data: z.object({ authorization_url: z.string().url(), reference: z.string() }) }).parse(await response.json());
  if (body.data.reference !== input.reference || new URL(body.data.authorization_url).protocol !== "https:") throw new Error("PAYSTACK_INITIALIZE_MISMATCH");
  return body.data;
}

export async function verifyPaystackTransaction(secret: string, expected: Expected) {
  if (!secret.startsWith(`sk_${expected.mode}_`)) throw new Error("PAYSTACK_CREDENTIAL_MODE_MISMATCH");
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(expected.reference)}`, {
    headers: { Authorization: `Bearer ${secret}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`PAYSTACK_VERIFY_HTTP_${response.status}`);
  const { data } = verification.parse(await response.json());
  if (data.reference !== expected.reference || data.currency !== expected.currency || BigInt(data.amount) !== expected.providerAmountMinor || (data.domain !== undefined && data.domain !== expected.mode)) return { kind: "mismatch" } as const;
  if (data.status !== "success") return { kind: "not_paid", providerStatus: data.status } as const;
  return { kind: "verified", providerReference: data.reference } as const;
}
