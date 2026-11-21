import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/server";
import { staffError } from "@/server/staff/errors";
import { apiError } from "@/server/security/http";
import { checkRateLimit } from "@/server/security/rate-limit";
import { checkDomainPointsAtUs } from "@/server/domains/verify";

function targetHost(): string {
  return new URL(process.env.APP_URL || "http://localhost:3000").hostname;
}

/**
 * Custom domains for the caller's organization. Claiming returns the exact DNS
 * record to create; verification re-checks real DNS every time it is asked.
 */
export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    const { data, error } = await supabase.rpc("app_list_custom_domains", { p_actor: user.id });
    if (error) throw staffError(error);
    return NextResponse.json(
      { domains: data, dnsTarget: targetHost() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) { return apiError(error); }
}

export async function PUT(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`domains:${user.id}`, 30, 60_000);
    const body = z.object({ domain: z.string().trim().min(4).max(253) }).parse(await request.json());
    const { data, error } = await supabase.rpc("app_add_custom_domain", { p_actor: user.id, p_domain: body.domain });
    if (error) throw staffError(error);
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`domains:${user.id}`, 30, 60_000);
    const domainId = new URL(request.url).searchParams.get("domainId") ?? "";
    if (!z.string().uuid().safeParse(domainId).success) {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }
    const { error } = await supabase.rpc("app_delete_custom_domain", { p_actor: user.id, p_domain_id: domainId });
    if (error) throw staffError(error);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}

/** Re-runs the DNS check now. Verification is never cached longer than a click. */
export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireUser();
    checkRateLimit(`domains:${user.id}`, 20, 60_000);
    const body = z.object({ domainId: z.string().uuid() }).parse(await request.json());
    const { data: domains, error: listError } = await supabase.rpc("app_list_custom_domains", { p_actor: user.id });
    if (listError) throw staffError(listError);
    const record = (domains as Array<{ id: string; domain: string }> | null)?.find((entry) => entry.id === body.domainId);
    if (!record) return NextResponse.json({ error: "DOMAIN_NOT_FOUND" }, { status: 404 });
    const check = await checkDomainPointsAtUs(record.domain, targetHost());
    const { data, error } = await supabase.rpc("app_set_custom_domain_status", {
      p_actor: user.id, p_domain_id: body.domainId, p_ok: check.ok, p_detail: check.detail,
    });
    if (error) throw staffError(error);
    return NextResponse.json({ ...data, detail: check.detail }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
