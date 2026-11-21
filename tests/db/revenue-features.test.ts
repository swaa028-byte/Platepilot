import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Revenue-path features against the real schema: the public order status read
 * and stock counting. The whole file shares ONE database (this machine cannot
 * hold several PGlite instances at once); every tenant is separated by its own
 * organisation, exactly as row level security separates them in production.
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

let db: PGlite;
const orderToken = "tok_" + "a".repeat(40);

beforeAll(async () => {
  db = await freshDatabase();

  // Tenant A: the order-status fixtures.
  await db.query("insert into organizations(id,name,legal_country,default_locale) values ($1,'Rev tenant','GB','en')", [uuid(1)]);
  await db.query("insert into locations(id,organization_id,name,address,timezone,currency,ordering_enabled) values ($1,$2,'Main','1 Test Street','UTC','GBP',true)", [uuid(2), uuid(1)]);
  await db.query(
    "insert into orders(id,organization_id,location_id,tracking_token,service_type,customer_locale,currency,subtotal_minor,total_minor) values ($1,$2,$3,$4,'pickup','en','GBP',1200,1200)",
    [uuid(3), uuid(1), uuid(2), orderToken],
  );

  // Tenant B: the stock-count fixtures, with a ledger that believes
  // 5 000 g arrived and 1 200 g left.
  await db.query("insert into organizations(id,name,legal_country,default_locale) values ($1,'Count tenant','ZA','en')", [uuid(10)]);
  await db.query("insert into locations(id,organization_id,name,address,timezone,currency) values ($1,$2,'Main','1 Count Street','Africa/Johannesburg','ZAR')", [uuid(11), uuid(10)]);
  const countActor = uuid(52);
  await db.query("insert into memberships(organization_id,user_id,role) values ($1,$2,'manager')", [uuid(10), countActor]);
  const flour = await db.query<{ id: string }>(
    "insert into ingredients(id,organization_id,location_id,name,base_unit) values ($1,$2,$3,'Flour','g') returning id",
    [uuid(12), uuid(10), uuid(11)]);
  await db.query(
    "insert into stock_movements(organization_id,location_id,ingredient_id,event_id,kind,quantity_milli_units,actor_id) values ($1,$2,$3,'seed:receipt','receipt',5000000,$4)",
    [uuid(10), uuid(11), flour.rows[0].id, countActor]);
  await db.query(
    "insert into stock_movements(organization_id,location_id,ingredient_id,event_id,kind,quantity_milli_units,actor_id) values ($1,$2,$3,'seed:depletion','depletion',-1200000,$4)",
    [uuid(10), uuid(11), flour.rows[0].id, countActor]);
});

afterAll(async () => { await db.close(); });

describe("public order status", () => {
  it("returns the order only to the holder of the exact tracking token", async () => {
    const status = await callJson<{ orderId: string; paymentStatus: string; totalMinor: string }>(
      db, "select app_public_order_status($1,$2) as result", [uuid(3), orderToken],
    );
    expect(status.orderId).toBe(uuid(3));
    expect(status.paymentStatus).toBe("unpaid");
    expect(status.totalMinor).toBe("1200");
  });
  it("refuses a wrong or short token and an unknown order", async () => {
    await expect(db.query("select app_public_order_status($1,$2)", [uuid(3), "short"])).rejects.toThrow("INVALID_REQUEST");
    await expect(db.query("select app_public_order_status($1,$2)", [uuid(3), "b".repeat(40)])).rejects.toThrow("ORDER_NOT_FOUND");
    await expect(db.query("select app_public_order_status($1,$2)", [uuid(99), orderToken])).rejects.toThrow("ORDER_NOT_FOUND");
  });
});

