import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { appBaseUrl } from "@/domain/app-url";

const intl = createMiddleware(routing);

/**
 * Country to interface language.
 *
 * Visitors are routed by the edge's geo header: Cloudflare (`cf-ipcountry`,
 * which the tunnel also carries), Netlify (`x-nf-country`) or Vercel
 * (`x-vercel-ip-country`). Nigeria speaks English; the CFA franc belt
 * (Cameroon, Congo, Senegal, Côte d'Ivoire, …) and France speak French; the
 * Iberian and Lusophone markets map to their own languages. Everything else
 * keeps the default.
 */
const COUNTRY_LOCALES: Record<string, string> = {
  NG: "en",
  CM: "fr", CG: "fr", CD: "fr", CF: "fr", TD: "fr", GA: "fr", GQ: "fr", KM: "fr",
  SN: "fr", CI: "fr", ML: "fr", BF: "fr", BJ: "fr", NE: "fr", TG: "fr", GW: "fr",
  FR: "fr", BE: "fr", LU: "fr", MC: "fr",
  ES: "es", MX: "es", AR: "es", CL: "es", CO: "es", PE: "es",
  PT: "pt", BR: "pt", AO: "pt", MZ: "pt",
  SA: "ar", AE: "ar", MA: "ar", DZ: "ar", TN: "ar", EG: "ar",
};

/**
 * First visit, no explicit choice: pick the language from the visitor's
 * country. Only the bare root path is redirected — an explicit path, a saved
 * NEXT_LOCALE cookie, or any API/auth route always wins over geo-guessing.
 */
function geoLocaleRedirect(request: NextRequest): NextResponse | null {
  if (request.nextUrl.pathname !== "/") return null;
  if (request.cookies.get("NEXT_LOCALE")) return null;
  const country = (
    request.headers.get("cf-ipcountry")
    ?? request.headers.get("x-nf-country")
    ?? request.headers.get("x-vercel-ip-country")
    ?? ""
  ).toUpperCase();
  const locale = COUNTRY_LOCALES[country];
  if (!locale || locale === routing.defaultLocale) return null;
  return NextResponse.redirect(new URL(`/${locale}`, request.url));
}

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
  const canonical = process.env.APP_URL ? new URL(appBaseUrl()).host : null;
  const host = request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  // One public website, one set of words. The WordPress site owns the
  // marketing pages; this app owns ordering, staff and the storefront. When the
  // Worker is reached on its *.workers.dev address, hand the marketing routes
  // over instead of rendering a second, differently-worded copy of them - that
  // duplication is what makes two sites disagree. PUBLIC_SITE_URL empty (local,
  // tests) leaves everything as it was.
  const publicSite = (process.env.PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
  const publicHost = publicSite ? new URL(publicSite).host : "";
  // Any host that is not the public website - the Worker's workers.dev alias,
  // Netlify's *.netlify.app alias or the app's own domain - hands marketing
  // routes to the public site. Only the app's own routes stay here.
  if (publicSite && host && host !== publicHost) {
    const marketing = request.nextUrl.pathname.match(
      /^\/(?:[a-z]{2}(?:-[a-z]{2})?)?\/?(about|features|how-it-works|integrations|pricing|white-label|status)?\/?$/,
    );
    if (marketing) {
      const slug = marketing[1] ?? "";
      return NextResponse.redirect(new URL(slug ? `/${slug}` : "/", publicSite), 301);
    }
  }

  if (canonical && host && host !== canonical && proto === "https") {
    return NextResponse.redirect(new URL(request.nextUrl.pathname + request.nextUrl.search, `https://${canonical}`));
  }
  return geoLocaleRedirect(request) ?? intl(request);
}

export const config = {
  // `auth` is excluded so the sign-in callback runs before locale routing:
  // next-intl would otherwise send /auth/callback to /en/auth/callback, where
  // nothing answers, and the emailed code would expire unread.
  matcher: ["/((?!api|auth|_next|_vercel|.*\\..*).*)"],
};
