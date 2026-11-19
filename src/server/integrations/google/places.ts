import "server-only";
import { z } from "zod";

const placesResponse = z.object({
  places: z.array(z.object({
    id: z.string().min(1),
    displayName: z.object({ text: z.string() }).optional(),
    formattedAddress: z.string().optional(),
    attributions: z.array(z.object({ provider: z.string().optional(), providerUri: z.string().optional() })).default([]),
  })).default([]),
});

export async function searchRestaurants(query: string, locale: string) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_NOT_CONFIGURED");
  const textQuery = z.string().trim().min(3).max(160).parse(query);
  const languageCode = new Intl.Locale(locale).language;
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.attributions",
    },
    body: JSON.stringify({ textQuery, languageCode, includedType: "restaurant", pageSize: 10 }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(7_000),
  });
  if (!response.ok) throw new Error(`GOOGLE_PLACES_HTTP_${response.status}`);
  return placesResponse.parse(await response.json()).places;
}
