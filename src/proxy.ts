import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);

/**
 * One canonical host.
 *
 * Netlify serves every deploy under a unique alias (123abc--site.netlify.app) as
 * well as the production name. A visitor who arrives on an alias - via the
 * dashboard, a stale tab or a deploy notification - signs in on that host, so the
 * PKCE verifier cookie is set for it, and the emailed link carries it in the
 * redirect. Cookies and the auth allow list are per-host, which is how a sign-in
 * that works on one URL dies on another.
 *
 * Anything that is not the canonical host is therefore redirected there, path
 * intact. APP_URL is set to the canonical origin in every deploy context, and to
 * localhost in development, so local dev is unaffected by construction.
 */
export default function proxy(request: NextRequest) {
  const canonical = process.env.APP_URL ? new URL(process.env.APP_URL).host : null;
  const host = request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  if (canonical && host && host !== canonical && proto === "https") {
    return NextResponse.redirect(new URL(request.nextUrl.pathname + request.nextUrl.search, `https://${canonical}`));
  }
  return intl(request);
}

export const config = {
  // `auth` is excluded so the sign-in callback runs before locale routing:
  // next-intl would otherwise send /auth/callback to /en/auth/callback, where
  // nothing answers, and the emailed code would expire unread.
  matcher: ["/((?!api|auth|_next|_vercel|.*\\..*).*)"],
};
