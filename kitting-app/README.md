# Yellow Emperor Kitting

A standalone, import-driven **material & packaging kitting** PWA. Mobile-first for
iPhone 15 Pro Max, dense and usable on desktop. No manufacturing, sales,
purchasing or general-reporting modules — only what supports kitting: Overview,
Inventory, Kits, Fishbowl import, Master Formula / batch-document intake, and the
settings those need. No barcode scanner and no direct Fishbowl connection.

## Stack

- **Vite + React 18 + TypeScript**, installable **PWA** (`vite-plugin-pwa`, offline SW).
- **Zustand + persist** — inventory, kits, movements, batch docs, settings and
  column preferences persist across reloads (localStorage); directory handles
  live in IndexedDB.
- **pdfjs-dist** (native PDF text) + **tesseract.js** (client-side OCR, no API
  secrets) for Master Formula extraction — loaded on demand.
- **pdf-lib** generates the controlled Kit Form PDF — loaded on demand.
- **@dnd-kit** for draggable kit-line reordering.
- **Vitest** for the logic/acceptance tests.

## Run

```bash
cd kitting-app
npm install
npm run dev        # local dev server
npm run build      # type-check + production build + PWA service worker
npm run test       # acceptance/unit tests
npm run lint       # eslint (0 warnings)
npm run typecheck  # tsc project references
```

## Architecture

```
src/
  lib/
    types.ts       Domain model (lot+location inventory, kits, allocations, movements)
    csv.ts         RFC-4180 parser + exact Fishbowl schema validation + import
    engine.ts      Pure inventory/kit engine: moves, returns, edits, reversals, cancel
    formula.ts     Master Formula parsing (herb vs packaging section filtering)
    extract.ts     pdf.js native text + tesseract OCR fallback (browser only)
    kitForm.ts     Kit Form 2026 (WH-0001-MPKF-A-V5) PDF generation via pdf-lib
    locations.ts   In Process location detection + selector data
    exportCsv.ts   Kit → CSV export
    download.ts    Blob download + clean PDF print (iframe, no browser chrome)
    toss.ts        "Crumpled-paper into bin" bubble animation (respects Reduce Motion)
  store/
    useStore.ts    Zustand store (persisted) wrapping the engine
    useUI.ts       Navigation + active-kit bubble + move-target state
  components/       ImportReport, RefreshInventory, MoveSheet, ReturnSheet,
                    NewKitFlow, BatchLibrary, IpSelector, KitBubble, ui primitives
  pages/            Overview, Inventory, Kits, KitDetail, Settings
  styles/global.css iOS design system (light/dark, safe areas, sheets, toggles)
```

## Data model

Inventory is **lot-and-location specific** (one Fishbowl row = one record). Every
CSV column is preserved verbatim in `record.raw`, so nothing is discarded and any
column can be shown/hidden. Required-item amounts (from the Master Formula) are
kept separate from actual transferred amounts; a required item holds multiple
**allocations** (lot / location / amount / UOM / packages / expiration). A
**movement ledger** records every move, return, edit and reversal.

## Acceptance tests

`npm run test` covers, among others:

1. Import the untouched InvQtys report with no mapping (schema validated exactly).
2. Sample inventory/locations are replaced atomically on import.
3. Every CSV column remains accessible and toggleable.
4. Herb kit imports ingredient sections (incl. repeated "Ingredients" and "Other
   Ingredients") but not Packaging.
5. Packaging kit imports Packaging only, not ingredients.
7. One required item allocated across three lots/locations → parent total correct.
8. Partial return adjusts inventory and kit totals correctly.
10. Cancelling a started kit returns all material and never loses/duplicates stock.
12. Kit Form 2026 PDF generates with a valid header and no app URL.

The importer was additionally verified against the genuine 2,810-row InvQtys
export (all 16 columns preserved, quoted commas handled, 363 In Process records).

## Genuine browser limitations

- **Repeated one-click import / batch library**: the File System Access API
  (`showDirectoryPicker`, persisted handles) is used on supported desktop
  browsers so "Refresh Inventory" reloads the newest CSV. iOS Safari does not
  expose it, so the app falls back to the Files document picker / multi-file
  upload — the tightest loop browser security allows.
- **OCR** runs fully on-device (tesseract.js); accuracy on skewed phone photos of
  controlled documents is inherently imperfect, which is why every extraction is
  shown with a confidence score on an editable review screen before it is committed.
