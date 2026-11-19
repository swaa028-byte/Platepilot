import { NextResponse } from "next/server";
import { getDbClient, getDatabaseMode } from "@/server/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDbClient();
    const { error } = await db.from("organizations").select("id", { count: "exact", head: true }).limit(1);
    if (error) throw error;
    return NextResponse.json(
      { status: "ready", database: getDatabaseMode() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "not_ready", dependency: "database" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
