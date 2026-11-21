import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { describe, expect, it } from "vitest";

/**
 * Kitchen routing, recipe depletion and day-end reporting against the real
 * schema. Each test runs in its own database so tenant state cannot leak
 * between cases.
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
    "insert into organizations(name,legal_country,default_locale) values ('Kitchen tenant','ZA','en') returning id",
  );
  const organizationId = organization.rows[0].id;
  const location = await db.query<{ id: string }>(
    "insert into locations(organization_id,name,address,timezone,currency,ordering_enabled,service_settings) values ($1,'Main','1 Loop Street','Africa/Johannesburg','ZAR',true,'{\"taxBasisPoints\":1500}'::jsonb) returning id",
    [organizationId],
  );
  const locationId = location.rows[0].id;
  const actor = uuid(21);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  await db.query("insert into memberships(organization_id,user_id,role) values ($1,$2,$3)", [organizationId, actor, role]);
  return { organizationId, locationId, actor };
}

async function seedItem(db: PGlite, organizationId: string, locationId: string, name: string, amountMinor = 1000) {
  const existing = await db.query<{ id: string }>(
    "select id from catalog_categories where location_id=$1 and name='Mains'",
    [locationId],
  );
  const categoryId = existing.rows.length > 0
    ? existing.rows[0].id
    : (await db.query<{ id: string }>(
        "insert into catalog_categories(organization_id,location_id,name) values ($1,$2,'Mains') returning id",
        [organizationId, locationId],
      )).rows[0].id;
  const item = await db.query<{ id: string }>(
    "insert into menu_items(organization_id,location_id,category_id,name,available) values ($1,$2,$3,$4,true) returning id",
    [organizationId, locationId, categoryId, name],
  );
  const priceBook = await db.query<{ id: string }>(
    "insert into price_books(organization_id,location_id,currency,status,published_at) values ($1,$2,'ZAR','published',now()) returning id",
    [organizationId, locationId],
  );
  await db.query(
    "insert into item_prices(price_book_id,menu_item_id,amount_minor) values ($1,$2,$3)",
    [priceBook.rows[0].id, item.rows[0].id, amountMinor],
  );
  return { menuItemId: item.rows[0].id };
}

type StaffOrder = {
  orderId: string; ticketId: string; ticketNumber: number;
  totalMinor: string; paymentStatus: string;
};

describe("kitchen routing", () => {
  it("records the table, the guest and the ticket number on a counter order", async () => {
    const db = await freshDatabase();
    try {
      const { organizationId, locationId, actor } = await seedTenant(db, "server");
      const { menuItemId } = await seedItem(db, organizationId, locationId, "Bunny chow");
      const table = await db.query<{ id: string }>(
        "insert into restaurant_tables(organization_id,location_id,name,capacity) values ($1,$2,'T9',4) returning id",
        [organizationId, locationId],
      );

      const order = await callJson<StaffOrder>(db,
        "select app_create_staff_order($1,'dine_in','en',$2::jsonb,$3,'counter',$4,'Ada') as result",
        [locationId, JSON.stringify([{ menuItemId, quantity: 1 }]), actor, table.rows[0].id]);
      expect(order.ticketNumber).toBe(1);

      const stored = await db.query<{ table_id: string; customer_name: string; service_type: string }>(
        "select table_id, customer_name, service_type from orders where id=$1",
        [order.orderId],
      );
      expect(stored.rows[0].table_id).toBe(table.rows[0].id);
      expect(stored.rows[0].customer_name).toBe("Ada");
      expect(stored.rows[0].service_type).toBe("dine_in");

      // The second order at the same location takes the next number.
      const next = await callJson<StaffOrder>(db,
        "select app_create_staff_order($1,'walk_in','en',$2::jsonb,$3,'cash') as result",
        [locationId, JSON.stringify([{ menuItemId, quantity: 1 }]), actor]);
      expect(next.ticketNumber).toBe(2);
    } finally { await db.close(); }
  });

  it("routes each ticket line to the station its menu item is prepared at", async () => {
    const db = await freshDatabase();
    try {
      const { organizationId, locationId, actor } = await seedTenant(db, "kitchen");
      const { menuItemId } = await seedItem(db, organizationId, locationId, "Bunny chow");
      await db.query("update menu_items set prep_station='grill' where id=$1", [menuItemId]);

      const order = await callJson<StaffOrder>(db,
        "select app_create_staff_order($1,'walk_in','en',$2::jsonb,$3,'cash') as result",
        [locationId, JSON.stringify([{ menuItemId, quantity: 1 }]), actor]);

      const items = await db.query<{ station: string; status: string; name_snapshot: string }>(
        "select kti.station, kti.status, oi.name_snapshot from kitchen_ticket_items kti join order_items oi on oi.id=kti.order_item_id where kti.ticket_id=$1",
        [order.ticketId],
      );
      expect(items.rows[0].station).toBe("grill");
      expect(items.rows[0].status).toBe("new");
      expect(items.rows[0].name_snapshot).toBe("Bunny chow");

      const board = await callJson<{ stations: Record<string, { station: string; tickets: unknown[] }> }>(db,
        "select app_kitchen_board($1,$2) as result", [locationId, actor]);
      expect(Object.keys(board.stations)).toContain("grill");
      const grill = board.stations.grill;
      expect(grill.tickets.length).toBe(1);
    } finally { await db.close(); }
  });

  it("bumps one line at a time and only serves the ticket when every line is served", async () => {
    const db = await freshDatabase();
    try {
      const { organizationId, locationId, actor } = await seedTenant(db, "kitchen");
      const first = await seedItem(db, organizationId, locationId, "Bunny chow");
      const second = await seedItem(db, organizationId, locationId, "Rooibos", 350);

      const order = await callJson<StaffOrder>(db,
        "select app_create_staff_order($1,'walk_in','en',$2::jsonb,$3,'cash') as result",
        [locationId, JSON.stringify([{ menuItemId: first.menuItemId, quantity: 1 }, { menuItemId: second.menuItemId, quantity: 1 }]), actor]);

      const lines = await db.query<{ id: string }>(
        "select id from kitchen_ticket_items where ticket_id=$1 order by id", [order.ticketId]);
      expect(lines.rows.length).toBe(2);

      const bumped = await callJson<{ status: string; ticketStatus: string }>(db,
        "select app_bump_ticket_item($1,'preparing',$2) as result", [lines.rows[0].id, actor]);
      expect(bumped.status).toBe("preparing");
      expect(bumped.ticketStatus).toBe("preparing");

      await db.query("select app_bump_ticket_item($1,'ready',$2)", [lines.rows[0].id, actor]);
      const partial = await callJson<{ ticketStatus: string }>(db,
        "select app_bump_ticket_item($1,'served',$2) as result", [lines.rows[0].id, actor]);
      expect(partial.ticketStatus).toBe("new");

      // The ticket is still live because one line is untouched.
      const ticket = await db.query<{ status: string }>("select status from kitchen_tickets where id=$1", [order.ticketId]);
      expect(ticket.rows[0].status).toBe("new");

      // An illegal transition is refused.
      await expect(
        db.query("select app_bump_ticket_item($1,'served',$2)", [lines.rows[1].id, actor]),
      ).rejects.toThrow(/INVALID_TICKET_TRANSITION/);
    } finally { await db.close(); }
  });

  it("holds a ticket and fires it later", async () => {
    const db = await freshDatabase();
    try {
      const { organizationId, locationId, actor } = await seedTenant(db, "kitchen");
      const { menuItemId } = await seedItem(db, organizationId, locationId, "Bunny chow");
      const order = await callJson<StaffOrder>(db,
        "select app_create_staff_order($1,'walk_in','en',$2::jsonb,$3,'cash') as result",
        [locationId, JSON.stringify([{ menuItemId, quantity: 1 }]), actor]);
      const line = await db.query<{ id: string }>("select id from kitchen_ticket_items where ticket_id=$1", [order.ticketId]);

      await db.query("select app_bump_ticket_item($1,'holding',$2)", [line.rows[0].id, actor]);
      const fired = await callJson<{ status: string }>(db,
        "select app_bump_ticket_item($1,'preparing',$2) as result", [line.rows[0].id, actor]);
      expect(fired.status).toBe("preparing");
    } finally { await db.close(); }
  });
});

describe("recipes and stock", () => {
  it("depletes stock exactly once when a sold line is served", async () => {
    const db = await freshDatabase();
    try {
      const { organizationId, locationId, actor } = await seedTenant(db, "manager");
      const { menuItemId } = await seedItem(db, organizationId, locationId, "Bunny chow", 1000);
      const ingredient = await db.query<{ id: string }>(
        "insert into ingredients(organization_id,location_id,name,base_unit,reorder_level_milli_units,unit_cost_minor) values ($1,$2,'Bread','g',500,10) returning id",
        [organizationId, locationId],
      );
      await callJson(db,
        "select app_set_recipe_item($1,$2,$3,200000,10,$4) as result",
        [locationId, menuItemId, ingredient.rows[0].id, actor]);

      // 200 g of bread per burger, 10% waste, one burger sold.
      await callJson(db,
        "select app_record_stock_receipt($1,$2,500000,'receipt-1',$3) as result",
        [locationId, ingredient.rows[0].id, actor]);

      const order = await callJson<StaffOrder>(db,
        "select app_create_staff_order($1,'walk_in','en',$2::jsonb,$3,'cash') as result",
        [locationId, JSON.stringify([{ menuItemId, quantity: 1 }]), actor]);
      const line = await db.query<{ id: string }>("select id from kitchen_ticket_items where ticket_id=$1", [order.ticketId]);

      await db.query("select app_bump_ticket_item($1,'preparing',$2)", [line.rows[0].id, actor]);
      await db.query("select app_bump_ticket_item($1,'ready',$2)", [line.rows[0].id, actor]);
      const served = await callJson<{ stock: { depleted: boolean } }>(db,
        "select app_bump_ticket_item($1,'served',$2) as result", [line.rows[0].id, actor]);
      expect(served.stock.depleted).toBe(true);

      const movements = await db.query<{ quantity_milli_units: number; kind: string }>(
        "select quantity_milli_units, kind from stock_movements where ingredient_id=$1 order by created_at",
        [ingredient.rows[0].id],
      );
      expect(movements.rows.length).toBe(2);
      expect(movements.rows[0].quantity_milli_units).toBe(500000);
      // 200000 * 1 * 110 / 100 = 220000 milli units out.
      expect(movements.rows[1].quantity_milli_units).toBe(-220000);
      expect(movements.rows[1].kind).toBe("depletion");

      const position = await callJson<{
        onHandMilliUnits: string; lowStock: boolean; name: string;
      }[]>(db, "select app_inventory_position($1,$2) as result", [locationId, actor]);
      expect(position[0].onHandMilliUnits).toBe("280000");
      expect(position[0].lowStock).toBe(false);
    } finally { await db.close(); }
  });

  it("does not deplete the same line twice when it is served again", async () => {
    const db = await freshDatabase();
    try {
      const { organizationId, locationId, actor } = await seedTenant(db, "manager");
      const { menuItemId } = await seedItem(db, organizationId, locationId, "Bunny chow");
      const ingredient = await db.query<{ id: string }>(
        "insert into ingredients(organization_id,location_id,name,base_unit) values ($1,$2,'Bread','g') returning id",
        [organizationId, locationId],
      );
      await callJson(db, "select app_set_recipe_item($1,$2,$3,100000,0,$4) as result",
        [locationId, menuItemId, ingredient.rows[0].id, actor]);

      const order = await callJson<StaffOrder>(db,
        "select app_create_staff_order($1,'walk_in','en',$2::jsonb,$3,'cash') as result",
        [locationId, JSON.stringify([{ menuItemId, quantity: 1 }]), actor]);
      const line = await db.query<{ id: string }>("select id from kitchen_ticket_items where ticket_id=$1", [order.ticketId]);
      await db.query("select app_bump_ticket_item($1,'preparing',$2)", [line.rows[0].id, actor]);
      await db.query("select app_bump_ticket_item($1,'ready',$2)", [line.rows[0].id, actor]);
      await db.query("select app_bump_ticket_item($1,'served',$2)", [line.rows[0].id, actor]);

      // A repeated depletion call writes nothing new.
      await callJson(db, "select app_deplete_stock_for_order_item((select order_item_id from kitchen_ticket_items where id=$1),$2) as result",
        [line.rows[0].id, actor]);

      const movements = await db.query<{ count: number }>(
        "select count(*)::int as count from stock_movements where kind='depletion'",
      );
      expect(movements.rows[0].count).toBe(1);
    } finally { await db.close(); }
  });

  it("scopes a delivery note to one location", async () => {
    const db = await freshDatabase();
    try {
      const first = await seedTenant(db, "manager");
      const second = await db.query<{ id: string }>(
        "insert into organizations(name,legal_country,default_locale) values ('Second tenant','ZA','en') returning id",
      );
      const secondLocation = await db.query<{ id: string }>(
        "insert into locations(organization_id,name,address,timezone,currency,ordering_enabled,service_settings) values ($1,'Second','2 Loop Street','Africa/Johannesburg','ZAR',true,'{}'::jsonb) returning id",
        [second.rows[0].id],
      );
      const secondActor = uuid(55);
      await db.query("insert into memberships(organization_id,user_id,role) values ($1,$2,'manager')", [second.rows[0].id, secondActor]);

      await db.query("insert into ingredients(organization_id,location_id,name,base_unit) values ($1,$2,'Flour','g')", [first.organizationId, first.locationId]);

      // The same delivery note number at two different locations.
      await callJson(db, "select app_record_stock_receipt($1,(select id from ingredients where location_id=$1 limit 1),1000,'delivery-42',$2) as result",
        [first.locationId, first.actor]);
      await db.query("insert into ingredients(organization_id,location_id,name,base_unit) values ($1,$2,'Flour','g')", [second.rows[0].id, secondLocation.rows[0].id]);

      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [secondActor]);
      await callJson(db, "select app_record_stock_receipt($1,(select id from ingredients where location_id=$1 limit 1),2000,'delivery-42',$2) as result",
        [secondLocation.rows[0].id, secondActor]);

      const receipts = await db.query<{ count: number }>(
        "select count(*)::int as count from stock_movements where kind='receipt'",
      );
      expect(receipts.rows[0].count).toBe(2);
    } finally { await db.close(); }
  });

  it("records a receipt once even when the same device sends it twice", async () => {
    const db = await freshDatabase();
    try {
      const { locationId, actor } = await seedTenant(db, "manager");
      const ingredient = await db.query<{ id: string }>(
        "insert into ingredients(organization_id,location_id,name,base_unit) select organization_id,id,'Flour','g' from locations where id=$1 returning id",
        [locationId],
      );
      await callJson(db, "select app_record_stock_receipt($1,$2,1000,'delivery-42',$3) as result",
        [locationId, ingredient.rows[0].id, actor]);
      await callJson(db, "select app_record_stock_receipt($1,$2,1000,'delivery-42',$3) as result",
        [locationId, ingredient.rows[0].id, actor]);

      const movements = await db.query<{ count: number; total: number }>(
        "select count(*)::int as count, sum(quantity_milli_units)::int as total from stock_movements where kind='receipt'",
      );
      expect(movements.rows[0].count).toBe(1);
      expect(movements.rows[0].total).toBe(1000);
    } finally { await db.close(); }
  });
});

describe("day end report", () => {
  it("reports the day from the orders themselves", async () => {
    const db = await freshDatabase();
    try {
      const { organizationId, locationId, actor } = await seedTenant(db, "manager");
      const { menuItemId } = await seedItem(db, organizationId, locationId, "Bunny chow", 1000);

      await callJson(db, "select app_create_staff_order($1,'dine_in','en',$2::jsonb,$3,'cash') as result",
        [locationId, JSON.stringify([{ menuItemId, quantity: 2 }]), actor]);
      await callJson(db, "select app_create_staff_order($1,'pickup','en',$2::jsonb,$3,'cash') as result",
        [locationId, JSON.stringify([{ menuItemId, quantity: 1 }]), actor]);

      const report = await callJson<{
        currency: string;
        totals: { orderCount: number; grossSubtotalMinor: string; taxMinor: string; netTotalMinor: string };
        channels: { channel: string; orderCount: number }[];
        serviceTypes: { serviceType: string; orderCount: number }[];
        exceptions: { discountOrderCount: number; cancelledOrderCount: number };
      }>(db, "select app_day_end_report($1, now() - interval '1 day', now() + interval '1 day', $2) as result",
        [locationId, actor]);

      expect(report.currency).toBe("ZAR");
      expect(report.totals.orderCount).toBe(2);
      expect(report.totals.grossSubtotalMinor).toBe("3000");
      // 15% tax on 3000 rounds to 450.
      expect(report.totals.taxMinor).toBe("450");
      expect(report.totals.netTotalMinor).toBe("3450");
      expect(report.channels.find((c) => c.channel === "pos")?.orderCount).toBe(2);
      expect(report.serviceTypes.length).toBe(2);
      expect(report.exceptions.discountOrderCount).toBe(0);
    } finally { await db.close(); }
  });

  it("counts a cancelled order as an exception rather than as sales", async () => {
    const db = await freshDatabase();
    try {
      const { organizationId, locationId, actor } = await seedTenant(db, "manager");
      const { menuItemId } = await seedItem(db, organizationId, locationId, "Bunny chow", 1000);
      const order = await callJson<StaffOrder>(db,
        "select app_create_staff_order($1,'walk_in','en',$2::jsonb,$3,'cash') as result",
        [locationId, JSON.stringify([{ menuItemId, quantity: 1 }]), actor]);
      await db.query("update orders set fulfillment_status='cancelled' where id=$1", [order.orderId]);

      const report = await callJson<{
        totals: { orderCount: number; cancelledCount: number; cancelledMinor: string };
        exceptions: { cancelledOrderCount: number };
      }>(db, "select app_day_end_report($1, now() - interval '1 day', now() + interval '1 day', $2) as result",
        [locationId, actor]);
      expect(report.totals.orderCount).toBe(1);
      expect(report.totals.cancelledCount).toBe("1");
      expect(report.totals.cancelledMinor).toBe("1150");
      expect(report.exceptions.cancelledOrderCount).toBe(1);
    } finally { await db.close(); }
  });
});

describe("tenant isolation", () => {
  it("refuses a kitchen board for a member of another organisation", async () => {
    const db = await freshDatabase();
    try {
      const { locationId } = await seedTenant(db, "manager");
      const other = uuid(77);
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
      await expect(
        db.query("select app_kitchen_board($1,$2) as result", [locationId, other]),
      ).rejects.toThrow(/FORBIDDEN/);
    } finally { await db.close(); }
  });

  it("refuses a recipe from another organisation's actor", async () => {
    const db = await freshDatabase();
    try {
      const { organizationId, locationId, actor } = await seedTenant(db, "manager");
      const { menuItemId } = await seedItem(db, organizationId, locationId, "Bunny chow");
      const ingredient = await db.query<{ id: string }>(
        "insert into ingredients(organization_id,location_id,name,base_unit) values ($1,$2,'Flour','g') returning id",
        [organizationId, locationId],
      );
      const other = uuid(78);
      await expect(
        db.query("select app_set_recipe_item($1,$2,$3,1000,0,$4)", [locationId, menuItemId, ingredient.rows[0].id, other]),
      ).rejects.toThrow(/FORBIDDEN/);
      expect(actor).toBeTruthy();
    } finally { await db.close(); }
  });
});
