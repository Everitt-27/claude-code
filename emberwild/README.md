# Emberwild — a tale of the shattered crown

A seamless open-world action-RPG in a single ~260 KB HTML file. Runs on iPhone
(Safari / Add to Home Screen), desktop browsers, and inside a claude.ai Artifact.
No assets, no dependencies, no network, no load screens. BOTW-style world and art,
Diablo/Baldur's-Gate-style character growth, loot, and company.

## Play it

- **iPhone / iPad**: open `index.html` (or the published artifact link) in Safari →
  Share → **Add to Home Screen**. Fullscreen, offline, autosaves on-device.
- **Desktop**: open `index.html`. WASD · J attack · K roll/sprint · L bow · V spell ·
  B bomb · E interact · T skills · M map · Esc menu — or click to slash.

## The world

You wake with no memory on a hill of soft grass, a chatty spark named Lumen at your
shoulder. A hundred years ago the Ember Crown shattered; its King sits hollow in the
Sunken Citadel while a violet blight seeps outward. Four Wardens hold the crown's
shards in ruins at the compass points. Take them back — or ignore all that and go
fishing. The wild is yours.

A 512×512-tile seeded continent — meadows, forests, deserts, snowfields, swamps,
rivers, beaches, mountains, two harbours, and the blighted Citadel — generated
lazily chunk-by-chunk, so there is never a loading screen. In it: 3 villages
(9 named NPCs), 6 wayfarer towers, 10 shrine trials, 8 lore stones, ~17 enemy camps
(some led by elite "Fierce" foes with guaranteed loot), ~15 free chests, groves,
ore veins, deadfall wood, wildlife (boar, deer, wolves), and a full main-quest arc
with four minibosses, a 3-phase final boss, and an ending that heals the map.

## The systems

- **Action-driven skill tree** — eight paths (Blades, Archery, Agility, Guard,
  Magic, Craft, Charm, Hunt), each fed only by the actions that belong to it:
  swinging swords ranks Blades, sneaking and fishing rank Hunt, talking and
  trading rank Charm. Points spend only inside the path that earned them —
  24 skills total, so no two playthroughs grow alike.
- **Diverse weapons + dual wielding** — swords, daggers, axes, spears, hammers
  across five rarity tiers, each with its own speed, reach, knockback, and attack
  animation (arcs, thrusts, overhead slams). One-handed weapons pair for 4-hit
  dual-wield combos.
- **Durability** — weapons and armor wear slowly with use (hundreds of swings),
  warn near failure, and shatter *forever* at zero. Repair with ore/leather at a
  forge — or anywhere, once you learn the **Blacksmith** skill, which also unlocks
  field crafting and upgrading (+damage tiers) of every weapon and armor recipe.
- **Contextual controls** — buttons exist only when usable: no Bow button without
  a bow, no Spell button before your first spell, the Attack button becomes
  **HOOK!** when a fish bites. Everything situational lives on one context pill.
- **Trust & company** — every named NPC tracks trust from -100 to +100. Kindness,
  gifts, trade, and quests earn discounts, secrets (hidden map reveals), and — for
  four of them — the option to join you. Companions follow, fight with AI suited
  to their class, go down and get helped up, and carry any weapon or armor you
  hand them. Getting caught stealing, or rifling homes, earns the opposite.
- **Property & mounts** — buy homes (rest + respawn), farmland (daily harvest),
  a horse (fast, tireless travel), and a sailing boat that opens the coasts.
  Steal from stalls, search huts, go hunting, or fish any open water.
- **Magic** — five spells (Ember Bolt, Gale Step, Mend, Frost Ring, Storm Call)
  learned from scholars, scrolls, and the Magic path, powered by a regenerating
  mana pool that deepens as you practice.
- **The Diablo layer** — five **Barrow Delve** dungeons: three procedurally
  generated floors of rooms and corridors, rendered in darkness with real
  torch-light radii, packed with monsters, breakable urns, gold piles, champion
  packs, and a floor-3 boss (sometimes The Butcher — "Ah… fresh meat!").
  Loot rolls **magic affixes**: Sharp/Swift/Keen/Brutal/Sturdy prefixes,
  of-the-Bear/Fox/Embers/Frost/Leech/Fortune suffixes, white→blue→gold→orange
  rarities, and five fixed **uniques** (Thornsong, Wolfsbane, Dawnpiercer,
  Gravedigger, Duskfang). Elites carry modifiers (Swift/Molten/Frost/Vampiric).
  Belt-style **health & mana potions** on a quick-use button, **Return Scrolls**
  that open persistent two-way town portals, a **hero level** that dings vitals
  upward, **origins** at creation (Warrior/Rogue/Sorcerer), an optional
  **Hardcore** mode where death erases the save, plus gambling and gear
  vendoring at Zef's.
- **Everything from v1** — stamina-gated climbing/swimming/sprinting, towers,
  shrines→orbs→heart/stamina upgrades, perfect-dodge slow-mo, day/night, weather,
  cooking, fast travel to *any* discovered place, autosave (v1 saves migrate).

## Files

- `parts/` — source (CSS/DOM shell + five JS modules)
- `build.sh` — concatenates parts → `game.html` (artifact page content) and
  `index.html` (standalone), and syntax-checks the combined JS
- `game.html` / `index.html` — built outputs

## Testing

`test.mjs` (Playwright, headless Chromium) plays the real build end-to-end on an
iPhone-sized touch context and a desktop keyboard context: boot → intro → dialogue
→ combat → quests → towers → shrine trial → map travel → bosses → death/respawn,
plus the RPG layer: XP/skill grants, durability wear/repair/breakage, crafting,
dual wield, trust pricing, stealing, companion recruitment and combat, spellcasting,
horse and boat mounts, fishing, contextual button states, save round-trips and
v1 migration — plus the Diablo layer: affix/rarity/unique loot rolls, gear stat
bonuses, potion quick-use, elite modifiers, a full barrow run (descend two floors,
portal to town and back, walk out), hero levels, vendoring, origins, and hardcore
erasure — **70 checks, all passing, zero console errors**, ~17 ms/frame.
