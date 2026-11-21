import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { staffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";
import { checkRateLimit } from "@/server/security/rate-limit";

const money = z.string().regex(/^[0-9]+$/, "expected integer minor units");

const schedule = z.object({
  days: z.array(z.string().regex(/^[0-6]$/)).min(1).max(7),
  start: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),
  end: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),
}).refine((value) => value.start < value.end, { message: "SCHEDULE_WINDOW_INVALID" });

const publishInput = z.object({
  organizationId: z.string().uuid(),
  locationId: z.string().uuid(),
  label: z.string().trim().min(1).max(60),
  schedule: schedule.nullable().default(null),
  items: z.array(z.object({
    category: z.string().trim().min(1).max(80),
    item: z.string().trim().min(1).max(120),
    description: z.string().trim().max(400).default(""),
    allergens: z.array(z.string().trim().max(40)).max(14).default([]),
    amountMinor: money,
    currency: z.string().regex(/^[A-Z]{3}$/),
    available: z.boolean().default(true),
  })).min(1).max(500),
});

const archiveInput = z.object({ priceBookId: z.string().uuid() });

/** The location's menus, including which serve at which hours. */
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const locationId = new URL(request.url).searchParams.get("locationId") ?? "";
    if (!z.string().uuid().safeParse(locationId).success) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("app_list_price_books", { p_actor: user.id, p_location_id: locationId });
    if (error) throw staffError(error);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

/** Publishes an additional, scheduled menu (breakfast, lunch, dinner…). */
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`staff-menus:${user.id}`, 30, 60_000);
    const body = publishInput.parse(await request.json());
    const { data, error } = await supabase.rpc("app_publish_service_menu", {
      p_organization_id: body.organizationId, p_location_id: body.locationId,
      p_label: body.label, p_schedule: body.schedule, p_items: body.items, p_actor: user.id,
    });
    if (error) throw staffError(error);
    return NextResponse.json({ priceBookId: data }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

/** Archives one menu. */
export async function DELETE(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`staff-menus:${user.id}`, 30, 60_000);
    const body = archiveInput.parse(await request.json());
    const { error } = await supabase.rpc("app_archive_price_book", { p_actor: user.id, p_price_book_id: body.priceBookId });
    if (error) throw staffError(error);
    return NextResponse.json({ status: "archived" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
