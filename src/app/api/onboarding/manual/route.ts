import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { checkRateLimit } from "@/server/security/rate-limit";
import { apiError } from "@/server/security/http";

const input = z.object({
  name: z.string().trim().min(1).max(120), address: z.string().trim().min(1).max(300),
  legalCountry: z.string().regex(/^[A-Z]{2}$/), currency: z.enum(["USD", "EUR", "GBP", "ZAR", "CAD", "AUD", "NGN", "KES", "JPY", "KWD"]),
  timezone: z.string().max(100).refine((value) => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }),
  locale: z.enum(["en", "fr", "es", "pt", "ar"]), placeId: z.string().max(300).optional(),
});

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`onboarding:${user.id}`, 5, 60_000);
    const body = input.parse(await request.json());
    const { data, error } = await supabase.rpc("app_create_merchant", {
      p_name: body.name, p_address: body.address, p_legal_country: body.legalCountry,
      p_currency: body.currency, p_timezone: body.timezone, p_locale: body.locale,
      p_place_id: body.placeId ?? null,
    });
    if (error) throw new Error("ONBOARDING_REJECTED");
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
