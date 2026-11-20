/**
 * Maps a database rejection onto the API vocabulary.
 *
 * The database raises stable error names; the API turns them into the same
 * error codes the rest of the application already returns so staff clients do
 * not have to understand PostgreSQL messages.
 */
export function mapStaffError(message: string) {
  if (message.includes("FORBIDDEN")) return "FORBIDDEN";
  if (message.includes("ITEM_UNAVAILABLE")) return "ITEM_UNAVAILABLE";
  if (message.includes("MODIFIER")) return "MODIFIER_NOT_ALLOWED";
  if (message.includes("TABLE_NOT_FOUND")) return "TABLE_NOT_FOUND";
  if (message.includes("TABLE_NAME_TAKEN")) return "TABLE_NAME_TAKEN";
  if (message.includes("TABLE_HAS_BOOKINGS")) return "TABLE_HAS_BOOKINGS";
  if (message.includes("LOCATION_NOT_FOUND")) return "LOCATION_NOT_FOUND";
  if (message.includes("ORDER_NOT_FOUND")) return "ORDER_NOT_FOUND";
  if (message.includes("INVALID_OPENING_HOURS")) return "INVALID_OPENING_HOURS";
  if (message.includes("INVALID_SERVICE_AREA")) return "INVALID_SERVICE_AREA";
  if (message.includes("INVALID_SETTINGS")) return "INVALID_SETTINGS";
  if (message.includes("FLOOR_PLAN_NOT_FOUND")) return "FLOOR_PLAN_NOT_FOUND";
  if (message.includes("FLOOR_PLAN_EMPTY")) return "FLOOR_PLAN_EMPTY";
  if (message.includes("TICKET_NOT_FOUND")) return "TICKET_NOT_FOUND";
  if (message.includes("INVALID_TICKET_TRANSITION")) return "INVALID_TICKET_TRANSITION";
  if (message.includes("REFUND_LIMIT_EXCEEDED")) return "REFUND_LIMIT_EXCEEDED";
  if (message.includes("PAYMENT_NOT_SETTLED")) return "PAYMENT_NOT_SETTLED";
  if (message.includes("ATTEMPT_NOT_FOUND")) return "PAYMENT_ATTEMPT_NOT_FOUND";
  if (message.includes("SHIFT_ALREADY_OPEN")) return "SHIFT_ALREADY_OPEN";
  if (message.includes("SHIFT_NOT_OPEN")) return "SHIFT_NOT_OPEN";
  if (message.includes("SHIFT_NOT_FOUND")) return "SHIFT_NOT_FOUND";
  if (message.includes("RESERVATION_CAPACITY")) return "RESERVATION_CAPACITY_EXCEEDED";
  if (message.includes("TABLE_ALREADY_BOOKED")) return "TABLE_ALREADY_BOOKED";
  if (message.includes("INVALID_REQUEST")) return "INVALID_REQUEST";
  return "REQUEST_REJECTED";
}

/**
 * Maps a database rejection and records the original reason on the server.
 *
 * The client only ever receives the mapped code. The original reason is kept
 * in the server log, because an unmapped rejection is a defect that has to be
 * diagnosable without leaking database details to a browser.
 */
export function staffError(error: { message: string; code?: string } | null) {
  if (!error) return new Error("REQUEST_REJECTED");
  const mapped = mapStaffError(error.message);
  if (mapped === "REQUEST_REJECTED") {
    console.error("Unmapped database rejection", { message: error.message, code: error.code });
  }
  return new Error(mapped);
}
