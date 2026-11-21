import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { staffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";
import { checkRateLimit } from "@/server/security/rate-limit";

type PlaceResult = { placeId: string; displayName: string; formattedAddress: string };

/**
 * "Find your restaurant": Google Places text search ("name, city"). The API
 * key stays server-side; the browser only ever sees simplified results. The
 * merchant picks a branch and its Place ID is linked to the location — a link,
 * not an ownership claim.
 */
export async function GET(request: Request) {
  try {
    const { user } = await requireUser();
    checkRateLimit(`places:${user.id}`, 30, 60_000);
    const query = new URL(request.url).searchParams.get("q") ?? "";
    if (query.trim().length < 3 || query.length > 200) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "GOOGLE_NOT_CONFIGURED" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress",
      },
      body: JSON.stringify({ textQuery: query.trim(), maxResultCount: 5 }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.error("places search failed", response.status);
      return NextResponse.json({ error: "PLACES_SEARCH_FAILED" }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
    const data = (await response.json()) as {
      places?: Array<{ id: string; displayName?: { text?: string }; formattedAddress?: string }>;
    };
    const results: PlaceResult[] = (data.places ?? []).map((place) => ({
      placeId: place.id,
      displayName: place.displayName?.text ?? "",
      formattedAddress: place.formattedAddress ?? "",
    }));
    return NextResponse.json({ results }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
