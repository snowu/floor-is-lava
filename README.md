# Floor Is Lava

A cyberpunk side-scrolling rooftop runner with Mirror's Edge–style movement. You auto-run across a procedurally generated city and keep your momentum by vaulting, sliding, rolling out of drops, grabbing ledges, climbing walls, wall-running, riding ziplines and launching off springboards. The city is cyberpunk, and it drifts through districts as you go: Neon Dusk, Kowloon Night, Acid Rain, Smog Noon and a red-moon Blackout.

## Modes

- **Time Trials** (Sprint 600 m, Relay 1200 m, Gauntlet 2000 m, plus a Daily course seeded by the date). Each trial is a fixed-seed course, identical on every attempt, so times are comparable. The clock counts up, checkpoint splits show green/red deltas against your personal best, and your best run plays back as a cyan ghost. Medals are gold, silver and bronze; silver is the autopilot's time, so it's provably reachable, and gold needs real flow.
- **Endless** is a combo score attack on a fresh random city every run. Every move feeds a combo whose multiplier grows with each chained move and scales with your speed. Keep moving to bank it; a hard landing, a bonk or a fall throws the combo away. Distance also scores, more when you're fast. You have three lives.

Falling never ends a trial. You respawn at the last checkpoint and the clock keeps running, so mistakes cost time. In Endless, a fall also costs a life and your current combo.

## Look

Everything is pixel art drawn in code on a low-resolution canvas, with a chiptune score. Facades, neon signage, holo ads, sky traffic, props, skyline and sky are generated procedurally from curated palettes. Obstacles get their own high-contrast treatment: dark outlined steel, red edges and a pulsing glow, so they read against busy rooftops. The runner is a skeleton with springy joints and a simulated ponytail, rasterized into an outlined sprite at a stepped 24 fps.

## Setup

```bash
npm install
npm run dev
```

## Controls

| | Desktop | Touch | Gamepad |
|---|---|---|---|
| Jump (hold for height; hold into a wall to climb) | Space / W / ↑ | Right side of screen | A / Y |
| Slide, or roll if pressed just before a hard landing | S / ↓ / Shift | Left side of screen | B / X / stick down |
| Focus (slow time once the meter is charged) | E / F / Q | ◎ button | Shoulders / triggers |
| Pause · mute | Esc or P · M | Buttons | Start |
| Instant restart | R | Pause menu | Select |
| Menu | ↑ ↓ then Space · Esc to leave results | Tap | D-pad |

## Movement

- **Vault**: run into anything waist-high and you go over it without losing speed.
- **Slide**: duck under red-striped pipes. Running into one standing up makes you stumble.
- **Roll**: big drops cause a hard landing that kills your speed unless you press slide just before you land.
- **Ledge grab / climb**: jump at walls to grab the edge, and hold jump to run up taller walls.
- **Wall-run**: jump at a red chevron wall to run along it, then jump again to kick off.
- **Zipline**: jump to catch red cables across wide gaps.
- **Springboard**: red ramps launch you up to taller roofs.

Anything you can use is painted runner-vision red.

## Code layout

- `src/sim/` is the pure, deterministic simulation with no rendering or DOM: player physics (`player.js`), seeded course generation with checkpoints and finish lines (`generator.js`), level streaming (`level.js`), trial tracks (`tracks.js`), combo scoring (`score.js`), ghost recording (`ghost.js`), and a lookahead autopilot (`bot.js`) that drives the title-screen demo, the traversal tests and the medal times.
- `src/pixel/` is the renderer: palettes, pixel buffers and dithering, sprite bakers, the skeletal runner sprite, and the view.
- `src/ui/`, `src/input.js` and `src/audio.js` are the HUD, the input layer (keyboard, touch and gamepad), and fully synthesized audio and music.

## Development

- `npm test` runs physics unit tests, sprite and palette checks, generator invariants, scoring and ghost tests, and autopilot runs that drive the real physics through 2.5 km of several seeds and finish every trial within its silver time.
- `npm run build` creates the production build that GitHub Pages deploys.
- `?seed=123` fixes the course seed. In development, F2 opens a tuning panel for physics and chase values.
