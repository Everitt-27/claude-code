# Yellow Emperor · Kitting

A dedicated, offline‑capable **kitting tool** for a manufacturing/compounding workflow.
It looks and moves like an iOS app (grouped lists, toggles, slide‑up sheets, bottom tab bar),
imports Fishbowl inventory reports as‑is, and turns a kit into the **Material & Packaging Kit Form**
(control document) with a clean, URL‑free PDF.

Everything is a **single self‑contained `index.html`** — no build step, no server, no external
requests. Open it in any browser (desktop or iOS Safari → *Add to Home Screen*). All data lives in
the browser (`localStorage`).

## What it does

- **Import Fishbowl CSV** (`InvQtys.csv` format, exact columns/order) by drag‑and‑drop or the Import
  button. Importing **replaces the sample data**, including locations. Nothing to edit in the export
  first.
- **Inventory** grouped by part with search, expiry flags, and per‑lot actions:
  - **Move** stock into an In‑Process (IP) location (and **Return** it back out later).
  - **Cycle** to correct or zero a counted quantity.
- **In‑Process map** — a visual grid of Packaging / Herb IP slots showing which are **occupied**
  (amber, with qty) vs **open** (dashed). You pick a slot instead of typing an IP number, and you may
  pick an **occupied** slot so a packaging kit can share the same IP # as its herb kit.
- **Kitting** — a live **kit list** that collapses to a corner bubble and expands back:
  - Transfer stock from inventory into the kit's IP (with a paper‑toss animation into the bubble).
  - Fulfil a required item from **multiple lots / locations** — progress shows *"X of Y transferred."*
  - Drag to reorder, edit, delete, or return lines. Delete the whole kit (returns stock).
- **Master Formula** intake — choose **Herb** (Ingredients sections) or **Packaging** (Packaging
  section) first; upload the sheet for reference; paste text to auto‑parse or use the quick grid; or
  pick a batch from the customer's file to auto‑populate. Start a kit straight from the formula.
- **Batch #** is a dropdown populated from the selected **customer's file**; picking one auto‑fills
  the product and the required items.
- **Material & Packaging Kit Form** — matches `Kit_Form_2026.PDF`. All fields editable until you
  print. **Amount (In‑Process), UOM and # of Packages are left blank** to fill in by hand. **Print**
  and **Save PDF** produce a clean control document **with no web address in the margins**; **CSV**
  exports the rows. Lines print in the order of the list.
- **Overview** — an Asana‑style board of your real kits (Building / Ready to Print / Complete) with
  drag‑to‑change‑status, summary tiles, and a recent‑activity feed.
- **Settings** — import/export inventory CSV, full JSON backup/restore, light/dark/auto theme, reset
  to sample data.

## Run it

- **Open `index.html`** directly in a browser, **or**
- Use the hosted Artifact link shared in the chat (works on iOS + desktop).

For the cleanest printed control document, printing from the file/desktop is most reliable
(**Save PDF** always produces a URL‑free PDF regardless of environment).

## Data model notes

- A location string like `Main-In Process 25 (Packaging)` or `Main-Herbs 14 In Process` is parsed
  into an IP slot (kind + number). Occupancy is derived from live inventory plus open kits.
- Moving stock into a kit decrements the source lot and increases the IP location — so inventory
  always reflects "what's left after kitting."
