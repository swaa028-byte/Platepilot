import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/server/auth/config";
import { readLocalSessionUserId } from "@/server/auth/local-session";

/**
 * Reports whether a staff member is signed in.
 *
 * The response deliberately contains only a boolean and, in local mode, the
 * derived user identifier. No email address, membership or tenant detail is
 * exposed to an unauthenticated caller.
 */
export async function GET() {
  try {
    if (isSupabaseConfigured()) {
      const { createClient } = await import("@/server/auth/server");
      const supabase = await createClient();
      const { data, error } = await supabase.auth.getUser();
      const authenticated = !error && Boolean(data.user);
      return NextResponse.json(
        { authenticated, mode: "supabase" },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const userId = await readLocalSessionUserId();
    return NextResponse.json(
      { authenticated: Boolean(userId), mode: "local" },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ authenticated: false }, { headers: { "Cache-Control": "private, no-store" } });
  }
}
