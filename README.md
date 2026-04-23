# Cube Algorithm Search (Web)

Browser-based SPA for finding short Rubik's Cube algorithms that transform a given start state into a target state. The target may include "don't care" stickers, so you can search for algorithms that match a partial pattern (e.g. a specific OLL/PLL case while ignoring the rest of the cube).

Ported from the Python/Tkinter version to TypeScript + React. No backend — runs entirely in the browser.

## Features

- Interactive 2D cube net (paintable) and isometric 3D preview for both start and target states.
- Execute move sequences directly on a state (supports HTM, slice, wide, and rotations; lowercase `r u l d f b` aliased to wide moves).
- Configurable move set: HTM, slice, wide, rotations, per-move toggles, and presets (including a "doubles only" preset).
- Grouped output: 4-move commutator patterns `[A B A' B']` wrapped in parentheses for readability.
- Reports elapsed time and nodes explored.
- Saved named states, user-named algorithms, search history and stats — all persisted in `localStorage`.
- Parallel search via Web Workers (one job per first-move partition), sized by `navigator.hardwareConcurrency`.

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Output in `dist/` — deploy as static files anywhere (relative asset paths).

## Search methods

- **iddfs** (default) — iterative-deepening DFS. Supports don't-care targets. Move pruning (same-face, opposite-face canonical order) + admissible mismatch heuristic.
- **bidir** — bidirectional BFS. Full concrete target only. Big speedup at depth 9+.
- **parallel** — multi-worker DFS, partitioned by first move. Cancel works; no progress reporting during runs.

## Keyboard

With a cube net focused:
- `r u l d f b m e s x y z` — apply CW quarter turn (any case).
- `Shift` + key — prime turn.
- `Alt/Option` + key — double turn.

## Port notes

- 54-sticker state, move permutations, and IDDFS/bidir pruning are ported 1:1 from the Python source.
- Persistence switched from JSON files to `localStorage` (keys under `cube-alg-search:*`).
- `multiprocessing` parallel DFS replaced with Web Workers using the same first-move partitioning strategy.
