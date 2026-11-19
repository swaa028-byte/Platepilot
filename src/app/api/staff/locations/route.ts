import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/server";
import { staffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";

/**
 * The locations the signed-in member belongs to, with the role they hold at
 * each one. Staff surfaces use this to know which floor they are standing in.
 */
export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    const { data, error } = await supabase.rpc("app_my_locations", { p_actor: user.id });
    if (error) throw staffError(error);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
