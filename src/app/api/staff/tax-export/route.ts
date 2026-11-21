import { requireUser } from "@/server/auth/server";
import { apiError } from "@/server/security/http";
import { checkRateLimit } from "@/server/security/rate-limit";
import { z } from "zod";

const uuid = z.string().uuid();
const iso = z.string().datetime();

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * The tax export as a CSV download: one row per invoice issued in the window,
 * money in minor units. The browser saves it; the accountant opens it.
 */
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`staff-tax-export:${user.id}`, 20, 60_000);
    const query = new URL(request.url).searchParams;
    const parsed = z.object({ locationId: uuid, from: iso, to: iso }).safeParse({
      locationId: query.get("locationId") ?? "",
      from: query.get("from") ?? "",
      to: query.get("to") ?? "",
    });
    if (!parsed.success) {
      return new Response("INVALID_REQUEST", { status: 400 });
    }
    const { data, error } = await supabase.rpc("app_tax_export", {
      p_actor: user.id,
      p_location_id: parsed.data.locationId,
      p_from: parsed.data.from,
      p_to: parsed.data.to,
    });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{
      invoiceNumber: string; issuedAt: string; orderId: string;
      currency: string; netMinor: string; taxMinor: string; totalMinor: string;
    }>;

    const header = "invoice_number,issued_at,order_id,currency,net_minor,tax_minor,total_minor";
    const body = rows.map((row) => [
      row.invoiceNumber, row.issuedAt, row.orderId, row.currency,
      row.netMinor, row.taxMinor, row.totalMinor,
    ].map(csvCell).join(","));
    const csv = [header, ...body].join("\n");

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="tax-export-${parsed.data.from.slice(0, 10)}-${parsed.data.to.slice(0, 10)}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) { return apiError(error); }
}