describe("stock counts", () => {
  const countActor = uuid(52);

  it("snapshots the ledger, adjusts exactly once to what was found", async () => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [countActor]);
    const started = await callJson<{ stockCountId: string; lines: { ingredientId: string; systemMilliUnits: string }[] }>(
      db, "select app_start_stock_count($1,$2) as result", [countActor, uuid(11)]);
    expect(started.lines).toHaveLength(1);
    expect(started.lines[0].systemMilliUnits).toBe("3800000"); // 5 000 - 1 200

    const submitted = await callJson<{ status: string; adjusted: number; variance: { varianceMilliUnits: string }[] }>(
      db, "select app_submit_stock_count($1,$2,$3) as result",
      [countActor, started.stockCountId, JSON.stringify([{ ingredientId: uuid(12), countedMilliUnits: "3700000" }])]);
    expect(submitted.status).toBe("completed");
    expect(submitted.adjusted).toBe(1);
    expect(submitted.variance[0].varianceMilliUnits).toBe("-100000");

    // The ledger now believes what was counted.
    const level = await db.query<{ total: string }>(
      "select coalesce(sum(quantity_milli_units),0)::text as total from stock_movements where ingredient_id=$1", [uuid(12)]);
    expect(level.rows[0].total).toBe("3700000");

    // Resubmitting the same count is refused and cannot double-adjust.
    await expect(db.query("select app_submit_stock_count($1,$2,$3)",
      [countActor, started.stockCountId, JSON.stringify([{ ingredientId: uuid(12), countedMilliUnits: "3700000" }])]))
      .rejects.toThrow("COUNT_NOT_OPEN");
    const again = await db.query<{ n: string }>(
      "select count(*)::text as n from stock_movements where kind='count_adjustment'", []);
    expect(again.rows[0].n).toBe("1");
  });

  it("refuses a second open count, a non-manager, a stranger, and ingredients outside the count", async () => {
    // A second location for the same tenant, so both refusal cases fit in the
    // one database this file shares.
    await db.query("insert into locations(id,organization_id,name,address,timezone,currency) values ($1,$2,'Second','9 Count Street','Africa/Johannesburg','ZAR')", [uuid(13), uuid(10)]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [countActor]);
    await callJson(db, "select app_start_stock_count($1,$2) as result", [countActor, uuid(13)]);
    await expect(db.query("select app_start_stock_count($1,$2)", [countActor, uuid(13)])).rejects.toThrow("COUNT_ALREADY_OPEN");

    // A server of the same organisation may not open a count.
    const serverActor = uuid(54);
    await db.query("insert into memberships(organization_id,user_id,role) values ($1,$2,'server')", [uuid(10), serverActor]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [serverActor]);
    await expect(db.query("select app_start_stock_count($1,$2)", [serverActor, uuid(11)])).rejects.toThrow("FORBIDDEN");

    // A manager of another organisation is refused outright.
    await db.query("insert into organizations(id,name,legal_country,default_locale) values ($1,'Other tenant','ZA','en')", [uuid(20)]);
    await db.query("insert into memberships(organization_id,user_id,role) values ($1,$2,'manager')", [uuid(20), uuid(53)]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uuid(53)]);
    await expect(db.query("select app_start_stock_count($1,$2)", [uuid(53), uuid(11)])).rejects.toThrow("FORBIDDEN");

    // An ingredient outside the count is refused.
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [countActor]);
    await expect(db.query("select app_submit_stock_count($1,$2,$3)",
      [countActor, uuid(30), JSON.stringify([{ ingredientId: uuid(99), countedMilliUnits: "10" }])]))
      .rejects.toThrow("COUNT_NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// Service-period menus
// ---------------------------------------------------------------------------

const lunchItems = JSON.stringify([{ category: "Mains", item: "Burger", description: "", allergens: [], amountMinor: "1000", currency: "GBP", available: true }]);
const breakfastItems = JSON.stringify([{ category: "Morning", item: "Eggs on toast", description: "", allergens: [], amountMinor: "800", currency: "GBP", available: true }]);

describe("service-period menus", () => {
  it("serves the scheduled menu inside its window and the always-on menu outside", async () => {
    await db.query("insert into organizations(id,name,legal_country,default_locale) values ($1,'Menu tenant','GB','en')", [uuid(40)]);
    await db.query("insert into locations(id,organization_id,name,address,timezone,currency) values ($1,$2,'Main','1 Menu Street','UTC','GBP')", [uuid(41), uuid(40)]);
    const menuActor = uuid(55);
    await db.query("insert into memberships(organization_id,user_id,role) values ($1,$2,'owner')", [uuid(40), menuActor]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [menuActor]);

    await callJson(db, "select app_publish_menu($1,$2,$3::jsonb,$4) as result", [uuid(40), uuid(41), lunchItems, menuActor]);
    await callJson(db, "select app_publish_service_menu($1,$2,$3,$4::jsonb,$5::jsonb,$6) as result",
      [uuid(40), uuid(41), "Breakfast", JSON.stringify({ days: ["0", "1", "2", "3", "4", "5", "6"], start: "06:00", end: "11:00" }), breakfastItems, menuActor]);

    // 08:00 UTC on a Monday: the breakfast window.
    const morning = await callJson<{ items: { name: string }[] }>(
      db, "select app_published_menu($1,'en',$2::timestamptz) as result", [uuid(41), "2026-11-23 08:00+00"]);
    expect(morning.items.map((item) => item.name)).toEqual(["Eggs on toast"]);

    // 12:00 UTC: breakfast closed, the always-on menu serves.
    const midday = await callJson<{ items: { name: string }[] }>(
      db, "select app_published_menu($1,'en',$2::timestamptz) as result", [uuid(41), "2026-11-23 12:00+00"]);
    expect(midday.items.map((item) => item.name)).toEqual(["Burger"]);

    // The merchant sees both books with their schedules.
    const books = await callJson<{ label: string | null; schedule: unknown; status: string; items: number }[]>(
      db, "select app_list_price_books($1,$2) as result", [menuActor, uuid(41)]);
    expect(books).toHaveLength(2);
    expect(books.filter((book) => book.label === "Breakfast")[0].items).toBe(1);
  });

  it("falls back to the always-on menu when the scheduled book is archived, and refuses bad schedules", async () => {
    const menuActor = uuid(56);
    await db.query("insert into organizations(id,name,legal_country,default_locale) values ($1,'Menu tenant 2','GB','en')", [uuid(42)]);
    await db.query("insert into locations(id,organization_id,name,address,timezone,currency) values ($1,$2,'Main','2 Menu Street','UTC','GBP')", [uuid(43), uuid(42)]);
    await db.query("insert into memberships(organization_id,user_id,role) values ($1,$2,'owner')", [uuid(42), menuActor]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [menuActor]);

    await callJson(db, "select app_publish_menu($1,$2,$3::jsonb,$4) as result", [uuid(42), uuid(43), lunchItems, menuActor]);
    const breakfastBook = await callJson<string>(db, "select app_publish_service_menu($1,$2,$3,$4::jsonb,$5::jsonb,$6) as result",
      [uuid(42), uuid(43), "Breakfast", JSON.stringify({ days: ["1"], start: "06:00", end: "11:00" }), breakfastItems, menuActor]);

    await db.query("select app_archive_price_book($1,$2)", [menuActor, breakfastBook]);
    const morning = await callJson<{ items: { name: string }[] }>(
      db, "select app_published_menu($1,'en',$2::timestamptz) as result", [uuid(43), "2026-11-23 08:00+00"]);
    expect(morning.items.map((item) => item.name)).toEqual(["Burger"]);

    await expect(db.query("select app_publish_service_menu($1,$2,$3,$4::jsonb,$5::jsonb,$6)",
      [uuid(42), uuid(43), "All day", JSON.stringify({ days: ["1"], start: "12:00", end: "09:00" }), lunchItems, menuActor]))
      .rejects.toThrow("INVALID_REQUEST");
    await expect(db.query("select app_publish_service_menu($1,$2,$3,$4::jsonb,$5::jsonb,$6)",
      [uuid(42), uuid(43), "   ", JSON.stringify({ days: ["1"], start: "06:00", end: "11:00" }), lunchItems, menuActor]))
      .rejects.toThrow("INVALID_REQUEST");
  });
});

// ---------------------------------------------------------------------------
// Loyalty and gift cards
// ---------------------------------------------------------------------------

let loyaltyMenuItemId = "";

describe("loyalty and gift cards", () => {
  const loyaltyActor = uuid(57);

  async function seedLoyaltyMenu() {
    const category = await db.query<{ id: string }>(
      "insert into catalog_categories(organization_id,location_id,name) values ($1,$2,'Mains') returning id",
      [uuid(60), uuid(61)]);
    const item = await db.query<{ id: string }>(
      "insert into menu_items(organization_id,location_id,category_id,name,available) values ($1,$2,$3,'Stew',true) returning id",
      [uuid(60), uuid(61), category.rows[0].id]);
    const priceBook = await db.query<{ id: string }>(
      "insert into price_books(organization_id,location_id,currency,status,published_at) values ($1,$2,'GBP','published',now()) returning id",
      [uuid(60), uuid(61)]);
    await db.query("insert into item_prices(price_book_id,menu_item_id,amount_minor) values ($1,$2,1000)",
      [priceBook.rows[0].id, item.rows[0].id]);
    return item.rows[0].id;
  }

  async function placeOrder(email: string | null, redeemPoints: string | null, giftCode: string | null) {
    return callJson<{ orderId: string; totalMinor: string; paymentStatus: string; giftCardMinor: string; loyaltyPointsRedeemed: string; discountMinor: string }>(
      db, "select app_create_order($1,'pickup','en',$2::jsonb,null,null,null,null,null,$3,$4::bigint,$5) as result",
      [uuid(61), JSON.stringify([{ menuItemId: loyaltyMenuItemId, quantity: 1 }]), email, redeemPoints, giftCode]);
  }

  it("earns points only on paid orders and spends them exactly once", async () => {
    await db.query("insert into organizations(id,name,legal_country,default_locale) values ($1,'Loyal tenant','GB','en')", [uuid(60)]);
    await db.query("insert into locations(id,organization_id,name,address,timezone,currency,ordering_enabled) values ($1,$2,'Main','1 Loyal Street','UTC','GBP',true)", [uuid(61), uuid(60)]);
    await db.query("insert into memberships(organization_id,user_id,role) values ($1,$2,'owner')", [uuid(60), loyaltyActor]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [loyaltyActor]);
    loyaltyMenuItemId = await seedLoyaltyMenu();
    await callJson(db, "select app_configure_loyalty($1,$2,1::bigint,1::bigint,true) as result", [loyaltyActor, uuid(60)]);

    // An unpaid order earns nothing.
    const first = await placeOrder("ada@example.com", null, null);
    expect(first.paymentStatus).toBe("unpaid");
    const before = await callJson<{ points: string }>(db, "select app_loyalty_balance($1,$2) as result", [uuid(60), "ada@example.com"]);
    expect(before.points).toBe("0");

    // The order is paid through a real payment attempt with a durable event.
    const connection = await db.query<{ id: string }>(
      "insert into payment_connections(organization_id,location_id,provider,merchant_account_reference,environment,currency,verified,enabled) values ($1,$2,'stripe','env:STRIPE_KEY','test','GBP',true,true) returning id",
      [uuid(60), uuid(61)]);
    const attempt = await db.query<{ id: string }>(
      "insert into payment_attempts(organization_id,location_id,order_id,payment_connection_id,provider,provider_reference,amount_minor,currency,environment,status) values ($1,$2,$3,$4,'stripe','cs_test_loyal',$5,'GBP','test','awaiting_customer') returning id",
      [uuid(60), uuid(61), first.orderId, connection.rows[0].id, BigInt(first.totalMinor)]);
    await db.query(
      "insert into payment_events(payment_attempt_id,provider,provider_event_id,event_type,payload) values ($1,'stripe','evt_1','checkout.session.completed','{}')",
      [attempt.rows[0].id]);
    const applied = await callJson<{ status: string }>(
      db, "select app_apply_verified_payment($1,$2,$3) as result", [attempt.rows[0].id, "evt_1", "cs_test_loyal"]);
    expect(applied.status).toBe("applied");

    const earned = await callJson<{ points: string }>(db, "select app_loyalty_balance($1,$2) as result", [uuid(60), "ada@example.com"]);
    expect(earned.points).toBe(first.totalMinor); // 1 point per minor spent

    // The points pay for the next order: 1000 points at 1 per minor = 10.00 off.
    const second = await placeOrder("ada@example.com", "1000", null);
    expect(second.discountMinor).toBe("1000");
    expect(second.totalMinor).toBe("0");
    const after = await callJson<{ points: string }>(db, "select app_loyalty_balance($1,$2) as result", [uuid(60), "ada@example.com"]);
    expect(after.points).toBe("0");

    // More points than the customer has are refused.
    await expect(db.query(
      "select app_create_order($1,'pickup','en',$2::jsonb,null,null,null,null,null,$3,999999::bigint,null)",
      [uuid(61), JSON.stringify([{ menuItemId: loyaltyMenuItemId, quantity: 1 }]), "ada@example.com"])).rejects.toThrow("LOYALTY_INSUFFICIENT_POINTS");
  });

  it("lets a gift card pay an order outright and records partial covers once", async () => {
    const issued = await callJson<{ code: string; initialMinor: string }>(
      db, "select app_issue_gift_card($1,$2,5000::bigint,'GBP') as result", [loyaltyActor, uuid(60)]);

    // 5000 minor covers a 1000 minor order outright: paid, ticketed.
    const full = await placeOrder("grace@example.com", null, issued.code);
    expect(full.paymentStatus).toBe("paid");
    expect(full.giftCardMinor).toBe(full.totalMinor);
    const ticket = await db.query<{ n: string }>("select count(*)::text as n from kitchen_tickets where order_id=$1", [full.orderId]);
    expect(ticket.rows[0].n).toBe("1");
    const balance1 = await callJson<{ balanceMinor: string }>(db, "select app_gift_card_balance($1,$2) as result", [uuid(60), issued.code]);
    expect(balance1.balanceMinor).toBe("4000");

    // Each further order takes another 1000; when the balance reaches zero the
    // card is refused.
    await placeOrder("grace@example.com", null, issued.code);
    const balance2 = await callJson<{ balanceMinor: string }>(db, "select app_gift_card_balance($1,$2) as result", [uuid(60), issued.code]);
    expect(balance2.balanceMinor).toBe("3000");
    await placeOrder("grace@example.com", null, issued.code);
    const balance3 = await callJson<{ balanceMinor: string; valid: boolean }>(db, "select app_gift_card_balance($1,$2) as result", [uuid(60), issued.code]);
    expect(balance3.balanceMinor).toBe("2000");
    await placeOrder("grace@example.com", null, issued.code);
    await placeOrder("grace@example.com", null, issued.code);
    const drained = await callJson<{ balanceMinor: string; valid: boolean }>(db, "select app_gift_card_balance($1,$2) as result", [uuid(60), issued.code]);
    expect(drained.balanceMinor).toBe("0");
    expect(drained.valid).toBe(false);
    await expect(placeOrder("grace@example.com", null, issued.code)).rejects.toThrow();

    // The merchant sees the cards; an unknown code is refused.
    const cards = await callJson<{ code: string; balanceMinor: string }[]>(db, "select app_list_gift_cards($1,$2) as result", [loyaltyActor, uuid(60)]);
    expect(cards).toHaveLength(1);
    await expect(placeOrder("grace@example.com", null, "GC-NOPE-NOPE")).rejects.toThrow("GIFT_CARD_NOT_FOUND");
  });
});

describe("table qr", () => {
  it("resolves a table id from a scanned code back to its name", async () => {
    await db.query(
      "insert into restaurant_tables(id,organization_id,location_id,name,capacity) values ($1,$2,$3,'Window 4',4)",
      [uuid(70), uuid(60), uuid(61)]);
    const label = await callJson<{ name: string; locationId: string }>(
      db, "select app_table_label($1) as result", [uuid(70)]);
    expect(label.name).toBe("Window 4");
    expect(label.locationId).toBe(uuid(61));
  });
});

describe("anti-theft reporting", () => {
  const manager = uuid(57);          // same owner as the loyalty tenant
  const server = uuid(58);
  const staffItems = () => JSON.stringify([{ menuItemId: loyaltyMenuItemId, quantity: 2 }]);

  it("attributes staff orders, records voids with reasons, and reports the exceptions", async () => {
    await db.query("insert into memberships(organization_id,user_id,role) values ($1,$2,'server')", [uuid(60), server]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [server]);

    // A server takes a paid walk-in order; the order carries their name.
    const staff = await callJson<{ orderId: string; totalMinor: string }>(
      db, "select app_create_staff_order($1,'walk_in','en',$2::jsonb,$3,'cash') as result",
      [uuid(61), staffItems(), server]);
    const attribution = await db.query<{ created_by: string }>("select created_by::text from orders where id=$1", [staff.orderId]);
    expect(attribution.rows[0].created_by).toBe(server);

    // Voiding needs a reason, and a paid order is refunded, not voided.
    await expect(db.query("select app_void_order($1,$2,'')", [server, staff.orderId]))
      .rejects.toThrow("VOID_REASON_REQUIRED");
    await expect(db.query("select app_void_order($1,$2,'changed their mind')", [server, staff.orderId]))
      .rejects.toThrow();

    // An unpaid order voids cleanly, with the reason recorded immutably.
    const unpaid = await callJson<{ orderId: string }>(
      db, "select app_create_staff_order($1,'walk_in','en',$2::jsonb,$3) as result",
      [uuid(61), staffItems(), server]);
    await callJson(db, "select app_void_order($1,$2,'wrong table') as result", [server, unpaid.orderId]);
    const voided = await db.query<{ fulfillment_status: string; void_reason: string }>(
      "select fulfillment_status, void_reason from orders where id=$1", [unpaid.orderId]);
    expect(voided.rows[0].fulfillment_status).toBe("cancelled");
    expect(voided.rows[0].void_reason).toBe("wrong table");

    // A refund and a cash shift with a shortfall, both attributed to the server.
    const connection = await db.query<{ id: string }>(
      "insert into payment_connections(organization_id,location_id,provider,merchant_account_reference,environment,currency) values ($1,$2,'counter','till','test','GBP') returning id",
      [uuid(60), uuid(61)]);
    const attempt = await db.query<{ id: string }>(
      "insert into payment_attempts(organization_id,location_id,order_id,payment_connection_id,provider,provider_reference,amount_minor,currency,environment,status) values ($1,$2,$3,$4,'counter','till-1',$5,'GBP','test','succeeded') returning id",
      [uuid(60), uuid(61), staff.orderId, connection.rows[0].id, BigInt(staff.totalMinor)]);
    await db.query(
      "insert into refunds(organization_id,location_id,payment_attempt_id,amount_minor,currency,reason,status,requested_by) values ($3,$4,$1,500,'GBP','guest complaint','confirmed',$2)",
      [attempt.rows[0].id, server, uuid(60), uuid(61)]);
    await db.query(
      "insert into cash_shifts(organization_id,location_id,opened_by,closed_by,opening_minor,expected_minor,counted_minor,variance_minor,currency,status,closed_at) values ($1,$2,$3,$3,10000,20000,19500,-500,'GBP','review',now())",
      [uuid(60), uuid(61), server]);

    // The manager reads the exception report; a server cannot.
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [manager]);
    const report = await callJson<{ staff: Array<{ actor: string; orderCount: number; voidCount: number; refundCount: number; refundMinor: string; cashVarianceMinor: string; voidMinor: string }> }>(
      db, "select app_theft_report($1,$2,now() - interval '1 day', now() + interval '1 day') as result",
      [manager, uuid(61)]);
    const row = report.staff.find((entry) => entry.actor === server);
    expect(row).toBeDefined();
    expect(row!.orderCount).toBe(2);
    expect(row!.voidCount).toBe(1);
    expect(row!.voidMinor).toBe("2000"); // 2 x 1000
    expect(row!.refundCount).toBe(1);
    expect(row!.refundMinor).toBe("500");
    expect(row!.cashVarianceMinor).toBe("-500");

    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [server]);
    await expect(db.query("select app_theft_report($1,$2,now(),now() + interval '1 day')", [server, uuid(61)]))
      .rejects.toThrow("FORBIDDEN");
  });
});

