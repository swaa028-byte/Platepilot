import { expect, test } from "@playwright/test";

test("public home, health and unconfigured authentication stay honest", async ({ page, request }) => {
  await page.goto("/en");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Service has enough moving parts.");
  await expect(page.getByRole("link", { name: "Set up your restaurant" }).first()).toBeVisible();
  expect((await request.get("/api/health")).status()).toBe(200);
  await page.goto("/en/login");
  await expect(page.getByText("Authentication needs configuration")).toBeVisible();
  await expect(page.getByRole("button", { name: "Email me a sign-in link" })).toHaveCount(0);
});

test("locale routes preserve language and Arabic direction", async ({ page }) => {
  await page.goto("/fr");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Le service a assez");
  await page.goto("/ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("للخدمة أجزاء");
});

test("floor planner creates a real local draft and keeps 3D opt-in", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/en/floor-planner");
  await expect(page.getByRole("heading", { name: "Add your floor plan" })).toBeVisible();
  expect(requests.filter((url) => /FloorScene|three\.module|three-/.test(url))).toEqual([]);
  await page.getByLabel("Width (metres)").fill("8");
  await page.getByLabel("Depth (metres)").fill("6");
  await page.getByRole("button", { name: "Apply dimensions" }).click();
  await page.getByRole("button", { name: "Add table" }).click();
  const table = page.locator(".floor-table").first();
  await expect(table).toBeVisible();
  await table.focus();
  await page.keyboard.press("ArrowRight");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("platepilot.floor-draft.v1")!));
  expect(stored.tables).toHaveLength(1);
  expect(stored.tables[0].x).toBeGreaterThan(0.5);
  await page.reload();
  await expect(page.locator(".floor-table")).toHaveCount(1);
  await page.getByRole("button", { name: "3D view" }).click();
  await expect(page.getByRole("button", { name: "Load 3D view" })).toBeVisible();
  await page.getByRole("button", { name: "2D plan" }).click();
  await expect(page.locator(".floor-table")).toBeVisible();
});

test("manual onboarding and real CSV preview do not invent a workspace", async ({ page }) => {
  await page.goto("/en/onboarding");
  await expect(page.getByText("Google discovery is not configured.")).toBeVisible();
  await page.getByRole("button", { name: "Enter restaurant details manually" }).click();
  await page.getByLabel("Restaurant name", { exact: true }).fill("Test merchant input");
  await page.getByLabel("Location address").fill("1 Test Street");
  await page.getByLabel("Legal country / region code").fill("GB");
  await page.getByLabel("Operating currency").selectOption("GBP");
  await page.getByRole("button", { name: "Continue to menu" }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "menu.csv", mimeType: "text/csv", buffer: Buffer.from("category,item,amount,currency,available\nMains,Merchant item,12.50,GBP,true") });
  await expect(page.getByRole("cell", { name: "Merchant item" })).toBeVisible();
  await expect(page.getByText("12.50 GBP")).toBeVisible();
  await expect(page.getByText("Sign in to create a workspace or publish a menu.")).toBeVisible();
});
