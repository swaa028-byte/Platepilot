import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/server/db/runtime";
import { checkRateLimit } from "@/server/security/rate-limit";

const body = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(200),
});

/**
 * Creates a vendor account that is ready to use immediately.
 *
 * The alternative is Supabase's own signUp, which only finishes once the vendor
 * clicks a link in an email. That is the right flow for a project with working
 * mail delivery, and PlatePilot ships with it - but a project that has not been
 * given an SMTP provider yet cannot deliver to an arbitrary address at all, so
 * the vendor door would accept a registration and then strand the person who
 * made it. This route closes that gap: with the service role available, the
 * account is created confirmed, and the browser signs in with the password it
 * just chose.
 *
 * Set AUTO_CONFIRM_SIGNUPS=false to restore the emailed-confirmation flow. That
 * is worth doing as soon as real mail delivery exists, because confirmation is
 * what proves a vendor owns the address they typed.
 */
export async function POST(request: Request) {
  let payload: z.infer<typeof body>;
  try {
    payload = body.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  try {
    checkRateLimit(`register:${payload.email}`, 5, 60_000);
  } catch {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
  }

  if (process.env.AUTO_CONFIRM_SIGNUPS === "false") {
    return NextResponse.json({ error: "MANUAL_CONFIRMATION" }, { status: 501 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    // No service role on this host (local mode, or a Supabase project without
    // the key set). The browser falls back to Supabase's own signUp.
    return NextResponse.json({ error: "REGISTRATION_UNAVAILABLE" }, { status: 501 });
  }

  const { error } = await admin.auth.admin.createUser({
    email: payload.email,
    password: payload.password,
    email_confirm: true,
  });

  if (error) {
    const duplicate =
      error.code === "email_exists" ||
      error.status === 422 ||
      /already|registered|exists/i.test(error.message);
    return NextResponse.json(
      { error: duplicate ? "EMAIL_EXISTS" : "REGISTRATION_FAILED" },
      { status: duplicate ? 409 : 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
