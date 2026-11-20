import { NextResponse } from "next/server";
import { getDbClient, getDatabaseMode } from "@/server/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDbClient();
    // A HEAD request (head: true) is answered with 204 by PostgREST even when
    // the table does not exist, so it cannot be used to prove the schema is
    // installed. Read one real row instead.
    const { error } = await db.from("organizations").select("id").limit(1);
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