describe("bar tabs and bill splits", () => {
  const tabServer = uuid(58); // same server as the anti-theft tenant

  it("grows a tab, takes part payments, and closes it exactly once", async () => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [tabServer]);
    const tab = await callJson<{ orderId: string; totalMinor: string }>(
      db, "select app_create_staff_order($1,'walk_in','en',$2::jsonb,$3) as result",
      [uuid(61), JSON.stringify([{ menuItemId: loyaltyMenuItemId, quantity: 1 }]), tabServer]);
    expect(tab.totalMinor).toBe("1000");

    // The guest orders again: the tab grows, the ticket grows with it.
    const grown = await callJson<{ totalMinor: string; addedMinor: string }>(
      db, "select app_add_order_items($1,$2,$3::jsonb) as result",
      [tabServer, tab.orderId, JSON.stringify([{ menuItemId: loyaltyMenuItemId, quantity: 2 }])]);
    expect(grown.addedMinor).toBe("2000");
    expect(grown.totalMinor).toBe("3000");

    // A part payment leaves the tab open; the covering payment closes it.
    const first = await callJson<{ paymentStatus: string; paidTotalMinor: string }>(
      db, "select app_record_order_payment($1,$2,1000::bigint,'cash','tab-e1') as result",
      [tabServer, tab.orderId]);
    expect(first.paymentStatus).toBe("unpaid");
    expect(first.paidTotalMinor).toBe("1000");
    const second = await callJson<{ paymentStatus: string; paidTotalMinor: string }>(
      db, "select app_record_order_payment($1,$2,2000::bigint,'cash','tab-e2') as result",
      [tabServer, tab.orderId]);
    expect(second.paymentStatus).toBe("paid");
    expect(second.paidTotalMinor).toBe("3000");

    // The same event id cannot take the same money twice.
    await expect(db.query("select app_record_order_payment($1,$2,1000::bigint,'cash','tab-e1')", [tabServer, tab.orderId]))
      .rejects.toThrow();
    const paid = await db.query<{ payment_status: string }>("select payment_status from orders where id=$1", [tab.orderId]);
    expect(paid.rows[0].payment_status).toBe("paid");
    const outbox = await db.query<{ n: string }>(
      "select count(*)::text as n from outbox_events where event_key=$1", [`order.paid:${tab.orderId}`]);
    expect(outbox.rows[0].n).toBe("1");
  });

  it("splits items of an open order onto a new order with honest totals", async () => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [tabServer]);
    const order = await callJson<{ orderId: string; totalMinor: string }>(
      db, "select app_create_staff_order($1,'walk_in','en',$2::jsonb,$3) as result",
      [uuid(61), JSON.stringify([
        { menuItemId: loyaltyMenuItemId, quantity: 1 },
        { menuItemId: loyaltyMenuItemId, quantity: 3 },
      ]), tabServer]);
    const items = await db.query<{ id: string; line_total_minor: string }>(
      "select id, line_total_minor::text from order_items where order_id=$1 order by line_total_minor desc", [order.orderId]);
    expect(items.rows).toHaveLength(2);

    const split = await callJson<{ newOrderId: string; movedMinor: string; originalTotalMinor: string }>(
      db, "select app_split_order($1,$2,$3::jsonb) as result",
      [tabServer, order.orderId, JSON.stringify([items.rows[0].id])]);
    expect(split.movedMinor).toBe("3000"); // 3 x 1000
    expect(split.originalTotalMinor).toBe("1000");

    const moved = await db.query<{ n: string }>(
      "select count(*)::text as n from order_items where order_id=$1", [split.newOrderId]);
    expect(moved.rows[0].n).toBe("1");
    const ticket = await db.query<{ n: string }>(
      "select count(*)::text as n from kitchen_tickets where order_id=$1", [split.newOrderId]);
    expect(ticket.rows[0].n).toBe("1");

    // Splitting the last item off an order is refused.
    await expect(db.query(
      "select app_split_order($1,$2,$3::jsonb)",
      [tabServer, split.newOrderId, JSON.stringify([items.rows[0].id])])).rejects.toThrow("SPLIT_MUST_LEAVE_ITEMS");

    // A paid order cannot be split; it must be refunded instead.
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [tabServer]);
    await db.query("select app_record_order_payment($1,$2,1000::bigint,'cash','split-close')", [tabServer, order.orderId]);
    await expect(db.query(
      "select app_split_order($1,$2,$3::jsonb)",
      [tabServer, order.orderId, JSON.stringify([items.rows[1].id])])).rejects.toThrow("ORDER_ALREADY_PAID");
  });
});

