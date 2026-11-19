import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { searchRestaurants } from "@/server/integrations/google/places";
import { checkRateLimit } from "@/server/security/rate-limit";
import { apiError } from "@/server/security/http";

const input = z.object({ query: z.string().trim().min(3).max(160), locale: z.enum(["en", "fr", "es", "pt", "ar"]) });

export async function POST(request: Request) {
  try {
    const { user } = await requireUser();
    checkRateLimit(`places:${user.id}`);
    const body = input.parse(await request.json());
    const places = await searchRestaurants(body.query, body.locale);
    return NextResponse.json({ places }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
