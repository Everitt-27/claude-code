# Emberwild — a tale of the shattered crown

A seamless open-world action-adventure in a single ~150 KB HTML file. Runs on iPhone
(Safari / Add to Home Screen), desktop browsers, and inside a claude.ai Artifact.
No assets, no dependencies, no network, no load screens.

## Play it

- **iPhone / iPad**: open `index.html` (or the published artifact link) in Safari →
  Share → **Add to Home Screen**. It runs fullscreen and offline, and autosaves on-device.
- **Desktop**: open `index.html`. WASD + J/K/L/B/E/M/Esc, or click to slash.

## The game

You wake with no memory on a hill of soft grass, a chatty spark named Lumen at your
shoulder. A hundred years ago the Ember Crown shattered; its King sits hollow in the
Sunken Citadel while a violet blight seeps outward. Four Wardens hold the crown's
shards in ruins at the compass points. Take them back.

**A 512×512-tile seeded continent** — meadows, forests, deserts, snowfields, swamps,
rivers, beaches, mountains, and the blighted Citadel — generated lazily chunk-by-chunk,
so there is never a loading screen. It's dotted with:

- **3 villages** (9 NPCs with quests, shops, statues) · **6 wayfarer towers** that chart
  the map and become fast-travel points · **10 shrines** with combat/agility trials that
  grant Spirit Orbs (4 orbs → heart container or stamina vessel at any statue) ·
  **8 lore stones** (read all 8 for a reward) · **~17 enemy camps** with locked chests ·
  **~15 free-standing chests** (some on climbable peaks) · fruit groves, mushrooms,
  bombable boulders, coin bushes.

**Systems**: stamina-gated sprinting, climbing and swimming (BOTW-style freedom — any
rock face is a route if your stamina holds, rain doubles the cost) · day/night cycle
with skeletons after dark · weather · 3-hit combos, charged spin attacks, dodge-roll
with **perfect-dodge slow-mo**, auto-aim bow, bombs · 4 weapon tiers · cooking at
campfires · 4 telegraph-driven Warden minibosses and a 3-phase final boss · autosave
every 12 s and on every milestone (localStorage, with in-memory fallback where storage
is sandboxed).

**Controls (touch)**: left half = floating joystick · ⚔ tap to combo, hold to charge a
spin · ↷ tap to roll, hold to sprint · ➶ hold to aim, release to fire · context pill
appears near anything usable · map + menu top-right. Buttons sit in the natural
right-thumb arc; dialogue is tap-through text boxes.

## Files

- `parts/` — source of truth (CSS/DOM shell + four JS modules)
- `build.sh` — concatenates parts → `game.html` (artifact page content) and
  `index.html` (standalone), and runs `node --check` on the combined JS
- `game.html` / `index.html` — built outputs (committed for convenience)

## Engineering notes (storage & power budget)

- All art is procedural canvas drawing — tiles pre-rendered once into an atlas,
  terrain cached per 16×16-tile chunk (LRU), so steady-state frames blit a handful of
  chunk bitmaps plus entities. Measured ~17 ms/frame average on an emulated phone
  viewport in headless Chromium.
- DPR capped at 2, auto-drops effects and resolution if frame times degrade;
  simulation pauses and saves when the tab is hidden.
- Deterministic world: everything (biomes, POIs, loot) derives from hashed noise on a
  fixed seed — the save file stores only player state and flags (~2–4 KB).
- Audio is a tiny WebAudio synth (pentatonic ambient layers that shift for night,
  combat, and bosses; all SFX synthesized) — zero audio files.

## Testing

`test.mjs` (Playwright, headless Chromium) drives the real build end-to-end on an
iPhone-sized touch context and a desktop keyboard context: boot, world sanity, intro,
dialogue, joystick, combat, roll, NPC quest grant, tower activation, bow, shrine trial,
map fast-travel, pause/eat/equip, boss aggro + shard drop, death/respawn, save/reload
persistence, and frame-time budget — 39 checks, all passing with zero console errors.
