# Floor Is Lava

An endless first-person parkour score attack built with Three.js. Chain jumps, ledge grabs, wall runs, and rail grinds across a procedurally generated course above the lava. Works on desktop and mobile.

## Setup

```bash
npm install
npm run dev
```

## Controls

**Desktop:** WASD to move, Space to jump, E to kick while airborne, mouse to look

**Mobile:** Left-side joystick to strafe, release the right side to jump, tap while airborne to air jump, and use two fingers while airborne to kick. Forward movement and camera tracking are automatic.

## Tech

- [Three.js](https://threejs.org/) r185
- Vite
- Custom physics, procedural course generation, humanoid animation
- Seeded course generation with deterministic validation tests

## Development

- `npm test` runs course-generation and gameplay regression tests.
- `npm run build` creates the game and asset-viewer production pages.
- In development, F2 opens the tuning menu, H toggles hitboxes, and F cycles camera modes.
