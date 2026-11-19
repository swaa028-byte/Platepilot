import { describe, expect, it } from "vitest";
import { canApplyVerifiedPayment, canTransitionFulfillment, refundableMinor } from "@/domain/orders";
import { applyMovements } from "@/domain/inventory";
import { availableSeats, overlaps, validateReservation } from "@/domain/reservations";
import { assertTablesInsideRoom, floorDraftSchema, type FloorDraft } from "@/domain/floor";

describe("order and payment invariants", () => {
  it("keeps fulfillment separate and rejects illegal transitions", () => {
    expect(canTransitionFulfillment("received", "preparing")).toBe(true);
    expect(canTransitionFulfillment("received", "served")).toBe(false);
    expect(canTransitionFulfillment("completed", "preparing")).toBe(false);
  });
  it("applies verified payment once and enforces refund limits", () => {
    expect(canApplyVerifiedPayment({ orderPaid: false, attemptAlreadyApplied: false, providerEventAlreadyProcessed: false })).toBe(true);
    expect(canApplyVerifiedPayment({ orderPaid: true, attemptAlreadyApplied: false, providerEventAlreadyProcessed: false })).toBe(false);
    expect(refundableMinor(1000n, 300n)).toBe(700n);
    expect(() => refundableMinor(1000n, 1001n)).toThrow("INVALID_REFUND_LEDGER");
  });
});

describe("inventory ledger", () => {
  it("depletes exactly once by event ID", () => {
    const receipt = { eventId: "receipt-1", ingredientId: "flour", quantityMilliUnits: 5000n, kind: "receipt" as const };
    const use = { eventId: "order-1", ingredientId: "flour", quantityMilliUnits: -500n, kind: "depletion" as const };
    expect(applyMovements([receipt, use, use]).get("flour")).toBe(4500n);
    expect(() => applyMovements([use])).toThrow("INSUFFICIENT_STOCK");
  });
});

describe("reservation capacity", () => {
  const start = new Date("2030-01-01T18:00:00Z"); const end = new Date("2030-01-01T20:00:00Z");
  it("uses strict interval overlap and validates party size", () => {
    expect(overlaps({ start, end }, { start: end, end: new Date("2030-01-01T21:00:00Z") })).toBe(false);
    expect(availableSeats(20, [{ start, end, partySize: 8 }], { start, end, partySize: 4 })).toBe(12);
    expect(validateReservation({ start, end, partySize: 4 }, new Date("2029-01-01"))).toBeDefined();
    expect(() => validateReservation({ start, end, partySize: 0 }, new Date("2029-01-01"))).toThrow("INVALID_PARTY_SIZE");
  });
});

describe("floor geometry", () => {
  const table = { id: crypto.randomUUID(), name: "A", x: 1, z: 1, width: 1, depth: 1, rotationRadians: 0, capacity: 2, state: "available" as const };
  it("validates real bounds and rejects tables outside the room", () => {
    const draft: FloorDraft = { version: 1, width: 5, depth: 4, tables: [table] };
    expect(assertTablesInsideRoom(floorDraftSchema.parse(draft))).toBeDefined();
    expect(() => assertTablesInsideRoom({ ...draft, width: 1 })).toThrow("TABLE_OUTSIDE_ROOM");
    expect(() => assertTablesInsideRoom({ ...draft, width: 0, tables: [] })).toThrow("ROOM_DIMENSIONS_REQUIRED");
  });
});
