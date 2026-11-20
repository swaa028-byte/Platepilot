import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { embeddedDatabaseAllowed } from "@/server/db/hosting";

/**
 * Local session for the self-hosted, database-less deployment.
 *
 * When Supabase Auth is configured it is used and this module is never
 * reached. Otherwise PlatePilot signs the user in against its own local
 * database with a signed cookie. The cookie carries only a derived user
 * identifier and the time it was issued; it is authenticated with an HMAC and
 * cannot be edited to become another user.
 */

const COOKIE_NAME = "pp_local_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const FALLBACK_SECRET = "platepilot-local-development-secret-change-me";

function sessionSecret() {
  return process.env.LOCAL_SESSION_SECRET || FALLBACK_SECRET;
}

/**
 * A stable identifier for an email address. The same address always maps to
 * the same identifier, so signing in again on the same installation reaches
 * the same memberships and the same merchant.
 */
export function localUserId(email: string) {
  const normalized = email.trim().toLowerCase();
  const hash = createHash("sha1").update(`platepilot:local:${normalized}`).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `a${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join("-");
}

function sign(value: string) {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

export async function readLocalSessionUserId() {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [userId, issued, mac] = parts;
  const expected = sign(`${userId}.${issued}`);
  const provided = Buffer.from(mac);
  const computed = Buffer.from(expected);
  if (provided.length !== computed.length || !timingSafeEqual(provided, computed)) return null;
  const issuedAt = Number(issued);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > MAX_AGE_SECONDS * 1000) return null;
  return userId;
}

export async function writeLocalSession(userId: string, request?: Request) {
  const issued = String(Date.now());
  const value = `${userId}.${issued}.${sign(`${userId}.${issued}`)}`;
  const store = await cookies();
  store.set(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/**
 * Whether the connection that carried the request is encrypted.
 *
 * The cookie is only marked secure when the connection really is secure.
 * A self-hosted restaurant running PlatePilot on its own network serves plain
 * HTTP, and some browsers refuse to store a secure cookie there, which would
 * sign the staff member out on every request.
 */
function isSecureRequest(request?: Request) {
  if (!request) return false;
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwarded) return forwarded === "https";
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

export async function clearLocalSession() {
  const store = await cookies();
  store.set(COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
}

/** True when PlatePilot is configured to use its own local database. */
export function isLocalModeEnabled() {
  if (process.env.PLATEPILOT_LOCAL_DB === "0") return false;
  if (!embeddedDatabaseAllowed()) return false;
  return !process.env.NEXT_PUBLIC_SUPABASE_URL;
}
