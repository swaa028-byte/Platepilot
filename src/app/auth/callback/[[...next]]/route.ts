import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/server/auth/config";
import { createClient } from "@/server/auth/server";

/**
 * Completes a sign-in that started in an email.
 *
 * Supabase sends the browser here with either a `code` (the PKCE flow, which the
 * browser client began when it requested the link) or a `token_hash` and `type`
 * (the email-OTP shape, the only one that can work on a phone or second machine
 * that never held the verifier cookie). Nothing used to redeem either, so the
 * visitor arrived without a session and was shown the sign-in form again.
 *
 * The destination also arrives as a path segment - /auth/callback/en/operations -
 * rather than a query string. Supabase checks the redirect target against its
 * allow list, and a query string gave it room to reject the app's request and
 * fall back to the Site URL root, which strands the code on the landing page.
 */
export async function GET(request: Request, context: { params: Promise<{ next?: string[] }> }) {
  const url = new URL(request.url);
  const { next: segments } = await context.params;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(segments, url.searchParams.get("next"));

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
 * The path form is the primary one; the query form is still accepted because a
 * link already in someone's inbox carries it. Either way, anything that is not a
 * site-relative path is replaced, so a crafted ?next= cannot turn the callback
 * into a redirector to another origin.
 */
function safeNext(segments: string[] | undefined, query: string | null) {
  if (segments && segments.length > 0) {
    const joined = "/" + segments.map(decodeURIComponent).join("/");
    if (/^\/[A-Za-z0-9\-/]*$/.test(joined) && !joined.includes("//")) return joined;
  }
  if (query && query.startsWith("/") && !query.startsWith("//")) return query;
  return "/en/operations";
}
