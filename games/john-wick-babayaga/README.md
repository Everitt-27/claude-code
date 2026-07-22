# BABA YAGA — Neon Requiem

A self-contained **2.5D John Wick–style gun-fu platformer**. One HTML file, no
dependencies, no build step, no network. Runs on desktop browsers and on mobile
(designed and tested for iPhone 15 Pro Max, landscape).

## Run it

Open `index.html` in any modern browser. On a phone, add it to your Home Screen
for a full-screen, notch-aware experience. That's it — everything (art, audio,
physics) is generated at runtime.

## Controls

| Action | Keyboard / Mouse | Touch |
| --- | --- | --- |
| Move | `A` `D` / `←` `→` | Left thumbstick |
| Jump | `W` / `Space` / `↑` | **JUMP** (or flick stick up) |
| Fire | `J` / Left-click (hold) | **FIRE** (hold) |
| Strike (melee / pistol-whip) | `K` / Right-click | **STRIKE** |
| Dash / dodge (i-frames) | `Shift` | **DASH** |
| **Finisher** | `E` / tap the prompt | Tap the pulsing **EXECUTE** ring |
| Wick-Time (bullet-time) | `F` | **FOCUS** |
| Reload | `R` | auto |
| Swap to fists | `Q` | **FIST** |
| Pause | `P` / `Esc` | ⏸ |

Aim is mouse-driven on desktop and auto-assisted toward the nearest threat on
touch, so the game stays one-handed-playable on a phone.

## Features

- **Gun-fu combat** — pistols, SMG, shotgun, carbine, knife and fists, each with
  distinct damage, cadence, spread and recoil. Headshots crit.
- **Dynamic finishers** — stun or weaken an enemy and a pulsing on-screen
  **EXECUTE** button appears over them. Cash it in for a stylised Wick takedown
  (gun-fu, blade, judo… or a pencil), full i-frames, and a big reward.
- **Kills feed you** — every kill returns health and/or ammo. Ranged kills favor
  ammo, melee kills favor health, finishers give a large chunk of both.
- **Level up** — earn XP, then choose from roguelite perk cards that increase how
  much each kill heals/reloads you, plus damage, fire rate, lifesteal, crit,
  Wick-Time, finisher reach, coin/XP gain and more.
- **Loot the world** — pick up any weapon dropped by a downed enemy or found in
  the environment; grab ammo, gold (Continental coins) and health orbs.
- **Wick-Time** — a focus meter you charge with kills and spend to slow the world
  while you stay fast.
- **Escalation** — combo multiplier, endless chapters that ramp difficulty, elite
  bosses, and enemy archetypes (thug, enforcer, bruiser, sniper, elite).
- **Neon-noir presentation** — parallax rain-slicked skyline, muzzle flashes,
  shell casings, blood, screen shake, hitstop, vignette, and a synthesised
  audio kit (gunfire, rain ambience, finisher stingers) built with the Web Audio
  API — all procedural, zero assets.

## Notes

Best score is saved locally in your browser. Everything degrades gracefully:
audio initializes on first input (mobile autoplay rules), `localStorage` and
`navigator.vibrate` are guarded, and the renderer caps device-pixel-ratio and
particle counts to stay smooth on phones.
