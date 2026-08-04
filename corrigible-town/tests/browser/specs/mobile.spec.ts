import { expect, test } from "@playwright/test";
import { advanceDays, currentDay, openFreshTown, openTab } from "./helpers";

// The phone suite. It runs at an iPhone viewport with touch input, and it uses
// `tap()` rather than `click()` throughout so that anything depending on a
// mouse would fail here.

/// Nothing may make the page scroll sideways. One overflowing table is enough
/// to make every screen feel broken on a phone, so this is checked everywhere.
async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const { doc, win } = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }));
  expect(doc, "the page scrolls horizontally").toBeLessThanOrEqual(win + 1);
}

test("every screen fits a phone without scrolling sideways", async ({ page }) => {
  test.slow();
  await openFreshTown(page);
  await advanceDays(page, 45);

  // Put a proposal in flight so the governance screen has its widest content:
  // the routing worksheet is a nine-row table.
  await openTab(page, "governance");
  await page.getByTestId("submit-emergency-income-support").tap();
  await expect(page.getByTestId("proposal-1")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("clerk-classify-1").tap();
  await expect(page.getByTestId("routing-worksheet")).toBeVisible();

  for (const tab of ["town", "dashboard", "governance", "events", "branches"] as const) {
    await openTab(page, tab);
    await page.waitForTimeout(500);
    await expectNoHorizontalOverflow(page);
  }
});

test("the controls are big enough to hit with a thumb", async ({ page }) => {
  await openFreshTown(page);

  // 40px is about the smallest target that is reliably hittable; Apple's own
  // guidance says 44.
  for (const id of ["advance-1", "advance-30", "tab-governance", "tab-events"]) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box, `${id} has no box`).not.toBeNull();
    expect(box!.height, `${id} is only ${box!.height}px tall`).toBeGreaterThanOrEqual(38);
  }
});

test("the whole flow works by tapping", async ({ page }) => {
  test.slow();
  await openFreshTown(page);

  await advanceDays(page, 45);
  await expect(currentDay(page)).resolves.toBeGreaterThanOrEqual(45);
  await expect(page.getByTestId("alerts")).toContainText("Northgate Works has closed");

  await openTab(page, "governance");
  await page.getByTestId("submit-emergency-income-support").tap();
  await expect(page.getByTestId("proposal-1")).toBeVisible({ timeout: 30_000 });
  await page.getByTestId("clerk-classify-1").tap();
  await expect(page.getByTestId("routing-1")).toContainText("Elevated to the civic-jury route");

  await page.getByTestId("clerk-jury-1").tap();
  await expect(page.getByTestId("jury-panel")).toBeVisible();

  await openTab(page, "town");
  await advanceDays(page, 15);
  await openTab(page, "governance");
  await expect(page.getByTestId("evidence-briefs")).toBeVisible({ timeout: 30_000 });

  if (await page.getByTestId("vote-approve").isVisible()) {
    await page.getByTestId("vote-approve").tap();
    await expect(page.getByTestId("your-seat")).toContainText("cast your vote", {
      timeout: 30_000,
    });
  }
});

test("a resident on the map can be tapped", async ({ page }) => {
  await openFreshTown(page);
  await advanceDays(page, 30);

  // Markers are a few pixels across at this scale; the hit areas are sized in
  // screen pixels precisely so a thumb can still land on one. Sweep the housing
  // rows rather than guessing a single point.
  const map = page.getByTestId("town-map");
  const box = (await map.boundingBox())!;
  for (let ratioY = 0.3; ratioY <= 0.85; ratioY += 0.06) {
    for (let ratioX = 0.1; ratioX <= 0.9; ratioX += 0.05) {
      await page.touchscreen.tap(
        box.x + box.width * ratioX,
        box.y + box.height * ratioY,
      );
      if (await page.getByTestId("resident-panel").isVisible()) {
        await expect(page.getByTestId("resident-panel")).toContainText("Public record only");
        return;
      }
    }
  }
  throw new Error("no resident marker was hittable anywhere on the map");
});

test("it can be installed on the home screen", async ({ page }) => {
  await page.goto("/");
  // iOS reads these; without them "Add to Home Screen" gives a screenshot icon
  // and opens in a Safari tab rather than standalone.
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveCount(1);

  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  const parsed = await manifest.json();
  expect(parsed.display).toBe("standalone");
  expect(parsed.icons.length).toBeGreaterThan(0);

  const icon = await page.request.get("/apple-touch-icon.png");
  expect(icon.ok()).toBeTruthy();
});
