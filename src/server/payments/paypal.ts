import "server-only";
import { z } from "zod";

const captureSchema = z.object({
  id: z.string(), status: z.string(), custom_id: z.string().optional(),
  amount: z.object({ value: z.string(), currency_code: z.string() }),
});

export async function verifyPayPalCapture(accessToken: string, captureId: string, expected: { orderId: string; amountMajor: string; currency: string }, sandbox = true) {
  const base = sandbox ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
  const response = await fetch(`${base}/v2/payments/captures/${encodeURIComponent(captureId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`PAYPAL_CAPTURE_HTTP_${response.status}`);
  const capture = captureSchema.parse(await response.json());
  if (capture.custom_id !== expected.orderId || capture.amount.value !== expected.amountMajor || capture.amount.currency_code !== expected.currency) return { kind: "mismatch" } as const;
  if (capture.status !== "COMPLETED") return { kind: "not_paid", providerStatus: capture.status } as const;
  return { kind: "verified", providerReference: capture.id } as const;
}
