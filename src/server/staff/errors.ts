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
