# Three.js Playground — Design Spec

**Date:** 2026-06-27  
**Status:** Approved

## Goal

A minimal, single-canvas Three.js playground for open-ended experimentation. Simple enough to start immediately, structured enough to add experiments without rewriting.

## Toolchain

- **Vite** — dev server with hot module reload, zero-config bundling
- **three** (npm) — imported via ES modules, gives access to all addons cleanly

## Project Structure

```
three-js-shenanigans/
├── index.html          # single page, mounts the canvas full-viewport
├── src/
│   └── main.js         # all scene setup and experiments live here
├── public/             # static assets (textures, models) added as needed
├── package.json
└── vite.config.js      # minimal defaults
```

## `main.js` Layout

Sections in order:

1. **Scene, camera, renderer** — created once; renderer fills the viewport
2. **Lights** — ambient + directional as a baseline
3. **Experiments** — objects, materials, geometry added here
4. **Animation loop** — `requestAnimationFrame` loop; per-frame update logic here
5. **Resize handler** — updates camera aspect and renderer size on window resize

OrbitControls attached by default so mouse orbit/zoom/pan works from the first run.

## Scaling Path

When `main.js` grows, individual experiments can be extracted to `src/<name>.js` and imported. No Vite config changes needed — it handles ES module imports natively.
