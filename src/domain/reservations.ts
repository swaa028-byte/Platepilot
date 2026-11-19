export type ReservationWindow = { start: Date; end: Date; partySize: number };

export function validateReservation(window: ReservationWindow, now = new Date()) {
  if (window.start >= window.end) throw new Error("INVALID_RESERVATION_WINDOW");
  if (window.end <= now) throw new Error("RESERVATION_IN_PAST");
  if (!Number.isSafeInteger(window.partySize) || window.partySize < 1 || window.partySize > 100) {
    throw new Error("INVALID_PARTY_SIZE");
  }
  return window;
}

export function overlaps(left: Pick<ReservationWindow, "start" | "end">, right: Pick<ReservationWindow, "start" | "end">) {
  return left.start < right.end && right.start < left.end;
}

export function availableSeats(capacity: number, bookings: readonly ReservationWindow[], candidate: ReservationWindow) {
  if (!Number.isSafeInteger(capacity) || capacity < 0) throw new Error("INVALID_CAPACITY");
  const booked = bookings.filter((item) => overlaps(item, candidate)).reduce((sum, item) => sum + item.partySize, 0);
  return Math.max(0, capacity - booked);
}
