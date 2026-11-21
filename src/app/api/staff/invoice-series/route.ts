import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { staffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";
import { checkRateLimit } from "@/server/security/rate-limit";

const create = z.object({
  locationId: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  prefix: z.string().trim().max(10).default(""),
});

/** The numbered invoice series of one location. */
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`staff-invoices:${user.id}`, 60, 60_000);
    const locationId = new URL(request.url).searchParams.get("locationId") ?? "";
    if (!z.string().uuid().safeParse(locationId).success) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("app_list_invoice_series", {
      p_actor: user.id, p_location_id: locationId,
    });
    if (error) throw staffError(error);
    return NextResponse.json(data ?? [], { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`staff-invoices:${user.id}`, 30, 60_000);
    const body = create.parse(await request.json());
    const { data, error } = await supabase.rpc("app_create_invoice_series", {
      p_actor: user.id, p_location_id: body.locationId,
      p_name: body.name, p_prefix: body.prefix,
    });
    if (error) throw staffError(error);
    return NextResponse.json(data, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
