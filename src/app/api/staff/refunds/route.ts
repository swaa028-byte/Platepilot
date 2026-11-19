import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { mapStaffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";

const input = z.object({
  attemptId: z.string().uuid(),
  amountMinor: z.string().regex(/^[0-9]+$/, "amountMinor must be an integer string"),
  reason: z.string().trim().min(1).max(500),
});

/**
 * Requests a refund against a settled payment. The refundable limit is
 * enforced on the server; a request is recorded as requested and confirmed
 * later by provider reconciliation.
 */
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    const body = input.parse(await request.json());
    const { data, error } = await supabase.rpc("app_request_refund", {
      p_attempt_id: body.attemptId,
      p_amount_minor: body.amountMinor,
      p_reason: body.reason,
      p_actor: user.id,
    });
    if (error) throw new Error(mapStaffError(error.message));
    return NextResponse.json(data, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
