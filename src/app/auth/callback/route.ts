import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/server/auth/config";
import { createClient } from "@/server/auth/server";

/**
 * Completes a sign-in that started in an email.
 *
 * Supabase sends the browser back here with either a `code` (the PKCE flow,
 * which the browser client began when it requested the link) or a `token_hash`
 * and `type` (the older email-OTP flow). Nothing else in this application
 * redeemed either of those, so the visitor arrived on a protected page without a
 * session and was sent straight back to the sign-in form - which reads as "my
 * account was never created" even though the account exists and is confirmed.
 *
 * Both shapes are handled here because the same link is opened in two very
 * different places: the browser that asked for it (the PKCE verifier cookie is
 * present, so `code` works) and a phone or a second machine (no verifier, so a
 * `token_hash` link is the only one that can succeed).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(url.searchParams.get("next"));

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(new URL(next, url.origin));
  }

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }

  // A link that has already been used, or that was opened in a browser which
  // never held the verifier, cannot become a session. Say so on the form rather
  // than bouncing silently.
  const failed = new URL("/login", url.origin);
  failed.searchParams.set("error", "link_expired");
  return NextResponse.redirect(failed);
}

/**
 * Keeps the redirect inside this site.
 *
 * `next` arrives from a URL, so without this a link could carry
 * `?next=https://example.com` and turn the sign-in callback into a redirector.
 */
function safeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/en/operations";
  return value;
}
