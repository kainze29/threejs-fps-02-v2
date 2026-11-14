# NEON TIDE

A round-based tactical FPS in a rainy neon harbor at night, built with three.js
0.187.0 for the make.fun bounty `threejs-fps-02`. Static files only: open
`game/index.html` in a desktop browser and play single-player against bots. No
build step, no network requests.

## The game

Two teams fight over a harbor at night: the teal **Tidebreakers** against the
magenta **Wardens**. Rain falls, the skyline glows, and three lanes (west
alley, mid dock, east pier) connect the spawns to the uplink terminal.

- **5v5, first to 5 rounds** (max 9), sides swap after round 4.
- **Buy phase (15 s)** then a **100 s round**. Money carries between rounds.
- **Objective:** the attackers carry a data-core to the uplink terminal (the
  magenta ring on the north side) and channel it for 3 s while holding E. If
  the carrier dies, the core drops and any attacker can pick it up. Defenders
  win by elimination or by running the clock out.
- **Tide Surge** on rounds 3, 6 and 9: gravity drops to 0.45x and movement
  speed rises 25%, with a banner and a HUD badge.
- **Economy:** start $800, kill +$300, round win +$3000, round loss +$1900 plus
  a loss-streak bonus up to +$1000, uplink complete +$300.
- **Arsenal:** P9 Tide pistol (free), Kestrel-9 SMG $1500, Tempest AR $2700,
  Longshot DMR $4200, Harbor Plating armor $650 (absorbs 50%), and three
  gadgets: Mist Orb smoke $400, Strobe Orb flash $300, Echo Drone decoy $500.
- **Bots:** 9 named bots in five styles (rusher, holder, flanker, marksman,
  support) with waypoint navigation, line-of-sight plus field-of-view plus
  smoke awareness, gunfire hearing, and burst fire with per-style aim error
  and reaction time.
- **HUD:** health, armor, ammo, money, round timer, team score, objective
  line, carrier tag, surge badge, minimap, killfeed, dynamic crosshair,
  hitmarker, damage vignette, flash overlay, round banners, and a buy menu.
- **Sound:** everything is synthesized with WebAudio: a distinct sound per
  weapon, reload, hit and kill ticks, hurt, buy, uplink tick, win and lose
  stingers, a surge swell, and rain ambience.

## Controls

| Input | Action |
| --- | --- |
| Click the view | Capture the mouse (pointer lock) |
| WASD | Move |
| Mouse | Aim |
| Click | Fire (hold for automatics) |
| R | Reload |
| Q | Swap primary / pistol |
| G | Use gadget (smoke, then flash, then decoy) |
| E (hold) | Channel the uplink while carrying the core |
| Space | Jump |
| 1-7 / click | Buy during the buy phase |
| Enter / DEPLOY | Start the round |

## Files

- `game/` — the whole game: `index.html` (one import map for `three`),
  `three.module.min.js` + `three.core.min.js` (three.js 0.187.0, vendored
  byte-for-byte), and `src/` with the game code.
- `screenshots/` — four real renders of the game: menu, buy phase, live
  action, and a Tide Surge round.
- `vendor/makefun-threejs.ts` — the kit's dossier library, unchanged.
- `main.ts` — the entrypoint: copies `game/` and `screenshots/` to `/output`
  and writes `/output/dossier.json`.

## Run it locally

```sh
node serve.ts
# open http://localhost:8080
```

## Test hooks

Load the game with `?test=1` to expose `window.__NT` (state, stepping, and
control hooks used by the automated playtest). Load it with
`?shot=menu|buy|action|surge` to stage a deterministic scene for screenshots.
