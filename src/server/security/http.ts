import { NextResponse } from "next/server";
import { ZodError } from "zod";

/**
 * The status a domain code deserves.
 *
 * A rejection the caller can act on is a 4xx with the specific code, not a
 * generic server error: a kitchen that cannot fire a ticket needs to know
 * which transition was refused, not that "something" failed.
 */
const DOMAIN_STATUS: Record<string, number> = {
  INVALID_REQUEST: 400,
  INVALID_QUANTITY: 400,
  INVALID_TICKET_TRANSITION: 400,
  MODIFIER_NOT_ALLOWED: 400,
  MODIFIER_SELECTION_LIMIT: 400,
  MODIFIER_SELECTION_REQUIRED: 400,
  TICKET_NOT_FOUND: 404,
  TICKET_ITEM_NOT_FOUND: 404,
  ORDER_ITEM_NOT_FOUND: 404,
  ITEM_NOT_FOUND: 404,
  INGREDIENT_NOT_FOUND: 404,
  TABLE_NOT_FOUND: 404,
  LOCATION_NOT_FOUND: 404,
  ORDER_NOT_FOUND: 404,
  FLOOR_PLAN_NOT_FOUND: 404,
  PURCHASE_ORDER_NOT_FOUND: 404,
  SHIFT_NOT_FOUND: 404,
  PAYMENT_ATTEMPT_NOT_FOUND: 404,
  ATTEMPT_NOT_FOUND: 404,
  ITEM_UNAVAILABLE: 409,
  MODIFIER_UNAVAILABLE: 409,
  LOCATION_CLOSED: 409,
  ORDERING_NOT_ENABLED: 409,
  SCHEDULE_OUTSIDE_OPENING_HOURS: 409,
  OUTSIDE_SERVICE_AREA: 409,
  DELIVERY_MIN_ORDER: 409,
  PROMOTION_NOT_FOUND: 409,
  PROMOTION_EXHAUSTED: 409,
  REFUND_LIMIT_EXCEEDED: 409,
  PAYMENT_NOT_SETTLED: 409,
  SHIFT_ALREADY_OPEN: 409,
  SHIFT_NOT_OPEN: 409,
  RESERVATION_CAPACITY_EXCEEDED: 409,
  TABLE_ALREADY_BOOKED: 409,
  TABLE_NAME_TAKEN: 409,
  TABLE_HAS_BOOKINGS: 409,
  FLOOR_PLAN_EMPTY: 409,
  PURCHASE_ORDER_ALREADY_RECEIVED: 409,
  PURCHASE_ORDER_CANCELLED: 409,
  INVALID_SETTINGS: 400,
  INVALID_OPENING_HOURS: 400,
  INVALID_SERVICE_AREA: 400,
};

export function apiError(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "INVALID_REQUEST", issues: error.issues }, { status: 400 });
  }
  const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
  const status = code === "AUTH_REQUIRED" ? 401
    : code.includes("NOT_CONFIGURED") ? 503
    : code === "RATE_LIMITED" ? 429
    : code === "FORBIDDEN" ? 403
    : DOMAIN_STATUS[code] ?? (code === "INVALID_REQUEST" ? 400 : 500);
  if (status === 500) {
    // The cause is logged on the server only. The response never carries the
    // underlying message, because it can contain internal identifiers.
    console.error("Request failed", code);
  }
  return NextResponse.json(
    { error: status === 500 ? "INTERNAL_ERROR" : code },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}
