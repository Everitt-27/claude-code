#!/usr/bin/env node
// Build the whole application as one self-contained HTML file.
//
// The simulation is compiled to WebAssembly and inlined as base64 alongside the
// JavaScript and CSS, so the page has no external requests at all. That is what
// lets it be published somewhere with a strict content policy — and what lets it
// run from a phone with nothing else switched on.
//
// Usage: node scripts/build-standalone.mjs [output.html] [--artifact]
//
// With --artifact the output is body content only — no doctype, html, head or
// body tags — because the Artifact host supplies those. It also injects the
// viewport metadata itself, since it cannot rely on a head it does not own.

import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const args = process.argv.slice(2);
const artifactMode = args.includes("--artifact");
const output = resolve(
  args.find((a) => !a.startsWith("--")) ?? join(repo, "dist", "corrigible-town.html"),
);

const run = (command, args, options = {}) =>
  execFileSync(command, args, { cwd: repo, stdio: "inherit", ...options });

// --- 1. the simulation ------------------------------------------------------
console.log("building the simulation for wasm32…");
run("cargo", [
  "build",
  "--quiet",
  "--release",
  "-p",
  "ct-wasm",
  "--target",
  "wasm32-unknown-unknown",
]);

const wasmPath = join(repo, "target/wasm32-unknown-unknown/release/ct_wasm.wasm");
if (!existsSync(wasmPath)) {
  console.error(`expected a wasm module at ${wasmPath}`);
  process.exit(1);
}
const wasm = readFileSync(wasmPath);
console.log(`  ${(wasm.length / 1024 / 1024).toFixed(2)} MB of WebAssembly`);

// --- 2. the client ----------------------------------------------------------
console.log("building the client…");
run("npm", ["run", "build", "--workspace", "@corrigible/web"], {
  env: { ...process.env, VITE_CT_STANDALONE: "1" },
});

const dist = join(repo, "apps/web/dist");
const html = readFileSync(join(dist, "index.html"), "utf8");

// --- 3. inline everything ---------------------------------------------------
const assets = join(dist, "assets");
const files = readdirSync(assets).filter((f) => statSync(join(assets, f)).isFile());

const scripts = [];
const styles = [];
for (const file of files.sort()) {
  if (file.endsWith(".js")) scripts.push(readFileSync(join(assets, file), "utf8"));
  if (file.endsWith(".css")) styles.push(readFileSync(join(assets, file), "utf8"));
}

// Vite code-splits by default and the chunks are ES modules that import each
// other by URL. Inlining them individually would break those imports, so the
// build is configured to emit a single chunk; check that it did.
if (scripts.length !== 1) {
  console.error(
    `expected exactly one JavaScript chunk, found ${scripts.length}. ` +
      "The standalone build needs `build.rollupOptions.output.inlineDynamicImports`.",
  );
  process.exit(1);
}

let out = html;

// Drop the tags that point at the emitted files; their contents go inline.
out = out.replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, "");
out = out.replace(/<link[^>]*rel="stylesheet"[^>]*>/g, "");
// The manifest and icon are separate requests a self-contained page cannot make.
out = out.replace(/<link[^>]*rel="manifest"[^>]*>/g, "");

const icon = join(repo, "apps/web/public/apple-touch-icon.png");
if (existsSync(icon)) {
  const dataUri = `data:image/png;base64,${readFileSync(icon).toString("base64")}`;
  out = out.replace(/<link rel="apple-touch-icon" href="[^"]*" \/>/, `<link rel="apple-touch-icon" href="${dataUri}" />`);
  out = out.replace(/<link rel="icon" href="[^"]*" \/>/, `<link rel="icon" href="${dataUri}" />`);
}

const inlined = [
  `<style>${styles.join("\n")}</style>`,
  // The module is handed over as base64 rather than fetched: a self-contained
  // page has nowhere to fetch it from.
  `<script>window.__CT_WASM_B64__=${JSON.stringify(wasm.toString("base64"))};</script>`,
  `<script type="module">${scripts[0]}</script>`,
].join("\n");

if (artifactMode) {
  // The host owns the document; emit only what goes inside it. A single dark
  // visual world is a deliberate choice for this app — it is an instrument
  // panel, not a document — so the page sets its own ground rather than
  // following the viewer's light/dark preference.
  out = [
    "<title>Corrigible Town</title>",
    `<style>${styles.join("\n")}</style>`,
    // The wrapper's head is not ours to write, so make sure the page is
    // actually laid out for the device it is being read on.
    `<script>
(function () {
  var head = document.head;
  if (!head.querySelector('meta[name="viewport"]')) {
    var v = document.createElement("meta");
    v.name = "viewport";
    v.content = "width=device-width, initial-scale=1, viewport-fit=cover";
    head.appendChild(v);
  }
  if (!head.querySelector('meta[name="theme-color"]')) {
    var t = document.createElement("meta");
    t.name = "theme-color";
    t.content = "#0b0e14";
    head.appendChild(t);
  }
  document.documentElement.style.background = "#0b0e14";
})();
</script>`,
    // A 3 MB module takes a moment on a phone; say so rather than showing a
    // blank rectangle. React replaces this the instant it mounts.
    `<div id="root"><div class="boot">
      <h1>Corrigible Town</h1>
      <p class="muted">Starting the simulation…</p>
      <p class="muted small">
        The whole model — two hundred residents, the ledger, the governance
        kernel — is compiled to WebAssembly and runs in this tab.
      </p>
    </div></div>`,
    `<script>window.__CT_WASM_B64__=${JSON.stringify(wasm.toString("base64"))};</script>`,
    `<script type="module">${scripts[0]}</script>`,
  ].join("\n");
} else {
  out = out.replace("</body>", `${inlined}\n</body>`);
}

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, out);
const size = Buffer.byteLength(out) / 1024 / 1024;
console.log(`\nwrote ${output}`);
console.log(`  ${size.toFixed(2)} MB, no external requests`);
if (size > 16) {
  console.error("  WARNING: over the 16 MB artifact limit");
  process.exit(1);
}
