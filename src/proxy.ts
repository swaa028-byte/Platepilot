import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // `auth` is excluded so the sign-in callback runs before locale routing:
  // next-intl would otherwise send /auth/callback to /en/auth/callback, where
  // nothing answers, and the emailed code would expire unread.
  matcher: ["/((?!api|auth|_next|_vercel|.*\\..*).*)"],
};
