import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const db = new PGlite({ extensions: { pgcrypto } });

beforeAll(async () => {
  const migration = await readFile(new URL("../../supabase/migrations/202611190001_core.sql", import.meta.url), "utf8");
  await db.exec(migration);
});
afterAll(async () => { await db.close(); });

describe("PostgreSQL core migration", () => {
  it("starts empty and creates the required operational tables", async () => {
    const result = await db.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'");
    const names = result.rows.map((row) => row.table_name);
    expect(names).toEqual(expect.arrayContaining(["organizations", "locations", "orders", "payment_attempts", "payment_events", "kitchen_tickets", "floor_plans", "stock_movements", "jobs", "outbox_events"]));
    expect((await db.query<{ count: number }>("select count(*)::int as count from organizations")).rows[0].count).toBe(0);
    expect((await db.query<{ count: number }>("select count(*)::int as count from orders")).rows[0].count).toBe(0);
  });
  it("enforces one kitchen ticket per order and positive payment attempts", async () => {
    const org = await db.query<{ id: string }>("insert into organizations(name,legal_country,default_locale) values ('Test isolated tenant','GB','en') returning id");
    const location = await db.query<{ id: string }>("insert into locations(organization_id,address,timezone,currency) values ($1,'Test address','UTC','GBP') returning id", [org.rows[0].id]);
    const order = await db.query<{ id: string }>("insert into orders(organization_id,location_id,tracking_token,service_type,customer_locale,currency,subtotal_minor,total_minor) values ($1,$2,'isolated-test-token','pickup','en','GBP',100,100) returning id", [org.rows[0].id, location.rows[0].id]);
    await db.query("insert into kitchen_tickets(organization_id,location_id,order_id) values ($1,$2,$3)", [org.rows[0].id, location.rows[0].id, order.rows[0].id]);
    await expect(db.query("insert into kitchen_tickets(organization_id,location_id,order_id) values ($1,$2,$3)", [org.rows[0].id, location.rows[0].id, order.rows[0].id])).rejects.toThrow();
  });
  it("keeps security and atomic payment workflows in migrations", async () => {
    const security = await readFile(new URL("../../supabase/migrations/202611190002_security.sql", import.meta.url), "utf8");
    const workflows = await readFile(new URL("../../supabase/migrations/202611190003_workflows.sql", import.meta.url), "utf8");
    expect(security).toContain("enable row level security");
    expect(security).toContain("revoke all on payment_events, outbox_events, jobs from anon, authenticated");
    expect(workflows).toContain("on conflict(order_id) do nothing");
    expect(workflows).toContain("for update");
    expect(workflows).toContain("app_apply_verified_payment");
  });
});
