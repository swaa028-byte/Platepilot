import { NextResponse } from "next/server";
import { parseMenuCsv } from "@/domain/menu";
import { requireUser } from "@/server/auth/server";
import { checkRateLimit } from "@/server/security/rate-limit";
import { apiError } from "@/server/security/http";

/**
 * Validates a merchant menu file and returns a preview for approval.
 *
 * The preview never creates a published menu; publishing is a separate,
 * separately authorised step. Nothing is invented: prices, allergens and
 * availability come from the merchant's own file.
 */
export async function POST(request: Request) {
  try {
    const { user } = await requireUser();
    checkRateLimit(`menu-import:${user.id}`, 10, 60_000);
    const source = await request.text();
    if (source.length > 1_000_000) return NextResponse.json({ error: "FILE_TOO_LARGE" }, { status: 413 });
    const items = parseMenuCsv(source);
    return NextResponse.json(
      { items, count: items.length },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) { return apiError(error); }
}
