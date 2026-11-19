import { NextResponse } from "next/server";
import { createAdminClient } from "@/server/db/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("organizations").select("id", { count: "exact", head: true }).limit(1);
    if (error) throw error;
    return NextResponse.json({ status: "ready" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "not_ready", dependency: "database" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
