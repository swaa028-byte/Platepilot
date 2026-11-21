import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { staffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";
import { checkRateLimit } from "@/server/security/rate-limit";

const consent = z.object({
  action: z.literal("consent"),
  organizationId: z.string().uuid(),
  name: z.string().min(1).max(120),
  phone: z.string().regex(/^\+[0-9]{5,20}$/).optional(),
  optIn: z.boolean(),
});

const save = z.object({
  action: z.literal("save"),
  locationId: z.string().uuid(),
  campaignId: z.string().uuid().optional(),
  name: z.string().min(1).max(60),
  body: z.string().min(1).max(320),
});

const send = z.object({
  action: z.literal("send"),
  campaignId: z.string().uuid(),
});

/**
 * SMS marketing: the consented audience and the campaigns.
 *
 * GET reads the audience and the campaign list for a location. POST records a
 * customer's consent (with their phone), saves a draft or sends one — the
 * database enforces the manager role and the one-send-per-campaign rule, so a
 * forged request still fails there.
 */
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`staff-sms:${user.id}`, 60, 60_000);
    const locationId = new URL(request.url).searchParams.get("locationId") ?? "";
    if (!z.string().uuid().safeParse(locationId).success) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }
    const [audience, campaigns] = await Promise.all([
      supabase.rpc("app_list_sms_audience", { p_actor: user.id, p_location_id: locationId }),
      supabase.rpc("app_list_sms_campaigns", { p_actor: user.id, p_location_id: locationId }),
    ]);
    if (audience.error) throw staffError(audience.error);
    if (campaigns.error) throw staffError(campaigns.error);
    return NextResponse.json(
      { audience: audience.data ?? [], campaigns: campaigns.data ?? [] },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`staff-sms:${user.id}`, 30, 60_000);
    const body = await request.json();
    const parsed = z.discriminatedUnion("action", [consent, save, send]).safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    const data = parsed.data;

    if (data.action === "consent") {
      const { error } = await supabase.rpc("app_record_sms_consent", {
        p_actor: user.id,
        p_organization_id: data.organizationId,
        p_name: data.name,
        p_phone: data.phone ?? null,
        p_opt_in: data.optIn,
      });
      if (error) throw staffError(error);
      return NextResponse.json({ status: "recorded" }, { headers: { "Cache-Control": "private, no-store" } });
    }

    if (data.action === "save") {
      const { data: campaign, error } = await supabase.rpc("app_upsert_sms_campaign", {
        p_actor: user.id,
        p_location_id: data.locationId,
        p_campaign_id: data.campaignId ?? null,
        p_name: data.name,
        p_body: data.body,
      });
      if (error) throw staffError(error);
      return NextResponse.json(campaign, { status: 201, headers: { "Cache-Control": "private, no-store" } });
    }

    const { data: sent, error } = await supabase.rpc("app_send_sms_campaign", {
      p_actor: user.id,
      p_campaign_id: data.campaignId,
    });
    if (error) throw staffError(error);
    return NextResponse.json(sent, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
