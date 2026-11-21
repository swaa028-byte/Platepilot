import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { staffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";
import { checkRateLimit } from "@/server/security/rate-limit";

const clock = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "expected HH:MM");
const money = z.string().regex(/^[0-9]+$/, "expected integer minor units");

const settings = z.object({
  openingHours: z.record(z.string().regex(/^[0-6]$/), z.array(z.tuple([clock, clock])).max(4)).optional(),
  deliveryFeeMinor: money.optional(),
  minimumOrderMinor: money.optional(),
  taxBasisPoints: z.number().int().min(0).max(10000).optional(),
  prepMinutes: z.number().int().min(0).max(240).optional(),
  serviceArea: z.object({ postalCodes: z.array(z.string().trim().min(1).max(20)).max(200).optional() }).strict().optional(),
  sms: z.object({ enabled: z.boolean(), phone: z.string().regex(/^\+[1-9][0-9]{6,14}$/, "expected E.164 phone number") }).strict().optional(),
}).strict();

const input = z.object({
  locationId: z.string().uuid(),
  orderingEnabled: z.boolean(),
  serviceSettings: settings,
});

function locationIdFrom(request: Request) {
  const value = new URL(request.url).searchParams.get("locationId");
  return value && z.string().uuid().safeParse(value).success ? value : null;
}

/**
 * A malformed settings body is named for the field that is wrong, using the same
 * vocabulary the database raises, so the merchant is told which value to fix
 * rather than that the whole form was rejected.
 */
function validate(body: unknown) {
  try {
    return input.parse(body);
  } catch (error) {
    if (!(error instanceof z.ZodError)) throw error;
    const path = error.issues.map((issue) => issue.path.join(".")).join(" ");
    if (path.includes("openingHours")) throw new Error("INVALID_OPENING_HOURS");
    if (path.includes("serviceArea")) throw new Error("INVALID_SERVICE_AREA");
    if (path.includes("serviceSettings")) throw new Error("INVALID_SETTINGS");
    throw new Error("INVALID_REQUEST");
  }
}

/**
 * The settings this location orders and books by: whether the storefront is
 * open, when it is open, and what delivery costs.
 */
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const locationId = locationIdFrom(request);
    if (!locationId) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });

    const { data, error } = await supabase.rpc("app_location_settings", {
      p_location_id: locationId,
      p_actor: user.id,
    });
    if (error) throw staffError(error);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

/**
 * Saves the settings and returns what the storefront will now do. The database
 * validates the values, so a rejected save is a rejected save and not an order
 * that fails later at the till.
 */
export async function PUT(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`staff-settings:${user.id}`, 60, 60_000);
    const body = validate(await request.json());

    const { data, error } = await supabase.rpc("app_update_location_settings", {
      p_location_id: body.locationId,
      p_actor: user.id,
      p_ordering_enabled: body.orderingEnabled,
      p_service_settings: body.serviceSettings,
    });
    if (error) throw staffError(error);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
