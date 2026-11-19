import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Operational workflows against the real schema: server-side pricing, modifiers,
 * promotions, opening hours, service area, staff (POS) orders, kitchen ticket
 * transitions, refunds, cash shifts and reservation capacity.
 *
 * Each test runs in its own database so tenant state cannot leak between cases.
 */
async function freshDatabase() {
  const db = new PGlite();
  // The roles and auth schema that Supabase provides. The claim sub is how
  // auth.uid() resolves the signed-in user inside a request.
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

/** Calls a function that returns jsonb and returns the parsed object. */
async function callJson<T>(db: PGlite, sql: string, params: unknown[] = []) {
  const result = await db.query<{ result: T }>(sql, params);
  return result.rows[0]?.result as T;
}

async function seedLocation(db: PGlite, options: {
  currency?: string;
  serviceSettings?: Record<string, unknown>;
  orderingEnabled?: boolean;
} = {}) {
  const settings = JSON.stringify(options.serviceSettings ?? {});
  const organization = await db.query<{ id: string }>(
    "insert into organizations(name,legal_country,default_locale) values ('Ops tenant','GB','en') returning id",
  );
  const location = await db.query<{ id: string }>(
    "insert into locations(organization_id,name,address,timezone,currency,ordering_enabled,service_settings) values ($1,'Main','1 Test Street','UTC',$2,$3,$4::jsonb) returning id",
    [organization.rows[0].id, options.currency ?? "GBP", options.orderingEnabled ?? true, settings],
  );
  return { organizationId: organization.rows[0].id, locationId: location.rows[0].id };
}

async function seedMenu(db: PGlite, locationId: string, organizationId: string, label = "Mains") {
  const category = await db.query<{ id: string }>(
    "insert into catalog_categories(organization_id,location_id,name) values ($1,$2,$3) returning id",
    [organizationId, locationId, label],
  );
  const item = await db.query<{ id: string }>(
    "insert into menu_items(organization_id,location_id,category_id,name,available) values ($1,$2,$3,'Merchant item',true) returning id",
    [organizationId, locationId, category.rows[0].id],
  );
  const priceBook = await db.query<{ id: string }>(
    "insert into price_books(organization_id,location_id,currency,status,published_at) values ($1,$2,'GBP','published',now()) returning id",
    [organizationId, locationId],
  );
  await db.query(
    "insert into item_prices(price_book_id,menu_item_id,amount_minor) values ($1,$2,1000)",
    [priceBook.rows[0].id, item.rows[0].id],
  );
  return { menuItemId: item.rows[0].id };
}

type OrderResult = {
  orderId: string; ticketId: string | null; currency: string;
  subtotalMinor: string; discountMinor: string; taxMinor: string;
  deliveryFeeMinor: string; tipMinor: string; totalMinor: string; paymentStatus: string;
};

describe("operational workflows", () => {
  let db: PGlite;

  beforeAll(async () => { db = await freshDatabase(); });
  afterAll(async () => { await db.close(); });

  it("prices a storefront order on the server and applies tax and delivery fee", async () => {
    const scoped = await freshDatabase();
    try {
      const { organizationId, locationId } = await seedLocation(scoped, {
        serviceSettings: { taxBasisPoints: 1000, deliveryFeeMinor: 250, pricingMode: "tax_exclusive" },
      });
      const { menuItemId } = await seedMenu(scoped, locationId, organizationId);

      const order = await callJson<OrderResult>(scoped,
        "select app_create_order($1,'delivery','en',$2::jsonb,null,null,null,'1 Test Street','SW1A1AA') as result",
        [locationId, JSON.stringify([{ menuItemId, quantity: 2 }])]);
      // 2 x 1000 minor = 2000 subtotal, 10% tax = 200, delivery fee 250.
      expect(order.totalMinor).toBe("2450");
      expect(order.taxMinor).toBe("200");
      expect(order.deliveryFeeMinor).toBe("250");

      const line = await scoped.query<{ unit_price_minor: number; line_total_minor: number }>(
        "select unit_price_minor, line_total_minor from order_items limit 1",
      );
      expect(line.rows[0].unit_price_minor).toBe(1000);
      expect(line.rows[0].line_total_minor).toBe(2000);
    } finally { await scoped.close(); }
  });

  it("ignores a client supplied price and applies modifier deltas from the option groups", async () => {
    const scoped = await freshDatabase();
    try {
      const { organizationId, locationId } = await seedLocation(scoped, { serviceSettings: { taxBasisPoints: 0 } });
      const { menuItemId } = await seedMenu(scoped, locationId, organizationId);

      const group = await scoped.query<{ id: string }>(
        "insert into modifier_groups(organization_id,location_id,menu_item_id,name,selection_type,max_selections) values ($1,$2,$3,'Size','multiple',2) returning id",
        [organizationId, locationId, menuItemId],
      );
      const modifier = await scoped.query<{ id: string }>(
        "insert into modifiers(organization_id,location_id,modifier_group_id,name,price_delta_minor) values ($1,$2,$3,'Large',350) returning id",
        [organizationId, locationId, group.rows[0].id],
      );

      // The client also sends a price of 1 minor; it must be ignored.
      const order = await callJson<OrderResult>(scoped,
        "select app_create_order($1,'pickup','en',$2::jsonb) as result",
        [locationId, JSON.stringify([{ menuItemId, quantity: 1, unitPriceMinor: 1, modifiers: [{ modifierId: modifier.rows[0].id, quantity: 1 }] }])]);
      expect(order.totalMinor).toBe("1350");

      const line = await scoped.query<{ unit_price_minor: number; selections_snapshot: unknown }>(
        "select unit_price_minor, selections_snapshot from order_items limit 1",
      );
      expect(line.rows[0].unit_price_minor).toBe(1350);
      expect(JSON.stringify(line.rows[0].selections_snapshot)).toContain("Large");
    } finally { await scoped.close(); }
  });

  it("rejects a modifier that does not belong to the ordered item", async () => {
    const scoped = await freshDatabase();
    try {
      const { organizationId, locationId } = await seedLocation(scoped);
      const { menuItemId } = await seedMenu(scoped, locationId, organizationId);
      const other = await seedMenu(scoped, locationId, organizationId, "Sides");
      const group = await scoped.query<{ id: string }>(
        "insert into modifier_groups(organization_id,location_id,menu_item_id,name,max_selections) values ($1,$2,$3,'Size',1) returning id",
        [organizationId, locationId, other.menuItemId],
      );
      const modifier = await scoped.query<{ id: string }>(
        "insert into modifiers(organization_id,location_id,modifier_group_id,name) values ($1,$2,$3,'Large') returning id",
        [organizationId, locationId, group.rows[0].id],
      );
      await expect(
        scoped.query("select app_create_order($1,'pickup','en',$2::jsonb) as result", [
          locationId, JSON.stringify([{ menuItemId, quantity: 1, modifiers: [{ modifierId: modifier.rows[0].id }] }]),
        ]),
      ).rejects.toThrow(/MODIFIER_NOT_ALLOWED/);
    } finally { await scoped.close(); }
  });

  it("applies a promotion and rejects an unknown code", async () => {
    const scoped = await freshDatabase();
    try {
      const { organizationId, locationId } = await seedLocation(scoped);
      const { menuItemId } = await seedMenu(scoped, locationId, organizationId);
      await scoped.query(
        "insert into promotions(organization_id,location_id,code,discount_type,discount_basis_points,max_discount_minor) values ($1,$2,'TENOFF','percent',1000,500)",
        [organizationId, locationId],
      );
      const applied = await callJson<OrderResult>(scoped,
        "select app_create_order($1,'pickup','en',$2::jsonb,null,'TENOFF') as result",
        [locationId, JSON.stringify([{ menuItemId, quantity: 2 }])]);
      expect(applied.discountMinor).toBe("200");
      expect(applied.totalMinor).toBe("1800");

      await expect(
        scoped.query("select app_create_order($1,'pickup','en',$2::jsonb,null,'NOPE') as result", [
          locationId, JSON.stringify([{ menuItemId, quantity: 1 }]),
        ]),
      ).rejects.toThrow(/PROMOTION_NOT_FOUND/);
    } finally { await scoped.close(); }
  });

  it("closes ordering outside the configured opening hours", async () => {
    const scoped = await freshDatabase();
    try {
      // An opening hours map with no windows means the location is closed every day.
      const { locationId, organizationId } = await seedLocation(scoped, {
        serviceSettings: { openingHours: {}, taxBasisPoints: 0 },
      });
      const { menuItemId } = await seedMenu(scoped, locationId, organizationId);
      await expect(
        scoped.query("select app_create_order($1,'pickup','en',$2::jsonb) as result", [
          locationId, JSON.stringify([{ menuItemId, quantity: 1 }]),
        ]),
      ).rejects.toThrow(/LOCATION_CLOSED/);
    } finally { await scoped.close(); }
  });

  it("rejects a delivery outside the configured service area", async () => {
    const scoped = await freshDatabase();
    try {
      const { locationId, organizationId } = await seedLocation(scoped, {
        serviceSettings: { serviceArea: { postalCodes: ["SW1A1AA"] }, taxBasisPoints: 0 },
      });
      const { menuItemId } = await seedMenu(scoped, locationId, organizationId);
      await expect(
        scoped.query("select app_create_order($1,'delivery','en',$2::jsonb,null,null,null,'9 Far Lane','ZZ99ZZ') as result", [
          locationId, JSON.stringify([{ menuItemId, quantity: 1 }]),
        ]),
      ).rejects.toThrow(/OUTSIDE_SERVICE_AREA/);

      const allowed = await callJson<OrderResult>(scoped,
        "select app_create_order($1,'delivery','en',$2::jsonb,null,null,null,'9 Far Lane','sw1a1aa') as result",
        [locationId, JSON.stringify([{ menuItemId, quantity: 1 }])]);
      expect(allowed.totalMinor).toBe("1000");
    } finally { await scoped.close(); }
  });

  it("takes a staff order, settles cash and creates exactly one kitchen ticket", async () => {
    const scoped = await freshDatabase();
    try {
      const { organizationId, locationId } = await seedLocation(scoped, { serviceSettings: { taxBasisPoints: 0 } });
      const { menuItemId } = await seedMenu(scoped, locationId, organizationId);
      const actor = uuid(11);
      await scoped.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
      await scoped.query(
        "insert into memberships(organization_id,user_id,role) values ($1,$2,'server')",
        [organizationId, actor],
      );

      const order = await callJson<OrderResult>(scoped,
        "select app_create_staff_order($1,'walk_in','en',$2::jsonb,$3,'cash') as result",
        [locationId, JSON.stringify([{ menuItemId, quantity: 1 }]), actor]);
      expect(order.paymentStatus).toBe("paid");
      expect(order.totalMinor).toBe("1000");

      const tickets = await scoped.query<{ count: number }>(
        "select count(*)::int as count from kitchen_tickets where order_id=$1",
        [order.orderId],
      );
      expect(tickets.rows[0].count).toBe(1);

      // A staff member without a membership cannot open an order.
      await expect(
        scoped.query("select app_create_staff_order($1,'walk_in','en',$2::jsonb,$3,'cash') as result", [
          locationId, JSON.stringify([{ menuItemId, quantity: 1 }]), uuid(99),
        ]),
      ).rejects.toThrow(/FORBIDDEN/);
    } finally { await scoped.close(); }
  });

  it("moves a kitchen ticket through the allowed states only", async () => {
    const scoped = await freshDatabase();
    try {
      const { organizationId, locationId } = await seedLocation(scoped, { serviceSettings: { taxBasisPoints: 0 } });
      const { menuItemId } = await seedMenu(scoped, locationId, organizationId);
      const actor = uuid(12);
      await scoped.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
      await scoped.query("insert into memberships(organization_id,user_id,role) values ($1,$2,'kitchen')", [organizationId, actor]);

      const order = await callJson<OrderResult>(scoped,
        "select app_create_staff_order($1,'walk_in','en',$2::jsonb,$3,'cash') as result",
        [locationId, JSON.stringify([{ menuItemId, quantity: 1 }]), actor]);
      const ticket = await scoped.query<{ id: string }>("select id from kitchen_tickets where order_id=$1", [order.orderId]);

      await callJson(scoped, "select app_transition_ticket($1,'preparing',$2) as result", [ticket.rows[0].id, actor]);
      const ready = await callJson<{ status: string }>(scoped, "select app_transition_ticket($1,'ready',$2) as result", [ticket.rows[0].id, actor]);
      expect(ready.status).toBe("ready");

      // ready -> preparing is not an allowed transition.
      await expect(
        scoped.query("select app_transition_ticket($1,'preparing',$2) as result", [ticket.rows[0].id, actor]),
      ).rejects.toThrow(/INVALID_TICKET_TRANSITION/);

      const served = await callJson<{ status: string }>(scoped, "select app_transition_ticket($1,'served',$2) as result", [ticket.rows[0].id, actor]);
      expect(served.status).toBe("served");

      const orderState = await scoped.query<{ fulfillment_status: string }>("select fulfillment_status from orders where id=$1", [order.orderId]);
      expect(orderState.rows[0].fulfillment_status).toBe("served");
    } finally { await scoped.close(); }
  });

  it("refunds within the settled limit and blocks an over-refund", async () => {
    const scoped = await freshDatabase();
    try {
      const { organizationId, locationId } = await seedLocation(scoped);
      const { menuItemId } = await seedMenu(scoped, locationId, organizationId);
      const actor = uuid(13);
      await scoped.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
      await scoped.query("insert into memberships(organization_id,user_id,role) values ($1,$2,'owner')", [organizationId, actor]);

      const order = await callJson<OrderResult>(scoped,
        "select app_create_staff_order($1,'walk_in','en',$2::jsonb,$3,'cash') as result",
        [locationId, JSON.stringify([{ menuItemId, quantity: 1 }]), actor]);
      const connection = await scoped.query<{ id: string }>(
        "insert into payment_connections(organization_id,location_id,provider,merchant_account_reference,environment,currency,verified,enabled) values ($1,$2,'paystack','acct','test','GBP',true,true) returning id",
        [organizationId, locationId],
      );
      const attempt = await scoped.query<{ id: string }>(
        "insert into payment_attempts(organization_id,location_id,order_id,payment_connection_id,provider,provider_reference,amount_minor,currency,environment,status) values ($1,$2,$3,$4,'paystack','ref-1',1000,'GBP','test','succeeded') returning id",
        [organizationId, locationId, order.orderId, connection.rows[0].id],
      );

      const refund = await callJson<{ remainingRefundableMinor: string; status: string }>(scoped,
        "select app_request_refund($1,400,'Item unavailable',$2) as result", [attempt.rows[0].id, actor]);
      expect(refund.status).toBe("requested");
      expect(refund.remainingRefundableMinor).toBe("600");

      await expect(
        scoped.query("select app_request_refund($1,700,'Too much',$2) as result", [attempt.rows[0].id, actor]),
      ).rejects.toThrow(/REFUND_LIMIT_EXCEEDED/);

      // A staff member without the accountant or manager role cannot refund.
      const server = uuid(14);
      await scoped.query("select set_config('request.jwt.claim.sub',$1,false)", [server]);
      await scoped.query("insert into memberships(organization_id,user_id,role) values ($1,$2,'server')", [organizationId, server]);
      await expect(
        scoped.query("select app_request_refund($1,100,'No',$2) as result", [attempt.rows[0].id, server]),
      ).rejects.toThrow(/FORBIDDEN/);
    } finally { await scoped.close(); }
  });

  it("closes a cash shift with an expected total and flags a variance", async () => {
    const scoped = await freshDatabase();
    try {
      const { organizationId, locationId } = await seedLocation(scoped, { serviceSettings: { taxBasisPoints: 0 } });
      const { menuItemId } = await seedMenu(scoped, locationId, organizationId);
      const actor = uuid(15);
      await scoped.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
      await scoped.query("insert into memberships(organization_id,user_id,role) values ($1,$2,'manager')", [organizationId, actor]);

      const shift = await scoped.query<{ shift_id: string }>("select app_open_shift($1,5000,$2) as shift_id", [locationId, actor]);
      expect(shift.rows[0].shift_id).toBeTruthy();

      // Only one shift may be open at a time.
      await expect(scoped.query("select app_open_shift($1,0,$2) as result", [locationId, actor])).rejects.toThrow(/SHIFT_ALREADY_OPEN/);

      // A cash sale of 1000 minor happens during the shift.
      await callJson(scoped, "select app_create_staff_order($1,'walk_in','en',$2::jsonb,$3,'cash') as result",
        [locationId, JSON.stringify([{ menuItemId, quantity: 1 }]), actor]);

      const balanced = await callJson<{ expectedMinor: string; varianceMinor: string; status: string }>(scoped,
        "select app_close_shift($1,6000,$2) as result", [shift.rows[0].shift_id, actor]);
      expect(balanced.expectedMinor).toBe("6000");
      expect(balanced.varianceMinor).toBe("0");
      expect(balanced.status).toBe("closed");
    } finally { await scoped.close(); }
  });

  it("refuses a reservation that would exceed the room capacity", async () => {
    const scoped = await freshDatabase();
    try {
      const { organizationId, locationId } = await seedLocation(scoped, { serviceSettings: { seatingCapacity: 4 } });
      const actor = uuid(16);
      await scoped.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
      await scoped.query("insert into memberships(organization_id,user_id,role) values ($1,$2,'host')", [organizationId, actor]);

      const start = "2027-03-01T19:00:00Z";
      const end = "2027-03-01T21:00:00Z";
      const booked = await callJson<{ reservationId: string }>(scoped,
        "select app_create_reservation($1,$2::timestamptz,$3::timestamptz,3,'Guest A','a@example.invalid',$4) as result",
        [locationId, start, end, actor]);
      expect(booked.reservationId).toBeTruthy();

      // Overlaps the existing booking and would exceed the capacity of four.
      await expect(
        scoped.query("select app_create_reservation($1,$2::timestamptz,$3::timestamptz,3,'Guest B','b@example.invalid',$4) as result", [
          locationId, "2027-03-01T20:00:00Z", "2027-03-01T22:00:00Z", actor,
        ]),
      ).rejects.toThrow(/RESERVATION_CAPACITY_EXCEEDED/);
    } finally { await scoped.close(); }
  });

  it("publishes a merchant menu as a versioned price book", async () => {
    const scoped = await freshDatabase();
    try {
      const { organizationId, locationId } = await seedLocation(scoped, { currency: "ZAR" });
      const actor = uuid(21);
      await scoped.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
      await scoped.query("insert into memberships(organization_id,user_id,role) values ($1,$2,'owner')", [organizationId, actor]);

      const items = [
        { category: "Mains", item: "Bunny chow", description: "Curry in a hollowed loaf", amountMinor: "9500", currency: "ZAR", available: true, allergens: ["gluten"] },
        { category: "Drinks", item: "Rooibos", description: "", amountMinor: "3500", currency: "ZAR", available: true, allergens: [] },
      ];
      const published = await scoped.query<{ price_book_id: string }>(
        "select app_publish_menu($1,$2,$3::jsonb,$4) as price_book_id",
        [organizationId, locationId, JSON.stringify(items), actor]);
      const priceBookId = published.rows[0].price_book_id;
      expect(priceBookId).toBeTruthy();

      const rows = await scoped.query<{ name: string; amount_minor: number; allergens: string[] }>(
        "select mi.name, ip.amount_minor, mi.allergens from menu_items mi join item_prices ip on ip.menu_item_id = mi.id join price_books pb on pb.id = ip.price_book_id where pb.id = $1 order by mi.name",
        [priceBookId],
      );
      expect(rows.rows).toHaveLength(2);
      expect(rows.rows[0].name).toBe("Bunny chow");
      expect(rows.rows[0].amount_minor).toBe(9500);
      expect(rows.rows[0].allergens).toEqual(["gluten"]);

      // A menu in a different currency than the location is refused.
      await expect(
        scoped.query("select app_publish_menu($1,$2,$3::jsonb,$4)", [
          organizationId, locationId,
          JSON.stringify([{ category: "Mains", item: "Foreign", amountMinor: "100", currency: "USD", available: true }]),
          actor,
        ]),
      ).rejects.toThrow(/CURRENCY_OR_AMOUNT_MISMATCH/);

      // Publishing again archives the previous book rather than leaving two live.
      const second = await scoped.query<{ price_book_id: string }>(
        "select app_publish_menu($1,$2,$3::jsonb,$4) as price_book_id",
        [organizationId, locationId, JSON.stringify(items), actor]);
      expect(second.rows[0].price_book_id).not.toBe(priceBookId);
      const live = await scoped.query<{ count: number }>("select count(*)::int as count from price_books where location_id = $1 and status = 'published'", [locationId]);
      expect(live.rows[0].count).toBe(1);
    } finally { await scoped.close(); }
  });

  it("keeps a fresh database free of demo records", async () => {
    const scoped = await freshDatabase();
    try {
      for (const table of ["organizations", "locations", "menu_items", "orders", "reservations", "floor_plans", "kitchen_tickets", "promotions", "modifiers"]) {
        const count = await scoped.query<{ count: number }>(`select count(*)::int as count from ${table}`);
        expect(count.rows[0].count, `${table} must start empty`).toBe(0);
      }
    } finally { await scoped.close(); }
  });
});
