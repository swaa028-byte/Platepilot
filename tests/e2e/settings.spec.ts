import { expect, test } from "@playwright/test";

/**
 * The operator settings surface, driven through the real APIs and then through
 * the page a merchant uses.
 *
 * This is the check that matters for the blocking defect: before the settings
 * could be written, a published menu took no orders at all and every booking was
 * refused. The test pauses nothing and fakes nothing — it turns the location on
 * the way a manager would and then places a real order on the storefront.
 */
type Settings = {
  orderingEnabled: boolean;
  serviceSettings: Record<string, unknown>;
  tableCount: number;
  seatCount: number;
};

const OPEN_ALL_WEEK = {
  "0": [["00:00", "23:59"]], "1": [["00:00", "23:59"]], "2": [["00:00", "23:59"]],
  "3": [["00:00", "23:59"]], "4": [["00:00", "23:59"]], "5": [["00:00", "23:59"]],
  "6": [["00:00", "23:59"]],
};

test("a merchant opens the storefront, books a table, and the order is priced by the server", async ({ page }, testInfo) => {
  // The API context is the browser context, so the session it creates is the
  // session the page then uses.
  const api = page.context().request;
  const email = `owner-${testInfo.project.name}@settings-test.co.za`;
  expect((await api.post("/api/auth/local", { data: { email } })).status()).toBe(200);

  const onboard = await api.post("/api/onboarding/manual", {
    data: {
      name: `Settings Test Cafe ${testInfo.project.name}`,
      address: "2 Long Street, Cape Town",
      legalCountry: "ZA",
      currency: "ZAR",
      timezone: "Africa/Johannesburg",
      locale: "en",
    },
  });
  expect(onboard.status()).toBe(200);
  const workspace = (await onboard.json()) as { organizationId: string; locationId: string };

  expect((await api.post("/api/menus/publish", {
    data: {
      organizationId: workspace.organizationId,
      locationId: workspace.locationId,
      items: [{ category: "Mains", item: "Bunny chow", description: "Curry in a hollowed loaf", amountMinor: "9500", currency: "ZAR", available: true }],
    },
  })).status()).toBe(200);

  const menu = (await (await api.get(`/api/menu?locationId=${workspace.locationId}&locale=en`)).json()) as {
    items: { id: string }[];
  };

  // A new location is closed. The order is refused, and refused for the reason
  // the merchant can act on rather than a generic failure.
  const closed = await api.post("/api/orders", {
    data: { locationId: workspace.locationId, serviceType: "pickup", locale: "en", items: [{ menuItemId: menu.items[0].id, quantity: 1 }] },
  });
  expect(closed.status()).toBe(409);
  expect((await closed.json()).error).toBe("ORDERING_NOT_ENABLED");

  const before = (await (await api.get(`/api/staff/settings?locationId=${workspace.locationId}`)).json()) as Settings;
  expect(before.orderingEnabled).toBe(false);
  expect(before.tableCount).toBe(0);

  const saved = await api.put("/api/staff/settings", {
    data: {
      locationId: workspace.locationId,
      orderingEnabled: true,
      serviceSettings: {
        openingHours: OPEN_ALL_WEEK,
        deliveryFeeMinor: "2500",
        minimumOrderMinor: "5000",
        taxBasisPoints: 1500,
        prepMinutes: 20,
        serviceArea: { postalCodes: ["8001"] },
      },
    },
  });
  expect(saved.status()).toBe(200);
  const after = (await saved.json()) as Settings;
  expect(after.orderingEnabled).toBe(true);
  expect(after.serviceSettings.taxBasisPoints).toBe(1500);

  // A setting the merchant could not act on is refused, and the refusal names
  // the field instead of accepting it and failing at the till.
  const malformed = await api.put("/api/staff/settings", {
    data: { locationId: workspace.locationId, orderingEnabled: true, serviceSettings: { openingHours: { "1": [["08:00", "25:00"]] } } },
  });
  expect(malformed.status()).toBe(400);
  expect((await malformed.json()).error).toBe("INVALID_OPENING_HOURS");

  // A table, so the room is bookable.
  const table = await api.post("/api/staff/tables", {
    data: { locationId: workspace.locationId, name: "T1", capacity: 4 },
  });
  expect(table.status()).toBe(201);
  const tableId = ((await table.json()) as { tableId: string }).tableId;

  const booked = await api.post("/api/staff/reservations", {
    data: {
      locationId: workspace.locationId,
      startsAt: new Date(Date.now() + 3 * 24 * 3600_000).toISOString(),
      endsAt: new Date(Date.now() + 3 * 24 * 3600_000 + 90 * 60_000).toISOString(),
      partySize: 2,
      customerName: "Grace",
      tableId,
    },
  });
  expect(booked.status()).toBe(201);

  // The table now carries a booking, so it cannot be taken out from under it.
  const remove = await api.delete(`/api/staff/tables?locationId=${workspace.locationId}&tableId=${tableId}`);
  expect(remove.status()).toBe(409);
  expect((await remove.json()).error).toBe("TABLE_HAS_BOOKINGS");

  // The storefront takes the order, and the price, fee and tax come from the
  // settings that were just saved — not from the request.
  const placed = await api.post("/api/orders", {
    data: {
      locationId: workspace.locationId,
      serviceType: "delivery",
      locale: "en",
      items: [{ menuItemId: menu.items[0].id, quantity: 1 }],
      deliveryAddress: "3 Short Street",
      deliveryPostalCode: "8001",
    },
  });
  expect(placed.status()).toBe(201);
  const order = (await placed.json()) as { orderId: string; subtotalMinor: string; taxMinor: string; totalMinor: string };
  expect(order.subtotalMinor).toBe("9500");
  // Tax is the rate on the subtotal; the delivery fee is added after it.
  expect(order.taxMinor).toBe("1425");
  expect(order.totalMinor).toBe("13425");

  // The receipt is the document of that same order.
  const receipt = await api.get(`/api/staff/orders/${order.orderId}/receipt`);
  expect(receipt.status()).toBe(200);
  const document = (await receipt.json()) as {
    currency: string; taxBasisPoints: number; subtotalMinor: string; totalMinor: string;
    lines: { name: string; quantity: number }[];
  };
  expect(document.currency).toBe("ZAR");
  expect(document.taxBasisPoints).toBe(1500);
  expect(document.lines).toEqual([{ name: "Bunny chow", quantity: 1, unitPriceMinor: "9500", lineTotalMinor: "9500" }]);

  // And the page a merchant actually uses shows the same truth.
  await page.goto(`/en/settings?location=${workspace.locationId}`);
  await expect(page.getByRole("heading", { name: /Settings Test Cafe/ })).toBeVisible();
  await expect(page.getByText("Taking orders")).toBeVisible();
  await expect(page.getByRole("button", { name: /Save settings/ })).toBeDisabled();
  await expect(page.locator(".op-row", { hasText: "T1" })).toBeVisible();
  await expect(page.getByText("Grace")).toBeVisible();
});
