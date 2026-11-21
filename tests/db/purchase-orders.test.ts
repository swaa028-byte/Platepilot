import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { describe, expect, it } from "vitest";

/**
 * Purchase orders: what a restaurant orders from a supplier, and the moment that
 * order turns into stock.
 */
async function freshDatabase() {
  const db = new PGlite({ extensions: { pgcrypto } });
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

function uuid(seed: number) {
  return `00000000-0000-4000-8000-${String(seed).padStart(12, "0")}`;
}

async function callJson<T>(db: PGlite, sql: string, params: unknown[] = []) {
  const result = await db.query<{ result: T }>(sql, params);
  return result.rows[0]?.result as T;
}

async function seedTenant(db: PGlite, role = "manager") {
  const organization = await db.query<{ id: string }>(
    "insert into organizations(name,legal_country,default_locale) values ('Supply tenant','ZA','en') returning id",
  );
  const organizationId = organization.rows[0].id;
  const location = await db.query<{ id: string }>(
    "insert into locations(organization_id,name,address,timezone,currency) values ($1,'Main','1 Loop Street','Africa/Johannesburg','ZAR') returning id",
    [organizationId],
  );
  const locationId = location.rows[0].id;
  const actor = uuid(51);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  await db.query("insert into memberships(organization_id,user_id,role) values ($1,$2,$3)", [organizationId, actor, role]);
  return { organizationId, locationId, actor };
}

async function seedIngredient(db: PGlite, organizationId: string, locationId: string, name: string, unitCostMinor = 12) {
  const ingredient = await db.query<{ id: string }>(
    `insert into ingredients(organization_id, location_id, name, base_unit, reorder_level_milli_units, unit_cost_minor)
     values ($1,$2,$3,'g',500000,$4) returning id`,
    [organizationId, locationId, name, unitCostMinor],
  );
  return ingredient.rows[0].id;
}

type Order = {
  purchaseOrderId: string; supplier: string; status: string;
  totalMinor: string; quantityMilliUnits: string; receivedMilliUnits: string;
};

describe("purchase orders", () => {
  it("records what was ordered from a supplier", async () => {
    const db = await freshDatabase();
    try {
      const { organizationId, locationId, actor } = await seedTenant(db);
      const bread = await seedIngredient(db, organizationId, locationId, "Bread");
      const milk = await seedIngredient(db, organizationId, locationId, "Milk", 20);

      const created = await callJson<{ purchaseOrderId: string; totalMinor: string; currency: string }>(
        db,
        "select app_create_purchase_order($1,$2,'Cape Bakery',null,$3::jsonb) as result",
        [locationId, actor, JSON.stringify([
          { ingredientId: bread, quantityMilliUnits: "5000000", unitCostMinor: "12" },
          { ingredientId: milk, quantityMilliUnits: "1000000", unitCostMinor: "20" },
        ])],
      );
      // 5 000 units at 12 plus 1 000 at 20, all in minor units.
      expect(created.totalMinor).toBe("80000");
      expect(created.currency).toBe("ZAR");

      const book = await callJson<Order[]>(db, "select app_purchase_orders($1,$2,50) as result", [locationId, actor]);
      expect(book).toHaveLength(1);
      expect(book[0]).toMatchObject({ supplier: "Cape Bakery", status: "ordered", totalMinor: "80000" });
      expect(book[0].quantityMilliUnits).toBe("6000000");
    } finally {
      await db.close();
    }
  });

  it("turns a received order into stock, once", async () => {
    const db = await freshDatabase();
    try {
      const { organizationId, locationId, actor } = await seedTenant(db);
      const bread = await seedIngredient(db, organizationId, locationId, "Bread");
      const order = await callJson<{ purchaseOrderId: string }>(
        db,
        "select app_create_purchase_order($1,$2,'Cape Bakery','DN-42',$3::jsonb) as result",
        [locationId, actor, JSON.stringify([{ ingredientId: bread, quantityMilliUnits: "5000000", unitCostMinor: "12" }])],
      );

      const received = await callJson<{ movements: number; status: string; alreadyReceived: boolean }>(
        db, "select app_receive_purchase_order($1,$2) as result", [order.purchaseOrderId, actor],
      );
      expect(received).toMatchObject({ movements: 1, status: "received", alreadyReceived: false });

      const position = await callJson<{ ingredientId: string; onHandMilliUnits: string }[]>(
        db, "select app_inventory_position($1,$2) as result", [locationId, actor],
      );
      expect(position.find((row) => row.ingredientId === bread)?.onHandMilliUnits).toBe("5000000");

      // Receiving again — a retried click — must not double the stock.
      const again = await callJson<{ movements: number; alreadyReceived: boolean }>(
        db, "select app_receive_purchase_order($1,$2) as result", [order.purchaseOrderId, actor],
      );
      expect(again).toMatchObject({ movements: 0, alreadyReceived: true });

      const after = await callJson<{ ingredientId: string; onHandMilliUnits: string }[]>(
        db, "select app_inventory_position($1,$2) as result", [locationId, actor],
      );
      expect(after.find((row) => row.ingredientId === bread)?.onHandMilliUnits).toBe("5000000");

      await expect(callJson(db, "select app_cancel_purchase_order($1,$2) as result", [
        order.purchaseOrderId, actor,
      ])).rejects.toThrow(/PURCHASE_ORDER_ALREADY_RECEIVED/);
    } finally {
      await db.close();
    }
  });

  it("refuses an ingredient from another location, and a role that may not buy", async () => {
    const db = await freshDatabase();
    try {
      const { organizationId, locationId, actor } = await seedTenant(db);
      const other = await db.query<{ id: string }>(
        "insert into locations(organization_id,name,address,timezone,currency) values ($1,'Second','2 Loop Street','Africa/Johannesburg','ZAR') returning id",
        [organizationId],
      );
      const foreign = await seedIngredient(db, organizationId, other.rows[0].id, "Flour");

      await expect(callJson(db, "select app_create_purchase_order($1,$2,'Mill',null,$3::jsonb) as result", [
        locationId, actor, JSON.stringify([{ ingredientId: foreign, quantityMilliUnits: "1000", unitCostMinor: "5" }]),
      ])).rejects.toThrow(/INGREDIENT_NOT_FOUND/);

      const server = uuid(52);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [server]);
      await db.query("insert into memberships(organization_id,user_id,role) values ($1,$2,'server')", [organizationId, server]);
      await expect(callJson(db, "select app_create_purchase_order($1,$2,'Mill',null,$3::jsonb) as result", [
        locationId, server, JSON.stringify([{ ingredientId: foreign, quantityMilliUnits: "1000", unitCostMinor: "5" }]),
      ])).rejects.toThrow(/FORBIDDEN/);
    } finally {
      await db.close();
    }
  });
});