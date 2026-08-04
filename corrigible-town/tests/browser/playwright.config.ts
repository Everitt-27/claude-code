import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// Some environments ship a Chromium build that does not match the Playwright
// version pinned here. When that happens, point Playwright at the browser that
// is actually installed rather than downloading another copy.
const preinstalled = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const executablePath = existsSync(preinstalled) ? preinstalled : undefined;

// The browser suite drives the real stack: the Rust server, the Vite dev server
// and a real browser. It is slow on purpose — it is the only test that proves a
// person can actually play the thing.
//
// The server runs against PostgreSQL when DATABASE_URL is set and falls back to
// the in-memory store otherwise, so `npm run test:browser` works on a clean
// checkout with nothing else running.
const serverPort = process.env.CT_TEST_SERVER_PORT ?? "8788";
const webPort = process.env.CT_TEST_WEB_PORT ?? "5174";

export default defineConfig({
  testDir: "./specs",
  // One worker: the tests share a server process and create towns in it.
  workers: 1,
  fullyParallel: false,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        viewport: { width: 1440, height: 900 },
        // No `channel`: a channel would override the explicit executable.
        launchOptions: executablePath ? { executablePath } : {},
      },
    },
  ],
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 20_000,
  },
  webServer: [
    {
      command: `cargo run --quiet -p ct-server --bin ct-server`,
      cwd: "../..",
      env: {
        CT_BIND: `127.0.0.1:${serverPort}`,
        CT_SCENARIO_DIR: "scenarios",
        CT_LOG: "warn",
      },
      url: `http://127.0.0.1:${serverPort}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: `npm run dev --workspace @corrigible/web -- --port ${webPort} --strictPort`,
      cwd: "../..",
      env: { CT_SERVER_URL: `http://127.0.0.1:${serverPort}` },
      url: `http://127.0.0.1:${webPort}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
