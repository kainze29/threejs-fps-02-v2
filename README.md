# NEON TIDE

A round-based tactical FPS in three.js. Two crews fight over a rainy neon harbor
at night: the **Tidebreakers** (teal) attack, the **Harbor Wardens** (magenta)
defend. First to 5 rounds takes the harbor, at most 9 rounds, sides swap after
round 4.

## The twist

One team carries a **data-core** to the **uplink terminal** in the north of the
map. The carrier channels it for 3 seconds (hold `E` in the magenta ring) to
win the round outright. If the carrier goes down, the core drops and anyone on
the attacking crew can pick it up. Every 3rd round is a **TIDE SURGE** round:
low gravity, faster movement.

## How to play

Serve `game/` with any static server (`node serve.ts`, then open
http://localhost:8080) and click to play. Desktop browser with WebGL 2.

- `W A S D` move, mouse look, click fire, `R` reload
- `Ctrl`/`C` crouch, `Space` jump
- `1–4` switch weapon (live) or buy (buy phase), `5–7` gadgets
- `B` buy menu, `Enter` deploy, `Q` throw gadget, `E` uplink / hold the core
- `Esc` pause

## Economy

Kills pay $300, round wins $3000, losses $1900 plus a streak bonus, an uplink
pays $300. Spend it between rounds:

| Item | Price | Role |
| --- | --- | --- |
| P9 Tide (sidearm) | free | Reliable backup |
| Kestrel-9 (SMG) | $1500 | Close lanes, bullet hose |
| Tempest AR (rifle) | $2700 | The all-rounder |
| Longshot (DMR) | $4200 | One shot, one down |
| Harbor Plating | $650 | Absorbs half of incoming damage |
| Mist Orb (smoke) | $400 | Blocks sight for 12s |
| Strobe Orb (flash) | $300 | Blinds anyone looking at it |
| Echo Drone (decoy) | $500 | Fake gunfire, draws enemy fire |

## Gunplay

Hitscan weapons with real spread and recoil: firing on the move punishes you,
stopping to aim pays. Headshots deal triple damage (2.6x on the Longshot).
Bots have names and styles: rushers push lanes, holders lock angles, flankers
take the sides, marksmen hold long sightlines, and the support escorts the
carrier. They hear gunfire, react to flashes and smoke, and fight back in
bursts.

## Tech

- three.js 0.187.0, vendored under `game/vendor/three/`, loaded by import map
- Static files only, no build step, no network requests
- Fixed 60 Hz simulation apart from rendering; one module per system
  (`world`, `player`, `bots`, `weapons`, `economy`, `rounds`, `effects`,
  `hud`, `audio`, `input`)
- All sound is synthesized with WebAudio, no audio files

## Screenshots

`?shot=menu|buy|action|surge&seed=1` stages a deterministic frame for capture.
