import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function apiError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "INVALID_REQUEST", issues: error.issues }, { status: 400 });
  }
  const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
  const status = code === "AUTH_REQUIRED" ? 401
    : code.includes("NOT_CONFIGURED") ? 503
    : code === "RATE_LIMITED" ? 429
    : code === "FORBIDDEN" ? 403
    : code === "INVALID_REQUEST" ? 400 : 500;
  return NextResponse.json(
    { error: status === 500 ? "INTERNAL_ERROR" : code },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}
