import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/server/security/http";
import { checkRateLimit } from "@/server/security/rate-limit";
import { clearLocalSession, isLocalModeEnabled, localUserId, writeLocalSession } from "@/server/auth/local-session";

const input = z.object({ email: z.string().trim().email().max(320) });

/**
 * Signs a staff member in against PlatePilot's own local database.
 *
 * This route only exists when no hosted Supabase project is configured. It
 * creates no merchant and grants no access on its own: the signed-in user must
 * still be a member of an organization, and the onboarding flow is what
 * creates that membership.
 */
export async function POST(request: Request) {
  try {
    if (!isLocalModeEnabled()) return NextResponse.json({ error: "LOCAL_MODE_DISABLED" }, { status: 404 });
    const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    // Generous ceiling during development: the local session has no captcha or
    // device attestation, so a real attacker is already limited by the
    // ownership boundary. Tests run many sign-ins against one server.
    checkRateLimit(`local-auth-ip:${address}`, 1_000, 60_000);
    const body = input.parse(await request.json());
    checkRateLimit(`local-auth:${address}:${body.email.toLowerCase()}`, 100, 60_000);
    const userId = localUserId(body.email);
    await writeLocalSession(userId, request);
    return NextResponse.json({ userId }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

/** Signs the current staff member out of the local session. */
export async function DELETE() {
  try {
    await clearLocalSession();
    return NextResponse.json({ status: "signed_out" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
