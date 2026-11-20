import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { staffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";
import { checkRateLimit } from "@/server/security/rate-limit";

const table = z.object({
  locationId: z.string().uuid(),
  tableId: z.string().uuid().nullish(),
  name: z.string().trim().min(1).max(60),
  capacity: z.number().int().min(1).max(100),
});

function params(request: Request) {
  const query = new URL(request.url).searchParams;
  const locationId = query.get("locationId");
  const tableId = query.get("tableId");
  const uuid = z.string().uuid();
  return {
    locationId: locationId && uuid.safeParse(locationId).success ? locationId : null,
    tableId: tableId && uuid.safeParse(tableId).success ? tableId : null,
  };
}

/**
 * The tables a reservation is booked against.
 */
export async function GET(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const { locationId } = params(request);
    if (!locationId) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });

    const { data, error } = await supabase.rpc("app_list_tables", {
      p_location_id: locationId,
      p_actor: user.id,
    });
    if (error) throw staffError(error);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

/**
 * Adds a table, or renames and resizes an existing one.
 */
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`staff-tables:${user.id}`, 120, 60_000);
    const body = table.parse(await request.json());

    const { data, error } = await supabase.rpc("app_upsert_table", {
      p_location_id: body.locationId,
      p_actor: user.id,
      p_table_id: body.tableId ?? null,
      p_name: body.name,
      p_capacity: body.capacity,
    });
    if (error) throw staffError(error);
    return NextResponse.json(data, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

/**
 * Removes a table. A table with an upcoming booking is kept.
 */
export async function DELETE(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`staff-tables:${user.id}`, 120, 60_000);
    const { locationId, tableId } = params(request);
    if (!locationId || !tableId) return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });

    const { data, error } = await supabase.rpc("app_delete_table", {
      p_location_id: locationId,
      p_actor: user.id,
      p_table_id: tableId,
    });
    if (error) throw staffError(error);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
