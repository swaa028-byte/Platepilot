import { expect, test } from "@playwright/test";

/**
 * A shift, driven through the real APIs: a signed-in merchant publishes a
 * menu, takes an order, the kitchen bumps it, the ingredients leave stock and
 * the day-end report sees the sale.
 */
type Board = {
  stations: Record<string, { station: string; tickets: { ticketNumber: number; items: { ticketItemId: string; name: string; allergyNote: string | null; status: string }[] }[] }>;
};

test("a counter order becomes a kitchen ticket that leaves stock and reaches the report", async ({ request }, testInfo) => {
  // Each project uses its own merchant so the two browsers never share state.
  const email = `owner-${testInfo.project.name}@kitchen-test.co.za`;
  const signIn = await request.post("/api/auth/local", { data: { email } });
  expect(signIn.status()).toBe(200);

  const onboard = await request.post("/api/onboarding/manual", {
    data: {
      name: "Kitchen Test Cafe",
      address: "1 Loop Street, Cape Town",
      legalCountry: "ZA",
      currency: "ZAR",
      timezone: "Africa/Johannesburg",
      locale: "en",
    },
  });
  expect(onboard.status()).toBe(200);
  const workspace = (await onboard.json()) as { organizationId: string; locationId: string };

  const publish = await request.post("/api/menus/publish", {
    data: {
      organizationId: workspace.organizationId,
      locationId: workspace.locationId,
      items: [
        { category: "Mains", item: "Bunny chow", description: "Curry in a hollowed loaf", amountMinor: "9500", currency: "ZAR", available: true, allergens: ["gluten"] },
      ],
    },
  });
  expect(publish.status()).toBe(200);

  const menu = (await (await request.get(`/api/menu?locationId=${workspace.locationId}&locale=en`)).json()) as {
    items: { id: string; name: string }[];
  };
  expect(menu.items.length).toBe(1);

  // A recipe, so serving the ticket takes stock with it.
  const ingredient = await request.post("/api/staff/inventory/config", {
    data: { kind: "ingredient", locationId: workspace.locationId, name: "Bread", baseUnit: "g", reorderLevelMilliUnits: "500000", unitCostMinor: "12" },
  });
  expect(ingredient.status()).toBe(201);
  const ingredientId = ((await ingredient.json()) as { ingredientId: string }).ingredientId;

  const recipe = await request.post("/api/staff/inventory/config", {
    data: { kind: "recipe", locationId: workspace.locationId, menuItemId: menu.items[0].id, ingredientId, quantityMilliUnits: "200000", wastePercent: 10 },
  });
  expect(recipe.status()).toBe(201);

  const receipt = await request.post("/api/staff/inventory", {
    data: { locationId: workspace.locationId, ingredientId, quantityMilliUnits: "2000000", eventId: "delivery-1" },
  });
  expect(receipt.status()).toBe(201);

  const order = await request.post("/api/staff/orders", {
    data: {
      locationId: workspace.locationId,
      serviceType: "dine_in",
      tenderType: "cash",
      customerName: "Ada",
      items: [{ menuItemId: menu.items[0].id, quantity: 2, allergyNote: "Peanut allergy" }],
    },
  });
  expect(order.status()).toBe(201);
  const placed = (await order.json()) as { orderId: string; ticketId: string; ticketNumber: number };
  expect(placed.ticketNumber).toBe(1);

  // The ticket is on the board, with the note the kitchen must see.
  const board = (await (await request.get(`/api/staff/kitchen?locationId=${workspace.locationId}`)).json()) as Board;
  const station = board.stations.expo;
  expect(station).toBeTruthy();
  expect(station.tickets.length).toBe(1);
  expect(station.tickets[0].ticketNumber).toBe(1);
  expect(station.tickets[0].items[0].name).toBe("Bunny chow");
  expect(station.tickets[0].items[0].allergyNote).toBe("Peanut allergy");

  const ticketItemId = station.tickets[0].items[0].ticketItemId;

  // The kitchen works the ticket forward, one state at a time.
  for (const toStatus of ["preparing", "ready", "served"]) {
    const bump = await request.post("/api/staff/kitchen", { data: { ticketItemId, toStatus } });
    expect(bump.status()).toBe(200);
  }

  // Serving the line took the recipe's ingredients out of stock, once.
  const position = (await (await request.get(`/api/staff/inventory?locationId=${workspace.locationId}`)).json()) as {
    onHandMilliUnits: string; lowStock: boolean;
  }[];
  // 2000g received, 200g per burger with 10% waste times two burgers = 440g.
  expect(position[0].onHandMilliUnits).toBe("1560000");
  expect(position[0].lowStock).toBe(false);

  // The sale is in the day-end report.
  const report = (await (await request.get(`/api/staff/reports/day-end?locationId=${workspace.locationId}`)).json()) as {
    currency: string;
    totals: { orderCount: number; netTotalMinor: string };
  };
  expect(report.currency).toBe("ZAR");
  expect(report.totals.orderCount).toBe(1);
  expect(report.totals.netTotalMinor).toBe("19000");

  // The board no longer lists a ticket that is fully served.
  const after = (await (await request.get(`/api/staff/kitchen?locationId=${workspace.locationId}`)).json()) as Board;
  expect(Object.keys(after.stations).length).toBe(0);
});

test("the kitchen refuses to serve a line that was never started", async ({ request }, testInfo) => {
  const email = `illegal-${testInfo.project.name}@kitchen-test.co.za`;
  await request.post("/api/auth/local", { data: { email } });
  const onboard = await request.post("/api/onboarding/manual", {
    data: { name: "Refusal Cafe", address: "2 Loop Street, Cape Town", legalCountry: "ZA", currency: "ZAR", timezone: "Africa/Johannesburg", locale: "en" },
  });
  const workspace = (await onboard.json()) as { organizationId: string; locationId: string };
  await request.post("/api/menus/publish", {
    data: {
      organizationId: workspace.organizationId,
      locationId: workspace.locationId,
      items: [{ category: "Mains", item: "Rooibos", amountMinor: "3500", currency: "ZAR", available: true }],
    },
  });
  const menu = (await (await request.get(`/api/menu?locationId=${workspace.locationId}&locale=en`)).json()) as { items: { id: string }[] };
  await request.post("/api/staff/orders", {
    data: { locationId: workspace.locationId, serviceType: "walk_in", tenderType: "cash", items: [{ menuItemId: menu.items[0].id, quantity: 1 }] },
  });

  const board = (await (await request.get(`/api/staff/kitchen?locationId=${workspace.locationId}`)).json()) as Board;
  const ticketItemId = board.stations.expo.tickets[0].items[0].ticketItemId;

  const jump = await request.post("/api/staff/kitchen", { data: { ticketItemId, toStatus: "served" } });
  expect(jump.status()).toBe(400);
  expect((await jump.json()).error).toBe("INVALID_TICKET_TRANSITION");
});

test("one tenant cannot read another tenant's kitchen", async ({ request }, testInfo) => {
  const email = `tenant-${testInfo.project.name}@kitchen-test.co.za`;
  await request.post("/api/auth/local", { data: { email } });
  const onboard = await request.post("/api/onboarding/manual", {
    data: { name: "Tenant Cafe", address: "3 Loop Street, Cape Town", legalCountry: "ZA", currency: "ZAR", timezone: "Africa/Johannesburg", locale: "en" },
  });
  await onboard.json();

  // A location that belongs to nobody this member can see.
  const response = await request.get("/api/staff/kitchen?locationId=00000000-0000-4000-8000-000000000001");
  expect(response.status()).toBeGreaterThanOrEqual(400);
});
