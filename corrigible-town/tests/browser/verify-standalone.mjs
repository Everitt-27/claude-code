import { chromium, devices } from "@playwright/test";

const file = process.argv[2];
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const context = await browser.newContext({ ...devices["iPhone 14 Pro"] });
const page = await context.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text()}`);
});

await page.goto(`file://${file}`);
await page.getByTestId("town-map").waitFor({ timeout: 60000 });
console.log("✓ page loaded and the wasm engine started");

for (const n of [30, 15]) await page.getByTestId(`advance-${n}`).tap();
await page.waitForFunction(
  () => /Day\s+45/.test(document.querySelector('[data-testid="sim-date"]')?.textContent ?? ""),
  { timeout: 60000 },
);
console.log("✓ time advanced to day 45 (the factory has closed)");

const alerts = await page.getByTestId("alerts").innerText();
if (!alerts.includes("Northgate Works has closed")) throw new Error("no closure alert");
if (!alerts.includes("flagged hardship")) throw new Error("no hardship alert");
console.log("✓ alerts fired");

await page.getByTestId("tab-governance").tap();
await page.getByTestId("submit-emergency-income-support").tap();
await page.getByTestId("proposal-1").waitFor({ timeout: 30000 });
await page.getByTestId("clerk-classify-1").tap();
await page.getByTestId("routing-worksheet").waitFor({ timeout: 30000 });
const routing = await page.getByTestId("routing-1").innerText();
if (!routing.includes("Elevated to the civic-jury route")) throw new Error("routing wrong");
console.log("✓ proposal submitted, classified and routed to the civic jury");

await page.getByTestId("clerk-jury-1").tap();
await page.getByTestId("jury-panel").waitFor({ timeout: 30000 });
console.log("✓ civic jury drawn with conflicts screened");

await page.getByTestId("tab-town").tap();
for (const n of [15]) await page.getByTestId(`advance-${n}`).tap();
await page.waitForTimeout(3000);
await page.getByTestId("tab-governance").tap();
await page.getByTestId("evidence-briefs").waitFor({ timeout: 30000 });
console.log("✓ competing evidence briefs published");

if (await page.getByTestId("vote-approve").isVisible()) {
  await page.getByTestId("vote-approve").tap();
  await page.waitForTimeout(1500);
  console.log("✓ voted as a juror");
}

await page.getByTestId("tab-events").tap();
await page.getByTestId("filter-notable").tap();
const redundancy = page
  .getByTestId("timeline")
  .getByRole("button", { name: /lost their job/ })
  .first();
await redundancy.waitFor({ timeout: 30000 });
await redundancy.tap();
await page.getByTestId("causal-trace").waitFor({ timeout: 30000 });
const narrative = await page.getByTestId("causal-narrative").innerText();
if (!narrative.includes("Northgate Works closed")) throw new Error("causal trace broken");
console.log("✓ causal trace reaches the factory closure");

await page.getByTestId("tab-branches").tap();
await page.getByTestId("branch-label").fill("no intervention");
await page.getByTestId("create-branch").tap();
await page.waitForTimeout(2000);
const table = await page.getByTestId("branch-table").innerText();
if (!table.includes("no intervention")) throw new Error("branch not created");
console.log("✓ branch forked");

await page.getByTestId("tab-dashboard").tap();
await page.getByTestId("dashboard").waitFor();
const overflow = await page.evaluate(() => ({
  doc: document.documentElement.scrollWidth,
  win: window.innerWidth,
}));
if (overflow.doc > overflow.win + 1) throw new Error(`horizontal overflow: ${JSON.stringify(overflow)}`);
console.log("✓ dashboard renders with no horizontal overflow");

await page.screenshot({ path: process.argv[3] ?? "/tmp/standalone.png" });

if (errors.length) {
  console.log("\nconsole/page errors:");
  for (const e of errors.slice(0, 10)) console.log("  " + e);
}
await browser.close();
console.log("\nALL CHECKS PASSED");
