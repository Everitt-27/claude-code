# Emberwild — a tale of the shattered crown

A seamless open-world action-RPG in a single ~280 KB HTML file. Runs on iPhone
(Safari / Add to Home Screen), desktop browsers, and inside a claude.ai Artifact.
No assets, no dependencies, no network, no load screens. A BOTW-scale open world
wearing Diablo's skin: grim palette, gothic HUD, and Diablo/Baldur's-Gate-style
character growth, loot, and company.

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
lazily chunk-by-chunk, so there is never a loading screen. In it: 3 walled-in-life
villages (~11 residents each: 9 named NPCs plus farmers, fishers, woodcutters,
herbalists, children and an armed town watch, 8 huts, a well, a plaza with lamps,
benches and market crates), 6 wayfarer towers, 10 shrine trials, 8 lore stones, ~17 enemy camps
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
- **Diablo camera** — a true isometric-style projection: the ground plane is
  rotated 45° into a diamond grid *and* tilted down, exactly the angle Diablo
  and BG3 shoot from, so roads, rivers, coasts and dungeon rooms all run
  diagonally instead of screen-parallel. Trees, cacti, buildings, props,
  monsters and heroes stand upright on that projected floor, cast offset
  directional shadows, and depth-sort along the camera diagonal; movement input
  is screen-relative (push up = walk into the scene) while combat stays true to
  the world underneath. The camera sits low and close (heroes ~7% of screen
  height, scaled up 12%), a cached **personal light radius** vignettes the
  world away from the hero by day and closes right in at night, and the ground
  itself is de-gridded — meadow tiles share one grass base and every chunk is
  baked with soft organic mottling — so the world reads as terrain, not tiles.
  Rocky highlands rise as fields of stone crags; cave mouths are arched
  openings in standing outcrops; wildlife are shaded 3/4 quadrupeds. Dungeon
  floors render as floating lamplit diamonds in the dark — the classic Diablo
  look — with torchlight and darkness tracking the same projection. World AoE
  telegraphs (boss slams, frost rings, bow lines) are drawn as ground-true
  ellipses through the projection, so what you see is what gets hit.
- **Diablo presentation** — the whole frame is art-directed after Diablo IV.
  The world is graded grim: olive-grey grass, murky water, mud roads, muted
  woods, a cold ash wash over the frame, and long diagonal shadows under every
  tree, wall and body. Characters wear weathered materials — moss cloth,
  oxblood leather, dark iron — layered with belt tassets, fur mantles on heavy
  armor, and war paint. The HUD is the classic layout: a liquid **health orb**
  and resource orb (mana, or stamina before your first spell) flanking a
  notched gold **XP bar** with hero level, gothic dark-metal **skill buttons**
  with gold serif labels, a live **parchment minimap** in a gilt frame (tap it
  for the full map; below ground it becomes the barrow floor plan), a serif
  **zone name · day · clock** row, a gold **quest tracker** (title + goal, like
  a D4 sidebar), and **party frames** — portrait, name, red health bar — for
  every companion. Dialogue, toasts, titles, and damage numbers all speak the
  same gold-on-parchment gothic serif.
- **Articulated characters** — an adult-proportioned rig (roughly 1:6 head-to-body,
  broad shoulders tapering to the hips) built on two-bone inverse-kinematics limbs
  with real knees and elbows and shaded, cylindrical volumes. A natural gait drives
  it: strides land along the direction of travel with foot-lift and knee bend,
  footfall bob, a lean into the run with a trailing scarf, counter-swinging arms,
  breathing at idle, and smoothed turning instead of snap-facing. Armor sets, held
  weapons, helmets and hoods are all read at a glance; the same rig drives NPCs,
  companions and enemies. Horses gallop with paired hoofbeats and suspension bob.
- **Living villages** — every resident is an autonomous agent with an
  occupation and a daily routine simulated around it. Farmers walk out to the
  fields at first light and hoe rows; fishers cast from the banks with real
  rod-and-line; the smith hammers at the forge in showers of sparks;
  woodcutters and hunters commute to the tree line; herbalists forage the
  meadows; children chase each other around the plaza; merchants keep their
  stalls. At dusk everyone drifts to the fire, and at night they walk home,
  yawn, and disappear indoors — while the **town watch** patrols the lamp-lit
  ring all night with spears and mail, and marches on any monster that strays
  near the walls. Villagers flee indoors from danger, murmur occupation-talk
  as they work, greet you when you stop by, and each carries their own
  greeting, gossip and trade dialogue. (It's a fully local behavior
  simulation — schedule-driven agents, no network, still one offline file.)
- **The restless dead** — when true night falls, **zombies claw up out of the
  soil** in the wild dark (the old surface skeletons now stay in their
  barrows). They shamble at half a skeleton's pace with a lurching, weaving
  gait, arms out, in rot-green rags — slow enough to outwalk, stubborn enough
  to pile up if you linger. They crumble at dawn. Villages stay clear:
  lamplight and the watch keep the plaza safe.
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
erasure — plus village populations, occupations, night routines and the
slow-shambling night dead — **73 checks, all passing, zero console errors**, ~17 ms/frame steady
after the adaptive-quality ramp (slow devices are auto-detected within ~3 s and
dropped to a lighter render path).
