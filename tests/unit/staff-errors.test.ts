import { describe, expect, it } from "vitest";
import { mapStaffError } from "@/server/staff/errors";

describe("staff error mapping", () => {
  it("maps database rejections onto stable API error codes", () => {
    expect(mapStaffError("FORBIDDEN")).toBe("FORBIDDEN");
    expect(mapStaffError("ITEM_UNAVAILABLE")).toBe("ITEM_UNAVAILABLE");
    expect(mapStaffError("MODIFIER_NOT_ALLOWED")).toBe("MODIFIER_NOT_ALLOWED");
    expect(mapStaffError("MODIFIER_SELECTION_LIMIT")).toBe("MODIFIER_NOT_ALLOWED");
    expect(mapStaffError("INVALID_TICKET_TRANSITION")).toBe("INVALID_TICKET_TRANSITION");
    expect(mapStaffError("REFUND_LIMIT_EXCEEDED")).toBe("REFUND_LIMIT_EXCEEDED");
    expect(mapStaffError("RESERVATION_CAPACITY_EXCEEDED")).toBe("RESERVATION_CAPACITY_EXCEEDED");
    expect(mapStaffError("SHIFT_ALREADY_OPEN")).toBe("SHIFT_ALREADY_OPEN");
  });

  it("never leaks an unmapped database message to a staff client", () => {
    // An unrecognised rejection must not be forwarded verbatim, because a
    // database message can contain internal identifiers or SQL details.
    const mapped = mapStaffError("duplicate key value violates unique constraint \"payments_pkey\"");
    expect(mapped).toBe("REQUEST_REJECTED");
    expect(mapped).not.toContain("payments_pkey");
  });
});
