import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterEach, describe, expect, it } from "vitest";

/**
 * The marketplace layer: many vendors on one platform.
 *
 * These tests prove three things the platform operator depends on:
 *   - each order carries the platform's cut, computed by the database
 *   - a vendor cannot change its own commission rate
 *   - the cross-vendor revenue report is closed to everyone but the operator
 */
// Each case gets its own database. WASM instances are heavy, so the previous
// one is closed rather than left for the collector.
let openDb: PGlite | null = null;
afterEach(async () => {
  if (openDb) {
    await openDb.close();
    openDb = null;
  }
});

async function freshDatabase() {
  const db = new PGlite({ extensions: { pgcrypto } });
  openDb = db;
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema if not exists auth;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  `);
  const directory = new URL("../../supabase/migrations/", import.meta.url);
  const files = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  for (const file of files) {
    await db.exec(await readFile(new URL(file, directory), "utf8"));
  }
  return db;
}

const uuid = (seed: number) => `00000000-0000-4000-8000-${String(seed).padStart(12, "0")}`;

async function seedVendor(db: PGlite, name: string, actorSeed: number) {
  const organization = await db.query<{ id: string }>(
    "insert into organizations(name,legal_country,default_locale) values ($1,'CM','fr') returning id",
    [name],
  );
  const organizationId = organization.rows[0].id;
  const location = await db.query<{ id: string }>(
    "insert into locations(organization_id,name,address,timezone,currency,ordering_enabled) values ($1,'Main','Rue 1','Africa/Douala','XAF',true) returning id",
    [organizationId],
  );
  const actor = uuid(actorSeed);
  await db.query("insert into memberships(organization_id,user_id,role) values ($1,$2,'owner')", [organizationId, actor]);
  return { organizationId, locationId: location.rows[0].id, actor };
}

async function placeOrder(db: PGlite, locationId: string, totalMinor: number, status = "received", payment = "paid") {
  const order = await db.query<{ id: string; platform_fee_minor: string }>(
    `insert into orders(organization_id, location_id, tracking_token, service_type, customer_locale, currency,
                        subtotal_minor, discount_minor, tax_minor, tip_minor, total_minor, fulfillment_status, payment_status)
     select organization_id, id, $2, 'pickup', 'fr', 'XAF', $1, 0, 0, 0, $1, $3, $5
       from locations where id = $4
     returning id, platform_fee_minor`,
    [totalMinor, `tok-${Math.random().toString(36).slice(2)}`, status, locationId, payment],
  );
  return order.rows[0];
}

describe("multivendor platform", () => {
  it("records the platform fee on every order at the vendor's rate", async () => {
    const db = await freshDatabase();
    const vendor = await seedVendor(db, "Chez Alice", 41);
    await db.query("insert into platform_admins(user_id) values ($1)", [uuid(90)]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uuid(90)]);
    await db.query("select app_set_commission($1, 250)", [vendor.organizationId]);

    // 10,000 minor units at 2.5% = 250.
    const order = await placeOrder(db, vendor.locationId, 10000);
    expect(Number(order.platform_fee_minor)).toBe(250);
  });

  it("charges nothing when the vendor has no commission", async () => {
    const db = await freshDatabase();
    const vendor = await seedVendor(db, "Zero Fee Cafe", 42);
    const order = await placeOrder(db, vendor.locationId, 7500);
    expect(Number(order.platform_fee_minor)).toBe(0);
  });

  it("zeroes the fee when an order is cancelled", async () => {
    const db = await freshDatabase();
    const vendor = await seedVendor(db, "Cancelling Kitchen", 43);
    await db.query("insert into platform_admins(user_id) values ($1)", [uuid(91)]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uuid(91)]);
    await db.query("select app_set_commission($1, 500)", [vendor.organizationId]);

    const order = await placeOrder(db, vendor.locationId, 8000);
    expect(Number(order.platform_fee_minor)).toBe(400);
    const cancelled = await db.query<{ platform_fee_minor: string }>(
      "update orders set fulfillment_status='cancelled' where id=$1 returning platform_fee_minor",
      [order.id],
    );
    expect(Number(cancelled.rows[0].platform_fee_minor)).toBe(0);
  });

  it("refuses to let a vendor set its own commission", async () => {
    const db = await freshDatabase();
    const vendor = await seedVendor(db, "Sneaky Vendor", 44);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [vendor.actor]);
    await expect(db.query("select app_set_commission($1, 0)", [vendor.organizationId])).rejects.toThrow(/FORBIDDEN/);
    // The column is not writable by an authenticated vendor either.
    await expect(
      db.query("select has_column_privilege('authenticated','organizations','commission_bps','UPDATE') as allowed"),
    ).resolves.toMatchObject({ rows: [{ allowed: false }] });
  });

  it("reports revenue across vendors, but only to the platform operator", async () => {
    const db = await freshDatabase();
    const alice = await seedVendor(db, "Chez Alice", 45);
    const bob = await seedVendor(db, "Bob's Grill", 46);
    const operator = uuid(92);
    await db.query("insert into platform_admins(user_id) values ($1)", [operator]);

    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [operator]);
    await db.query("select app_set_commission($1, 300)", [alice.organizationId]);
    await db.query("select app_set_commission($1, 100)", [bob.organizationId]);

    await placeOrder(db, alice.locationId, 20000);
    await placeOrder(db, alice.locationId, 10000);
    await placeOrder(db, bob.locationId, 50000);

    const report = await db.query<{ result: { vendors: { organization_name: string; gmv_minor: number; platform_fee_minor: number }[]; totals: { gmvMinor: number; platformFeeMinor: number } } }>(
      "select app_platform_revenue(now() - interval '1 day', now() + interval '1 day') as result",
    );
    const data = report.rows[0].result;
    expect(data.vendors).toHaveLength(2);
    // 80,000 total GMV: 30,000 at 3% + 50,000 at 1% = 900 + 500.
    expect(Number(data.totals.gmvMinor)).toBe(80000);
    expect(Number(data.totals.platformFeeMinor)).toBe(1400);

    // A vendor asking for the report is refused.
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [bob.actor]);
    await expect(
      db.query("select app_platform_revenue(now() - interval '1 day', now()) as result"),
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it("produces a settlement statement per vendor for a single collecting account", async () => {
    const db = await freshDatabase();
    const vendor = await seedVendor(db, "La Divine Eden", 47);
    const operator = uuid(93);
    await db.query("insert into platform_admins(user_id) values ($1)", [operator]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [operator]);
    await db.query("select app_set_commission($1, 200)", [vendor.organizationId]);

    // Two paid orders and one unpaid: only the paid money is payable.
    await db.query("update organizations set legal_country='CM' where id=$1", [vendor.organizationId]);
    await placeOrder(db, vendor.locationId, 20000);
    await placeOrder(db, vendor.locationId, 10000);
    await placeOrder(db, vendor.locationId, 5000, "received", "unpaid");

    const statement = await db.query<{ result: {
      status: string;
      vendors: { organization_name: string; collected_minor: number; platform_fee_minor: number; netPayableMinor: number }[];
      totals: { collectedMinor: number; platformFeeMinor: number; netPayableMinor: number };
    } }>("select app_vendor_settlement(now() - interval '1 day', now() + interval '1 day') as result");

    const data = statement.rows[0].result;
    expect(data.status).toBe("manual_settlement");
    expect(data.vendors[0].organization_name).toBe("La Divine Eden");
    // 30,000 collected at 2% = 600 to the platform, 29,400 payable to the vendor.
    expect(Number(data.totals.collectedMinor)).toBe(30000);
    expect(Number(data.totals.platformFeeMinor)).toBe(600);
    expect(Number(data.totals.netPayableMinor)).toBe(29400);
    expect(Number(data.vendors[0].netPayableMinor)).toBe(29400);
  });

  it("keeps the settlement statement closed to vendors", async () => {
    const db = await freshDatabase();
    const vendor = await seedVendor(db, "Nosy Vendor", 48);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [vendor.actor]);
    await expect(
      db.query("select app_vendor_settlement(now() - interval '1 day', now()) as result"),
    ).rejects.toThrow(/FORBIDDEN/);
  });
});
