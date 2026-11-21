import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { staffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";
import { checkRateLimit } from "@/server/security/rate-limit";
import { buildEscPosReceipt, type ReceiptOrder } from "@/server/pos/receipt";

/**
 * A thermal-printer receipt for one order, as raw ESC/POS bytes. Any POS setup
 * that can open a stream to a printer (network, USB tunnel, print agent) can
 * send these bytes verbatim; nothing here depends on a driver.
 */
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`receipt:${user.id}`, 60, 60_000);
    const orderId = new URL(request.url).searchParams.get("orderId") ?? "";
    if (!z.string().uuid().safeParse(orderId).success) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id,organization_id,location_id,currency,subtotal_minor,discount_minor,tax_minor,tip_minor,total_minor,payment_status,created_at,delivery_fee_minor")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) throw staffError(orderError);
    const row = order as Record<string, unknown> | null;
    if (!row) return NextResponse.json({ error: "ORDER_NOT_FOUND" }, { status: 404 });

    const { data: allowed, error: memberError } = await supabase.rpc("is_organization_member", {
      p_organization_id: row.organization_id,
    });
    if (memberError || allowed !== true) {
      return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const [orgResult, locationResult, itemsResult] = await Promise.all([
      supabase.from("organizations").select("name").eq("id", row.organization_id).maybeSingle(),
      supabase.from("locations").select("name").eq("id", row.location_id).maybeSingle(),
      supabase.from("order_items").select("name_snapshot,quantity,line_total_minor").eq("order_id", orderId),
    ]);
    if (itemsResult.error) throw staffError(itemsResult.error);

    const receipt = buildEscPosReceipt({
      orderNumber: orderId,
      restaurantName: String((orgResult.data as { name?: string } | null)?.name ?? "PlatePilot"),
      locationName: String((locationResult.data as { name?: string } | null)?.name ?? ""),
      createdAt: String(row.created_at),
      currency: String(row.currency),
      lines: (itemsResult.data as Array<{ name_snapshot: string; quantity: number; line_total_minor: number }> | null)?.map((item) => ({
        name: item.name_snapshot, quantity: item.quantity, lineTotalMinor: Number(item.line_total_minor),
      })) ?? [],
      subtotalMinor: Number(row.subtotal_minor),
      discountMinor: Number(row.discount_minor ?? 0),
      taxMinor: Number(row.tax_minor ?? 0),
      // orders does not store the service fee separately; it is inside total.
      serviceFeeMinor: 0,
      deliveryFeeMinor: Number(row.delivery_fee_minor ?? 0),
      tipMinor: Number(row.tip_minor ?? 0),
      totalMinor: Number(row.total_minor),
      paymentStatus: String(row.payment_status),
    });

    return new Response(receipt as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="receipt-${orderId.slice(0, 8)}.bin"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) { return apiError(error); }
}
