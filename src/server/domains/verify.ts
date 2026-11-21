/**
 * Custom-domain verification over DNS-over-HTTPS.
 *
 * A claimed domain is verified when it actually resolves to this deployment:
 * its CNAME chain passes through the canonical host, or its A/AAAA records
 * match the canonical host's addresses. The lookup uses the public DoH JSON
 * API so the check works from any runtime without native DNS libraries, and
 * the answer comes from real DNS — never from what the merchant typed.
 */

const DNS_BASE = process.env.DNS_OVER_HTTPS_URL || "https://dns.google/resolve";

type DohAnswer = { name: string; type: number; TTL: number; data: string };
type DohResponse = { Status: number; Answer?: DohAnswer[] };

async function resolve(name: string, type: "A" | "AAAA" | "CNAME"): Promise<DohResponse> {
  const url = `${DNS_BASE}?name=${encodeURIComponent(name)}&type=${type}`;
  const response = await fetch(url, { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(8_000) });
  if (!response.ok) throw new Error(`DNS_HTTP_${response.status}`);
  return (await response.json()) as DohResponse;
}

export type DomainCheck = { ok: boolean; detail: string };

export async function checkDomainPointsAtUs(domain: string, targetHost: string): Promise<DomainCheck> {
  let targetAddresses: Set<string>;
  try {
    const [a, aaaa] = await Promise.all([resolve(targetHost, "A"), resolve(targetHost, "AAAA")]);
    targetAddresses = new Set([
      ...(a.Answer ?? []).filter((record) => record.type === 1).map((record) => record.data),
      ...(aaaa.Answer ?? []).filter((record) => record.type === 28).map((record) => record.data),
    ]);
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "TARGET_UNRESOLVABLE" };
  }

  try {
    const cname = await resolve(domain, "CNAME");
    const chain = (cname.Answer ?? []).filter((record) => record.type === 5).map((record) => record.data.replace(/\.$/, ""));
    if (chain.some((hop) => hop === targetHost || hop.endsWith(`.${targetHost}`))) {
      return { ok: true, detail: `CNAME -> ${chain[0]}` };
    }
    const [a, aaaa] = await Promise.all([resolve(domain, "A"), resolve(domain, "AAAA")]);
    const addresses = new Set([
      ...(a.Answer ?? []).filter((record) => record.type === 1).map((record) => record.data),
      ...(aaaa.Answer ?? []).filter((record) => record.type === 28).map((record) => record.data),
    ]);
    for (const address of addresses) {
      if (targetAddresses.has(address)) return { ok: true, detail: `A ${address}` };
    }
    if (addresses.size === 0 && chain.length === 0) {
      return { ok: false, detail: "NO_DNS_RECORDS" };
    }
    return { ok: false, detail: `RESOLVES_ELSEWHERE (${[...chain, ...addresses].join(", ")})` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : "DNS_CHECK_FAILED" };
  }
}
