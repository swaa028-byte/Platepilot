import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { staffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";
import { checkRateLimit } from "@/server/security/rate-limit";

const stamp = z.string().datetime({ offset: true }).nullable().default(null);

const campaignInput = z.object({
  locationId: z.string().uuid(),
  campaignId: z.string().uuid().nullable().default(null),
  kind: z.enum(["popup", "banner"]),
  headline: z.string().trim().min(1).max(120),
  body: z.string().trim().max(400).default(""),
  ctaLabel: z.string().trim().min(1).max(40).nullable().default(null),
  ctaHref: z.string().trim().max(200).regex(/^\/[^"]*$/).nullable().default(null),
  discountCode: z.string().trim().min(1).max(40).nullable().default(null),
  startsAt: stamp,
  endsAt: stamp,
  active: z.boolean().default(true),
});

/**
 * Storefront campaigns: scheduled popups and banners that advertise what the
 * merchant is running. Discount limits themselves stay enforced at order time
 * by the promotions rules, not by the ad.
 */
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const locationId = new URL(request.url).searchParams.get("locationId") ?? "";
    if (!z.string().uuid().safeParse(locationId).success) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("app_list_campaigns", {
      p_actor: user.id, p_location_id: locationId,
    });
    if (error) throw staffError(error);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

export async function PUT(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`staff-campaigns:${user.id}`, 60, 60_000);
    const body = campaignInput.parse(await request.json());
    const { data, error } = await supabase.rpc("app_upsert_campaign", {
      p_actor: user.id, p_location_id: body.locationId, p_campaign_id: body.campaignId,
      p_kind: body.kind, p_headline: body.headline, p_body: body.body,
      p_cta_label: body.ctaLabel, p_cta_href: body.ctaHref, p_discount_code: body.discountCode,
      p_starts_at: body.startsAt, p_ends_at: body.endsAt, p_active: body.active,
    });
    if (error) throw staffError(error);
    return NextResponse.json({ campaignId: data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`staff-campaigns:${user.id}`, 60, 60_000);
    const campaignId = new URL(request.url).searchParams.get("campaignId") ?? "";
    if (!z.string().uuid().safeParse(campaignId).success) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }
    const { error } = await supabase.rpc("app_delete_campaign", {
      p_actor: user.id, p_campaign_id: campaignId,
    });
    if (error) throw staffError(error);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
