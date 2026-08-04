import { expect, type Page } from "@playwright/test";

/// Start a brand new town. Clearing local storage guarantees the bootstrap
/// creates one rather than resuming whatever the previous spec left behind.
export async function openFreshTown(page: Page) {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto("/");
  await expect(page.getByTestId("town-map")).toBeVisible();
  await expect(page.getByTestId("sim-date")).toContainText("Day 0");
}

/// Advance simulated time by clicking the controls, waiting for the day counter
/// to actually move rather than for an arbitrary timeout.
export async function advanceDays(page: Page, days: number) {
  const before = await currentDay(page);
  const steps: number[] = [];
  let remaining = days;
  for (const size of [30, 15, 7, 1]) {
    while (remaining >= size) {
      steps.push(size);
      remaining -= size;
    }
  }
  for (const step of steps) {
    await page.getByTestId(`advance-${step}`).click();
  }
  await expect
    .poll(async () => currentDay(page), { timeout: 120_000 })
    .toBeGreaterThanOrEqual(before + days);
}

export async function currentDay(page: Page): Promise<number> {
  const text = (await page.getByTestId("sim-date").innerText()).trim();
  const match = text.match(/Day\s+(\d+)/);
  return match ? Number(match[1]) : 0;
}

export async function openTab(page: Page, tab: string) {
  await page.getByTestId(`tab-${tab}`).click();
}