describe("invoicing", () => {
  it("numbers invoices without gaps from a paid order, once per order, and exports the window", async () => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uuid(57)]);
    await callJson(db, "select app_create_invoice_series($1,$2,'Sales','INV-') as result", [uuid(57), uuid(61)]);

    // Two paid orders, taken by the server.
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uuid(58)]);
    const a = await callJson<{ orderId: string }>(
      db, "select app_create_staff_order($1,'walk_in','en',$2::jsonb,$3,'cash') as result",
      [uuid(61), JSON.stringify([{ menuItemId: loyaltyMenuItemId, quantity: 1 }]), uuid(58)]);
    const b = await callJson<{ orderId: string }>(
      db, "select app_create_staff_order($1,'walk_in','en',$2::jsonb,$3,'cash') as result",
      [uuid(61), JSON.stringify([{ menuItemId: loyaltyMenuItemId, quantity: 1 }]), uuid(58)]);

    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uuid(57)]);
    const first = await callJson<{ number: string; netMinor: string; taxMinor: string; totalMinor: string }>(
      db, "select app_issue_invoice($1,$2) as result", [uuid(57), a.orderId]);
    expect(first.number).toBe("INV-1");
    expect(first.totalMinor).toBe("1000");
    expect(first.netMinor).toBe("1000"); // no tax configured on this location
    const second = await callJson<{ number: string }>(
      db, "select app_issue_invoice($1,$2) as result", [uuid(57), b.orderId]);
    expect(second.number).toBe("INV-2");

    // The same order cannot be invoiced twice.
    await expect(db.query("select app_issue_invoice($1,$2)", [uuid(57), a.orderId])).rejects.toThrow();
    // An unpaid order cannot be invoiced.
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uuid(58)]);
    const unpaid = await callJson<{ orderId: string }>(
      db, "select app_create_staff_order($1,'walk_in','en',$2::jsonb,$3) as result",
      [uuid(61), JSON.stringify([{ menuItemId: loyaltyMenuItemId, quantity: 1 }]), uuid(58)]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uuid(57)]);
    await expect(db.query("select app_issue_invoice($1,$2)", [uuid(57), unpaid.orderId]))
      .rejects.toThrow("ORDER_NOT_PAID");

    // The export covers exactly the invoiced orders.
    const rows = await callJson<Array<{ invoiceNumber: string; totalMinor: string }>>(
      db, "select app_tax_export($1,$2,now() - interval '1 day', now() + interval '1 day') as result",
      [uuid(57), uuid(61)]);
    expect(rows.map((row) => row.invoiceNumber)).toEqual(["INV-1", "INV-2"]);
    expect(rows.every((row) => row.totalMinor === "1000")).toBe(true);
  });
});

