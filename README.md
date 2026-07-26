# 無限城 — Infinity Castle

An endless procedural descent through a shifting castle, rendered in real time with Three.js. Take wing as a crow, cross streaming districts and landmarks, and use a seed to revisit or share a generated world.

## Highlights

- Deterministic, seed-based castle generation
- Three-layer world streaming for rooms, landmarks, and distant districts
- Moving districts with collision-aware flight
- Automatic quality tiers for desktop and touch devices
- Synthesized wind, wing, biwa, and taiko audio with no external assets
- Mouse, keyboard, and touch controls
- Developer galleries for inspecting procedural parts and room modules

## Requirements

- A current browser with WebGL 2 and Web Audio support
- Node.js 24 (see `.nvmrc`)
- npm 11 or newer

## Getting Started

```sh
npm install
npm run dev
```

Open the local URL printed by Vite, then select **Take Wing**. To load a repeatable castle, add a seed to the URL:

```text
http://localhost:5173/?seed=99
```

## Controls

### Desktop

| Input | Action |
| --- | --- |
| Mouse, arrow keys, or `A` / `D` | Steer |
| `Space`, `W`, or primary click | Surge forward |
| `Shift`, `S`, or secondary click | Brake and hover |
| `C` | Toggle first-person camera |
| `R` | Generate a new castle |
| `M` | Toggle audio |

### Touch

| Input | Action |
| --- | --- |
| Left stick | Steer |
| Drag on the right side | Look |
| **Flap** | Surge forward |
| **Brake** | Brake and hover |

The in-game settings panel also controls quality, castle motion, inverted Y input, collision, audio, and the current seed.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm run typecheck` | Check TypeScript without emitting files |
| `npm run build` | Create a production build in `dist/` |
| `npm run preview` | Preview the production build locally |

## Developer Galleries

The development routes reuse the production geometry pipeline in an orbit-controlled scene:

- `?dev=parts` displays individual architecture kit pieces.
- `?dev=modules` displays complete generated room modules.

For example: `http://localhost:5173/?dev=parts`.

## Architecture

```text
src/
├── audio/    Web Audio synthesis
├── core/     renderer, quality scaling, and seeded randomness
├── dev/      procedural geometry galleries
├── fx/       sky, motes, and post-processing
├── input/    desktop and touch input normalization
├── kit/      reusable geometry and materials
├── physics/  collision and escape handling
├── player/   crow, flight model, and camera rig
├── ui/       intro, HUD, controls, and settings
└── world/    generation, districts, landmarks, motion, and streaming
```

The world streamer builds nearby cells within a per-frame time budget, keeps landmarks at a wider radius, and replaces distant districts with inexpensive proxies. Each district owns one transform so the castle can move without breaking its generated structure.

## Community

- Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing a change.
- Follow the standards in [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) when participating.
- Report vulnerabilities privately according to [SECURITY.md](SECURITY.md).

## License

Licensed under the [MIT License](LICENSE).