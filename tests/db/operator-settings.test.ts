import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { describe, expect, it } from "vitest";

/**
 * The operator settings layer: the settings a merchant can now change, the
 * tables a reservation is booked against, and the read models derived from the
 * orders the location actually took.
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
    "insert into organizations(name,legal_country,default_locale) values ('Settings tenant','ZA','en') returning id",
  );
  const organizationId = organization.rows[0].id;
  const location = await db.query<{ id: string }>(
    "insert into locations(organization_id,name,address,timezone,currency) values ($1,'Main','1 Loop Street','Africa/Johannesburg','ZAR') returning id",
    [organizationId],
  );
  const locationId = location.rows[0].id;
  const actor = uuid(31);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  await db.query("insert into memberships(organization_id,user_id,role) values ($1,$2,$3)", [organizationId, actor, role]);
  return { organizationId, locationId, actor };
}

async function seedMenu(db: PGlite, organizationId: string, locationId: string, actor: string) {
  await callJson(db, "select app_publish_menu($1,$2,$3::jsonb,$4) as result", [
    organizationId,
    locationId,
    JSON.stringify([{ category: "Mains", item: "Bunny chow", amountMinor: "9500", currency: "ZAR", available: true }]),
    actor,
  ]);
  const item = await db.query<{ id: string }>(
    "select id from menu_items where location_id=$1 and name='Bunny chow'",
    [locationId],
  );
  return item.rows[0].id;
}

type Settings = {
  orderingEnabled: boolean;
  serviceSettings: Record<string, unknown>;
  tableCount: number;
  seatCount: number;
};

describe("operator settings", () => {
  it("saves the ordering settings the storefront reads", async () => {
    const db = await freshDatabase();
    try {
      const { locationId, actor } = await seedTenant(db);
      const saved = await callJson<Settings>(
        db,
        "select app_update_location_settings($1,$2,true,$3::jsonb) as result",
        [locationId, actor, JSON.stringify({
          openingHours: { "1": [["08:00", "16:00"]] },
          deliveryFeeMinor: "2500",
          minimumOrderMinor: "5000",
          taxBasisPoints: 1500,
          prepMinutes: 20,
          serviceArea: { postalCodes: ["8001", "8002"] },
        })],
      );

      expect(saved.orderingEnabled).toBe(true);
      expect(saved.serviceSettings.taxBasisPoints).toBe(1500);
      expect(saved.serviceSettings.deliveryFeeMinor).toBe("2500");

      // The values land on the same columns the order function reads.
      const row = await db.query<{ ordering_enabled: boolean; service_settings: Record<string, unknown> }>(
        "select ordering_enabled, service_settings from locations where id=$1",
        [locationId],
      );
      expect(row.rows[0].ordering_enabled).toBe(true);
      expect(row.rows[0].service_settings.minimumOrderMinor).toBe("5000");
    } finally {
      await db.close();
    }
  });

  it("refuses settings a merchant could not act on", async () => {
    const db = await freshDatabase();
    try {
      const { locationId, actor } = await seedTenant(db);
      await expect(callJson(db, "select app_update_location_settings($1,$2,true,$3::jsonb) as result", [
        locationId, actor, JSON.stringify({ openingHours: { "1": [["08:00", "25:00"]] } }),
      ])).rejects.toThrow(/INVALID_OPENING_HOURS/);

      await expect(callJson(db, "select app_update_location_settings($1,$2,true,$3::jsonb) as result", [
        locationId, actor, JSON.stringify({ deliveryFeeMinor: "-1" }),
      ])).rejects.toThrow(/INVALID_SETTINGS/);

      await expect(callJson(db, "select app_update_location_settings($1,$2,true,$3::jsonb) as result", [
        locationId, actor, JSON.stringify({ taxBasisPoints: 20000 }),
      ])).rejects.toThrow(/INVALID_SETTINGS/);
    } finally {
      await db.close();
    }
  });

  it("only a manager may change the settings", async () => {
    const db = await freshDatabase();
    try {
      const { locationId, actor } = await seedTenant(db, "server");
      await expect(callJson(db, "select app_update_location_settings($1,$2,true,'{}'::jsonb) as result", [
        locationId, actor,
      ])).rejects.toThrow(/FORBIDDEN/);
      // A member can still read the board they work from.
      const read = await callJson<Settings>(db, "select app_location_settings($1,$2) as result", [locationId, actor]);
      expect(read.orderingEnabled).toBe(false);
    } finally {
      await db.close();
    }
  });

  it("unblocks public ordering, which was refused before the settings existed", async () => {
    const db = await freshDatabase();
    try {
      const { organizationId, locationId, actor } = await seedTenant(db);
      const menuItemId = await seedMenu(db, organizationId, locationId, actor);
      const items = JSON.stringify([{ menuItemId, quantity: 1 }]);

      await expect(callJson(db, "select app_create_order($1,'pickup','en',$2::jsonb) as result", [
        locationId, items,
      ])).rejects.toThrow(/ORDERING_NOT_ENABLED/);

      await callJson(db, "select app_update_location_settings($1,$2,true,$3::jsonb) as result", [
        locationId, actor, JSON.stringify({ taxBasisPoints: 1500 }),
      ]);

      const order = await callJson<{ orderId: string; totalMinor: string; taxMinor: string }>(
        db,
        "select app_create_order($1,'pickup','en',$2::jsonb) as result",
        [locationId, items],
      );
      expect(order.totalMinor).toBe("10925");
      expect(order.taxMinor).toBe("1425");
    } finally {
      await db.close();
    }
  });
});

describe("tables and reservations", () => {
  it("creates, renames and removes a table", async () => {
    const db = await freshDatabase();
    try {
      const { locationId, actor } = await seedTenant(db);
      const created = await callJson<{ tableId: string }>(
        db, "select app_upsert_table($1,$2,null,'T1',4) as result", [locationId, actor],
      );
      await callJson(db, "select app_upsert_table($1,$2,$3,'T1a',6) as result", [locationId, actor, created.tableId]);

      const listed = await callJson<{ name: string; capacity: number }[]>(
        db, "select app_list_tables($1,$2) as result", [locationId, actor],
      );
      expect(listed).toEqual([expect.objectContaining({ name: "T1a", capacity: 6 })]);

      await expect(callJson(db, "select app_upsert_table($1,$2,null,'T1a',2) as result", [
        locationId, actor,
      ])).rejects.toThrow(/TABLE_NAME_TAKEN/);

      await callJson(db, "select app_delete_table($1,$2,$3) as result", [locationId, actor, created.tableId]);
      expect(await callJson(db, "select app_list_tables($1,$2) as result", [locationId, actor])).toEqual([]);
    } finally {
      await db.close();
    }
  });

  it("turns a drawn floor plan into bookable tables", async () => {
    const db = await freshDatabase();
    try {
      const { organizationId, locationId, actor } = await seedTenant(db);
      const draft = JSON.stringify({
        version: 1, width: 8, depth: 10,
        tables: [
          { id: uuid(41), name: "T1", x: 2, z: 2, width: 1.2, depth: 1.2, rotationRadians: 0, capacity: 4, state: "available" },
          { id: uuid(42), name: "T2", x: 5, z: 2, width: 1.2, depth: 1.2, rotationRadians: 0, capacity: 2, state: "available" },
        ],
      });
      await callJson(db, "select app_save_floor($1,$2,1,$3::jsonb,$4) as result", [
        organizationId, locationId, draft, actor,
      ]);

      const synced = await callJson<{ tables: number }>(
        db, "select app_sync_tables_from_floor($1,$2) as result", [locationId, actor],
      );
      expect(synced.tables).toBe(2);

      const plan = await callJson<{ version: number; document: { tables: unknown[] } }>(
        db, "select app_floor_plan($1,$2) as result", [locationId, actor],
      );
      expect(plan.version).toBe(1);
      expect(plan.document.tables).toHaveLength(2);

      // Removing a table from the plan removes it from the booking book.
      const smaller = JSON.stringify({
        version: 2, width: 8, depth: 10,
        tables: [{ id: uuid(41), name: "T1", x: 2, z: 2, width: 1.2, depth: 1.2, rotationRadians: 0, capacity: 4, state: "available" }],
      });
      await callJson(db, "select app_save_floor($1,$2,1,$3::jsonb,$4) as result", [
        organizationId, locationId, smaller, actor,
      ]);
      const resynced = await callJson<{ tables: number; removed: number }>(
        db, "select app_sync_tables_from_floor($1,$2) as result", [locationId, actor],
      );
      expect(resynced.tables).toBe(1);
      expect(resynced.removed).toBe(1);
    } finally {
      await db.close();
    }
  });

  it("accepts a booking once a table exists, and refuses to delete a booked table", async () => {
    const db = await freshDatabase();
    try {
      const { locationId, actor } = await seedTenant(db);

      await expect(callJson(db, "select app_create_reservation($1,$2::timestamptz,$3::timestamptz,2,'Grace',null,$4) as result", [
        locationId, "2026-12-01T18:00:00Z", "2026-12-01T19:30:00Z", actor,
      ])).rejects.toThrow(/RESERVATION_CAPACITY_UNKNOWN/);

      const table = await callJson<{ tableId: string }>(
        db, "select app_upsert_table($1,$2,null,'T1',4) as result", [locationId, actor],
      );

      const booking = await callJson<{ reservationId: string }>(
        db,
        "select app_create_reservation($1,$2::timestamptz,$3::timestamptz,2,'Grace',null,$4,$5) as result",
        [locationId, "2026-12-01T18:00:00Z", "2026-12-01T19:30:00Z", actor, table.tableId],
      );
      expect(booking.reservationId).toBeTruthy();

      await expect(callJson(db, "select app_delete_table($1,$2,$3) as result", [
        locationId, actor, table.tableId,
      ])).rejects.toThrow(/TABLE_HAS_BOOKINGS/);
    } finally {
      await db.close();
    }
  });
});

describe("read models", () => {
  it("derives the customer book and a receipt from the orders taken", async () => {
    const db = await freshDatabase();
    try {
      const { organizationId, locationId, actor } = await seedTenant(db);
      const table = await callJson<{ tableId: string }>(
        db, "select app_upsert_table($1,$2,null,'T1',4) as result", [locationId, actor],
      );
      const menuItemId = await seedMenu(db, organizationId, locationId, actor);

      const first = await callJson<{ orderId: string }>(
        db, "select app_create_staff_order($1,'dine_in','en',$2::jsonb,$3,'counter',$4,'Ada') as result",
        [locationId, JSON.stringify([{ menuItemId, quantity: 2 }]), actor, table.tableId],
      );
      await callJson(
        db, "select app_create_staff_order($1,'dine_in','en',$2::jsonb,$3,'cash',$4,'Ada') as result",
        [locationId, JSON.stringify([{ menuItemId, quantity: 1 }]), actor, table.tableId],
      );

      const book = await callJson<{ name: string; orders: number; spendMinor: string }[]>(
        db, "select app_customer_book($1,$2,50) as result", [locationId, actor],
      );
      expect(book).toHaveLength(1);
      expect(book[0]).toMatchObject({ name: "Ada", orders: 2, spendMinor: "28500" });

      const receipt = await callJson<{
        currency: string; subtotalMinor: string; totalMinor: string;
        lines: { name: string; quantity: number }[]; taxBasisPoints: number;
      }>(db, "select app_order_receipt($1,$2) as result", [first.orderId, actor]);
      expect(receipt.currency).toBe("ZAR");
      expect(receipt.subtotalMinor).toBe("19000");
      expect(receipt.totalMinor).toBe("19000");
      expect(receipt.lines).toEqual([{ name: "Bunny chow", quantity: 2, unitPriceMinor: "9500", lineTotalMinor: "19000" }]);
      expect(receipt.taxBasisPoints).toBe(0);

      // A guest who only booked still appears: the book is who the venue serves.
      await callJson(
        db,
        "select app_create_reservation($1,$2::timestamptz,$3::timestamptz,2,'Nomsa',null,$4,$5) as result",
        [locationId, "2026-12-02T18:00:00Z", "2026-12-02T19:30:00Z", actor, table.tableId],
      );
      const booked = await callJson<{ name: string; orders: number; spendMinor: string }[]>(
        db, "select app_customer_book($1,$2,50) as result", [locationId, actor],
      );
      expect(booked.map((guest) => guest.name)).toEqual(["Ada", "Nomsa"]);
      expect(booked[1]).toMatchObject({ name: "Nomsa", orders: 0, spendMinor: "0" });
    } finally {
      await db.close();
    }
  });
});
