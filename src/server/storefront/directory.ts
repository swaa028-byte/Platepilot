import { getDbClient } from "@/server/db/client";

/**
 * One restaurant as the public directory shows it.
 *
 * Deliberately narrow: this is the same nine fields the WordPress theme's
 * directory reads, so both surfaces describe a restaurant identically and
 * neither needs to know how the other is built.
 */
export type DirectoryEntry = {
  slug: string;
  name: string;
  address: string;
  currency: string;
  ordering: boolean;
  brand: string;
  items: number;
  leadImage: string | null;
  fromMinor: string | null;
  hours: Record<string, unknown> | null;
};

type Row = Record<string, unknown>;

function toEntry(row: Row): DirectoryEntry | null {
  const slug = typeof row.slug === "string" ? row.slug.trim() : "";
  if (!slug) return null;
  return {
    slug,
    name: typeof row.name === "string" && row.name.trim() ? row.name.trim() : slug,
    address: typeof row.address === "string" ? row.address : "",
    currency: typeof row.currency === "string" ? row.currency : "",
    ordering: row.ordering === true,
    brand: typeof row.brand === "string" && row.brand.trim() ? row.brand.trim() : slug,
    items: typeof row.items === "number" ? row.items : Number(row.items ?? 0) || 0,
    leadImage: typeof row.leadImage === "string" && row.leadImage.trim() ? row.leadImage : null,
    fromMinor: row.fromMinor === null || row.fromMinor === undefined ? null : String(row.fromMinor),
    hours: row.hours && typeof row.hours === "object" ? (row.hours as Record<string, unknown>) : null,
  };
}

/**
 * Every restaurant a guest can order from.
 *
 * Reads the database's public_directory() function, which lists only locations
 * whose price book is published - the same rule the storefront applies - so the
 * directory can never send someone to a restaurant with no menu.
 *
 * The database may not have that function yet (it ships in
 * kit/supabase-directory.sql). Rather than show an empty page when a site owner
 * has not run it, this falls back to reading locations directly and leaves the
 * menu-derived fields blank. The page is then truthful - names, addresses and
 * hours, no dish counts - instead of blank.
 */
export async function getPublicDirectory(): Promise<DirectoryEntry[]> {
  try {
    const db = await getDbClient();
    const { data, error } = await db.rpc("public_directory");
    if (!error && Array.isArray(data)) {
      return (data as Row[])
        .map(toEntry)
        .filter((entry): entry is DirectoryEntry => entry !== null)
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  } catch {
    // A database that cannot be reached falls through to the direct read.
  }

  try {
    const db = await getDbClient();
    const { data, error } = await db
      .from("locations")
      .select("name,slug,address,currency,ordering_enabled,service_settings,organizations(name)");
    if (error || !data) return [];
    return (data as Row[])
      .map((row) =>
        toEntry({
          slug: row.slug,
          name: row.name,
          address: row.address,
          currency: row.currency,
          ordering: row.ordering_enabled,
          brand: (row.organizations as { name?: string } | null)?.name,
          hours: (row.service_settings as Record<string, unknown> | null)?.openingHours ?? null,
        }),
      )
      .filter((entry): entry is DirectoryEntry => entry !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}
