import { expect, test } from "@playwright/test";
import { advanceDays, currentDay, openFreshTown, openTab } from "./helpers";

// The whole playable slice, driven through the interface a person would use.
test("a player can take the town from factory closure to a reviewed policy", async ({ page }) => {
  test.slow();
  await openFreshTown(page);

  // --- the town exists and is legible ------------------------------------
  await expect(page.getByTestId("town-canvas")).toBeVisible();
  await expect(page.getByTestId("glance-unemployment")).toBeVisible();

  // --- advance until the factory closes and the town notices --------------
  await advanceDays(page, 45);
  await expect(currentDay(page)).resolves.toBeGreaterThanOrEqual(45);

  const alerts = page.getByTestId("alerts");
  await expect(alerts).toContainText("Northgate Works has closed");
  await expect(alerts).toContainText("statistics office has flagged hardship");

  // --- the shock is visible in the indicators -----------------------------
  await openTab(page, "dashboard");
  await expect(page.getByTestId("dashboard")).toBeVisible();
  const unemployment = await page
    .getByTestId("dashboard")
    .getByText(/%$/)
    .first()
    .innerText();
  expect(Number.parseFloat(unemployment)).toBeGreaterThan(20);

  // --- choose a response ---------------------------------------------------
  await openTab(page, "governance");
  await expect(page.getByTestId("policy-catalogue")).toBeVisible();
  await page.getByTestId("submit-emergency-income-support").click();

  const proposal = page.getByTestId("proposal-1");
  await expect(proposal).toBeVisible({ timeout: 30_000 });

  // --- the routing decision is explained ----------------------------------
  await page.getByTestId("clerk-classify-1").click();
  await expect(page.getByTestId("routing-1")).toContainText("Elevated to the civic-jury route");
  const worksheet = page.getByTestId("routing-worksheet");
  await expect(worksheet).toContainText("Rights impact");
  await expect(worksheet).toContainText("Fiscal scale");

  // --- the civic jury ------------------------------------------------------
  await page.getByTestId("clerk-jury-1").click();
  await expect(page.getByTestId("jury-panel")).toBeVisible();
  await expect(page.getByTestId("disqualified")).toContainText("screened out");

  // Summonses are answered over the following days, then the clerk briefs the jury.
  await openTab(page, "town");
  await advanceDays(page, 15);
  await openTab(page, "governance");
  await expect(page.getByTestId("evidence-briefs")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("evidence-briefs")).toContainText("The case for");
  await expect(page.getByTestId("evidence-briefs")).toContainText("The case against");

  // --- vote as a juror ----------------------------------------------------
  const seat = page.getByTestId("your-seat");
  await expect(seat).toBeVisible();
  if (await page.getByTestId("vote-approve").isVisible()) {
    await page.getByTestId("vote-approve").click();
    await expect(seat).toContainText("cast your vote", { timeout: 30_000 });
  }

  // --- the jury reports and the policy is enacted -------------------------
  await openTab(page, "town");
  await advanceDays(page, 15);
  await openTab(page, "governance");
  await expect(page.getByTestId("jury-decision")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("council-1")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("stage-1")).not.toContainText("Submitted");

  // --- the policy delivers, and is reviewed against its own criteria ------
  await openTab(page, "town");
  await advanceDays(page, 120);
  await openTab(page, "governance");
  await expect(page.getByTestId("review-1")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("review-1")).toContainText("criteria");
});

test("an outcome can be traced back to the factory closing", async ({ page }) => {
  test.slow();
  await openFreshTown(page);
  await advanceDays(page, 45);

  await openTab(page, "events");
  await expect(page.getByTestId("timeline")).toBeVisible();

  // Find a redundancy and ask why it happened.
  await page.getByTestId("filter-notable").click();
  const redundancy = page
    .getByTestId("timeline")
    .getByRole("button", { name: /lost their job/ })
    .first();
  await expect(redundancy).toBeVisible({ timeout: 30_000 });
  await redundancy.click();

  const trace = page.getByTestId("causal-trace");
  await expect(trace).toBeVisible();
  // The chain of causes ends at the closure and names nobody else's redundancy.
  const narrative = page.getByTestId("causal-narrative");
  await expect(narrative).toContainText("Northgate Works closed");
  await expect(await narrative.locator("li").count()).toBeLessThan(5);
  // Every event says who acted and under which ruleset.
  await expect(trace).toContainText("Ruleset");
  await expect(trace).toContainText("actor.kernel");

  // The chain is clickable: stepping to a cause re-roots the trace.
  const cause = page.getByTestId("trace-nodes").getByRole("button", { name: /closed/ }).first();
  await cause.click();
  await expect(page.getByTestId("causal-trace")).toContainText("Northgate Works");
});

test("a branch can be created and compared against the original", async ({ page }) => {
  test.slow();
  await openFreshTown(page);
  await advanceDays(page, 45);

  // Fork here, before any policy decision is taken.
  await openTab(page, "branches");
  await page.getByTestId("branch-label").fill("no intervention");
  await page.getByTestId("create-branch").click();
  await expect(page.getByTestId("branch-table")).toContainText("no intervention");

  // Intervene on the original branch only.
  await openTab(page, "governance");
  await page.getByTestId("submit-emergency-income-support").click();
  await expect(page.getByTestId("proposal-1")).toBeVisible({ timeout: 30_000 });

  await openTab(page, "town");
  await advanceDays(page, 90);

  // Run the alternative branch forward too.
  await openTab(page, "branches");
  await page.getByTestId("switch-no intervention").click();
  await openTab(page, "town");
  await advanceDays(page, 90);

  await openTab(page, "branches");
  const comparison = page.getByTestId("comparison");
  await expect(comparison).toBeVisible({ timeout: 30_000 });
  await expect(comparison).toContainText("Evictions");
  await expect(comparison).toContainText("Municipal cash");
  await expect(comparison).toContainText("Households in arrears");
});

test("the simulation survives a reload", async ({ page }) => {
  await openFreshTown(page);
  await advanceDays(page, 30);
  const day = await currentDay(page);

  await page.reload();
  await expect(page.getByTestId("town-map")).toBeVisible();
  await expect
    .poll(async () => currentDay(page), { timeout: 60_000 })
    .toBe(day);
});

test("the map overlays change what the town shows", async ({ page }) => {
  await openFreshTown(page);
  await advanceDays(page, 45);

  await page.getByTestId("overlay-select").selectOption("rentStress");
  await expect(page.getByText("Notice served")).toBeVisible();
  await page.getByTestId("overlay-select").selectOption("serviceAccess");
  await expect(page.getByText("Needs met")).toBeVisible();
});
