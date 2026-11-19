import { NextResponse } from "next/server";
import { z } from "zod";
import { getDbClient } from "@/server/db/client";
import { verifyPaystackSignature, verifyPaystackTransaction } from "@/server/payments/paystack";
import { resolveProviderSecret } from "@/server/payments/secrets";
import { apiError } from "@/server/security/http";

const eventSchema = z.object({ event: z.string(), data: z.object({ id: z.number().or(z.string()), reference: z.string() }).passthrough() }).passthrough();

export async function POST(request: Request) {
  try {
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 1_000_000) return NextResponse.json({ error: "BODY_TOO_LARGE" }, { status: 413 });
    const raw = new Uint8Array(await request.arrayBuffer());
    if (raw.byteLength > 1_000_000) return NextResponse.json({ error: "BODY_TOO_LARGE" }, { status: 413 });
    const event = eventSchema.parse(JSON.parse(new TextDecoder().decode(raw)));
    const admin = await getDbClient();
    const { data: attempt, error } = await admin.from("payment_attempts").select("id,order_id,payment_connection_id,amount_minor,currency,environment,provider_reference").eq("provider", "paystack").eq("provider_reference", event.data.reference).single();
    if (error || !attempt) return NextResponse.json({ error: "UNKNOWN_REFERENCE" }, { status: 404 });
    const { data: connection } = await admin.from("payment_connections").select("secret_ref").eq("id", attempt.payment_connection_id).single();
    if (!connection) return NextResponse.json({ error: "UNKNOWN_CONNECTION" }, { status: 404 });
    const secret = resolveProviderSecret(connection.secret_ref);
    if (!verifyPaystackSignature(raw, request.headers.get("x-paystack-signature"), secret)) return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
    const providerEventId = String(event.data.id);
    const { error: receiptError } = await admin.from("payment_events").insert({ payment_attempt_id: attempt.id, provider: "paystack", provider_event_id: providerEventId, event_type: event.event, payload: event, status: "received" });
    if (receiptError) {
      if (receiptError.code === "23505") return NextResponse.json({ status: "duplicate_acknowledged" });
      throw new Error("EVENT_NOT_DURABLE");
    }
    const verification = await verifyPaystackTransaction(secret, { reference: attempt.provider_reference, currency: attempt.currency, providerAmountMinor: BigInt(attempt.amount_minor), mode: attempt.environment });
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
    await admin.from("payment_events").update({ status: "processed", processed_at: new Date().toISOString() }).eq("provider", "paystack").eq("provider_event_id", providerEventId);
    return NextResponse.json({ status: "processed" });
  } catch (error) { return apiError(error); }
}
