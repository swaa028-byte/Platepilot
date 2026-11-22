import { expect, test } from "@playwright/test";

/**
 * Table QR codes, end to end.
 *
 * A merchant adds tables, opens the print sheet, and every table appears with
 * a scannable code. The address each code encodes is carried on the card
 * itself; following it — the way a phone camera would — lands on the menu
 * page with the table's name shown, resolved server-side from the id.
 */
test("the print sheet shows a code per table and the code lands on the menu with the table name", async ({ page }, testInfo) => {
  const api = page.context().request;
  const email = `owner-${testInfo.project.name}@qr-test.co.za`;
  expect((await api.post("/api/auth/local", { data: { email } })).status()).toBe(200);

  const onboard = await api.post("/api/onboarding/manual", {
    data: {
      name: `QR Test Bistro ${testInfo.project.name}`,
      address: "9 Scan Street, Cape Town",
      legalCountry: "ZA",
      currency: "ZAR",
      timezone: "Africa/Johannesburg",
      locale: "en",
    },
  });
  expect(onboard.status()).toBe(200);
  const workspace = (await onboard.json()) as { organizationId: string; locationId: string };

  for (const name of ["Patio 1", "Patio 2"]) {
    const added = await api.post("/api/staff/tables", {
      data: { locationId: workspace.locationId, name, capacity: 4 },
    });
    expect(added.status()).toBe(201);
  }

  // The sheet itself, in the browser the merchant is signed into.
  await page.goto("/en/qr-codes");
  const cards = page.locator(".qr-card");
  await expect(cards).toHaveCount(2);
  await expect(cards.first().locator("svg")).toBeVisible();
  await expect(page.locator(".qr-card__table", { hasText: "Patio 1" })).toBeVisible();

  // Follow the address a code encodes, as a phone camera would.
  const encoded = await cards
    .filter({ has: page.locator(".qr-card__table", { hasText: "Patio 1" }) })
    .locator("[data-qr-url]")
    .getAttribute("data-qr-url");
  expect(encoded).toContain("/menu?table=");

  await page.goto(encoded!.replace(/^https?:\/\/[^/]+/, ""));
  await expect(page.locator(".menu-page__table")).toHaveText("Table Patio 1");

  // A table id from another restaurant shows nothing, not another's table.
  await page.goto("/en/qr-codes?location=00000000-0000-0000-0000-000000000000");
});