describe("sms campaigns", () => {
  it("records consent, snapshots the audience once, and enqueues exactly one job per person", async () => {
    // Consent: a phone enters the audience only with a valid number and an
    // opt-in; the trail lands in consent_events either way.
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uuid(57)]);
    const first = await callJson<{ customerId: string }>(
      db, "select app_record_sms_consent($1,$2,'Dana Whit',$3,true) as result",
      [uuid(57), uuid(60), "+15550101"]);
    const second = await callJson<{ customerId: string }>(
      db, "select app_record_sms_consent($1,$2,'Ana Reyes',$3,true) as result",
      [uuid(57), uuid(60), "+15550102"]);
    expect(first.customerId).not.toBe(second.customerId);

    // A malformed number is refused outright — nothing half-consented.
    await expect(db.query(
      "select app_record_sms_consent($1,$2,'Bad Number','5550103',true)",
      [uuid(57), uuid(60)])).rejects.toThrow("INVALID_PHONE");

    // An opt-out removes the person from the audience but keeps the trail.
    await callJson(db, "select app_record_sms_consent($1,$2,'Ana Reyes',$3,false) as result",
      [uuid(57), uuid(60), "+15550102"]);
    const audience = await callJson<Array<{ customerId: string; phone: string }>>(
      db, "select app_list_sms_audience($1,$2) as result", [uuid(57), uuid(61)]);
    expect(audience.map((entry) => entry.phone)).toEqual(["+15550101"]);
    const consents = await db.query(
      "select action from consent_events where customer_id=$1 and channel='sms' order by occurred_at",
      [second.customerId]);
    expect((consents.rows as Array<{ action: string }>).map((row) => row.action)).toEqual(["opt_in", "opt_out"]);

    // A draft campaign, editable while it is still a draft.
    const campaign = await callJson<{ campaignId: string }>(
      db, "select app_upsert_sms_campaign($1,$2,null,'Friday paella','Paella night Friday — show this text for a free dessert.') as result",
      [uuid(57), uuid(61)]);
    await callJson(db, "select app_upsert_sms_campaign($1,$2,$3,'Friday paella','Updated body.') as result",
      [uuid(57), uuid(61), campaign.campaignId]);

    // Only a manager sends.
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uuid(58)]);
    await expect(db.query("select app_send_sms_campaign($1,$2)", [uuid(58), campaign.campaignId]))
      .rejects.toThrow("FORBIDDEN");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uuid(57)]);
    const sent = await callJson<{ status: string; enqueued: number }>(
      db, "select app_send_sms_campaign($1,$2) as result", [uuid(57), campaign.campaignId]);
    expect(sent.status).toBe("sent");
    expect(sent.enqueued).toBe(1);

    // One job per recipient, carrying the body and the campaign id.
    const jobs = await db.query(
      "select payload from jobs where kind='sms.send' and payload->>'campaignId'=$1", [campaign.campaignId]);
    expect(jobs.rows).toHaveLength(1);
    const payload = (jobs.rows as Array<{ payload: { to: string; body: string } }>)[0].payload;
    expect(payload.to).toBe("+15550101");
    expect(payload.body).toContain("Updated body.");

    // A second send is refused and can never double-message anyone.
    await expect(db.query("select app_send_sms_campaign($1,$2)", [uuid(57), campaign.campaignId]))
      .rejects.toThrow("CAMPAIGN_NOT_DRAFT");
    // Editing a sent campaign is refused too.
    await expect(db.query(
      "select app_upsert_sms_campaign($1,$2,$3,'Renamed','Body')",
      [uuid(57), uuid(61), campaign.campaignId])).rejects.toThrow("CAMPAIGN_NOT_DRAFT");

    // A later consent re-joins the audience without a duplicate recipient.
    await callJson(db, "select app_record_sms_consent($1,$2,'Ana Reyes',$3,true) as result",
      [uuid(57), uuid(60), "+15550102"]);
    const again = await callJson<{ status: string }>(
      db, "select app_send_sms_campaign($1,$2) as result",
      [uuid(57), (await callJson<{ campaignId: string }>(
        db, "select app_upsert_sms_campaign($1,$2,null,'Second blast','Another week.') as result",
        [uuid(57), uuid(61)])).campaignId]);
    expect(again.status).toBe("sent");

    // The list reports recipients and how many jobs the worker completed.
    const completed = await db.query(
      "update jobs set status='completed' where kind='sms.send' and payload->>'campaignId' in (select id::text from sms_campaigns where location_id=$1) returning payload->>'campaignId' as id",
      [uuid(61)]);
    expect(completed.rows).toHaveLength(3);
    const listed = await callJson<Array<{ name: string; recipients: number; delivered: number }>>(
      db, "select app_list_sms_campaigns($1,$2) as result", [uuid(57), uuid(61)]);
    expect(listed).toHaveLength(2);
    expect(listed[0].recipients).toBe(2);
    expect(listed[0].delivered).toBe(2);
    expect(listed[1].recipients).toBe(1);
    expect(listed[1].delivered).toBe(1);
  });
});
