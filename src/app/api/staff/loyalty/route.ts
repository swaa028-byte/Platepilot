import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { staffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";
import { checkRateLimit } from "@/server/security/rate-limit";

const configure = z.object({
  action: z.literal("configure"),
  organizationId: z.string().uuid(),
  earnPointsPerMinor: z.string().regex(/^[0-9]+$/),
  pointsPerDiscountMinor: z.string().regex(/^[0-9]+$/).refine((v) => Number(v) >= 1, "INVALID_REQUEST"),
  enabled: z.boolean(),
});

const issue = z.object({
  action: z.literal("issue"),
  organizationId: z.string().uuid(),
  initialMinor: z.string().regex(/^[0-9]+$/),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

const disable = z.object({
  action: z.literal("disable"),
  giftCardId: z.string().uuid(),
});

/**
 * The loyalty programme and the gift cards behind it.
 *
 * GET reads the configuration and every card. POST configures the programme,
 * issues a card or disables one — the database checks the manager role, so a
 * forged organizationId here still fails there.
 */
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`staff-loyalty:${user.id}`, 60, 60_000);
    const organizationId = new URL(request.url).searchParams.get("organizationId") ?? "";
    if (!z.string().uuid().safeParse(organizationId).success) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }
    const [config, cards] = await Promise.all([
      supabase.rpc("app_loyalty_config", { p_actor: user.id, p_organization_id: organizationId }),
      supabase.rpc("app_list_gift_cards", { p_actor: user.id, p_organization_id: organizationId }),
    ]);
    if (config.error) throw staffError(config.error);
    if (cards.error) throw staffError(cards.error);
    return NextResponse.json(
      { config: config.data, giftCards: cards.data ?? [] },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`staff-loyalty:${user.id}`, 30, 60_000);
    const body = await request.json();
    const parsed = z.discriminatedUnion("action", [configure, issue, disable]).safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    const data = parsed.data;

    if (data.action === "configure") {
      const { error } = await supabase.rpc("app_configure_loyalty", {
        p_actor: user.id,
        p_organization_id: data.organizationId,
        p_earn_points_per_minor: data.earnPointsPerMinor,
        p_points_per_discount_minor: data.pointsPerDiscountMinor,
        p_enabled: data.enabled,
      });
      if (error) throw staffError(error);
      return NextResponse.json({ status: "saved" }, { headers: { "Cache-Control": "private, no-store" } });
    }

    if (data.action === "issue") {
      const { data: card, error } = await supabase.rpc("app_issue_gift_card", {
        p_actor: user.id,
        p_organization_id: data.organizationId,
        p_initial_minor: data.initialMinor,
        p_currency: data.currency,
      });
      if (error) throw staffError(error);
      return NextResponse.json(card, { status: 201, headers: { "Cache-Control": "private, no-store" } });
    }

    const { error } = await supabase.rpc("app_disable_gift_card", {
      p_actor: user.id,
      p_gift_card_id: data.giftCardId,
    });
    if (error) throw staffError(error);
    return NextResponse.json({ status: "disabled" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
