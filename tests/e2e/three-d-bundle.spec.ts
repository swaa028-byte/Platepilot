import { expect, test } from "@playwright/test";

/**
 * Verifies the signature 3D feature stays opt-in: the Three.js / FloorScene bundle
 * must not be requested when a user opens the floor planner, and must only be
 * requested after an explicit "Load 3D view" action.
 */
test("3D bundle loads only after an explicit opt-in", async ({ page }) => {
  const urls: string[] = [];
  page.on("request", (request) => urls.push(request.url()));

  await page.goto("/en/floor-planner");
  await expect(page.getByRole("heading", { name: "Add your floor plan" })).toBeVisible();

  const threeDRequests = () =>
    urls.filter((url) => /FloorScene|three\.module|three-/.test(url));

  expect(threeDRequests()).toEqual([]);

  // Give the room a real size and a table so the 3D view has authorized data.
  await page.getByLabel("Width (metres)").fill("8");
  await page.getByLabel("Depth (metres)").fill("6");
  await page.getByRole("button", { name: "Apply dimensions" }).click();
  await page.getByRole("button", { name: "Add table" }).click();
  await expect(page.locator(".floor-table").first()).toBeVisible();

  // Editing the floor plan must still not pull the 3D bundle.
  expect(threeDRequests()).toEqual([]);

  // Opting in is still not enough: the user must explicitly load the 3D view.
  await page.getByRole("button", { name: "3D view" }).click();
  await expect(page.getByRole("button", { name: "Load 3D view" })).toBeVisible();
  expect(threeDRequests()).toEqual([]);

  await page.getByRole("button", { name: "Load 3D view" }).click();
  await expect(page.locator("canvas").first()).toBeVisible({ timeout: 20_000 });
});
