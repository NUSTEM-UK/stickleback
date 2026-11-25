# Stickleback

Lays out laser-cut construction sticks (lollipop-stick sized, wire-pivot holes) on an A5/A4/A3 sheet,
removes duplicate shared edges, and exports PDF/SVG for an Epilog (via CorelDRAW) plus a reloadable
project file.

Static Svelte 5 + TypeScript app; no server code. Needs Node 20+.

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # geometry, packing, dedup, save/load
npm run check      # type-check
npm run build      # static site in dist/
```

## Model

- Every part is a set of nodes on a square dot grid. A node is **hole**, **solid** (part of the piece, undrilled) or
  **slot** (adjacent slot nodes join into a slot). Empty nodes are absent. Nodes join to 4-neighbours only.
- Outline = union of a disc (diameter = stick width) at each node, a bar between each pair of adjacent nodes,
  and a filled square in each fully occupied 2×2 block. Slots use the same construction at slot width.
- Pitch is per sheet, with an optional per-part override.
- Kerf is subtracted from hole and slot diameters only. Outlines are not offset, so shared edges stay shared.
- Inside corners get a fillet (default 1 mm, capped at width/4). They only occur where a node has neighbours on two
  perpendicular sides and the diagonal is empty, so each fillet is added exactly at that corner. Below width/2 a fillet
  can't reach a neighbouring piece's rounded corner, so packing is unaffected.
- Slotted presets follow the v5 sheet: holes, then a slot starting one pitch on and running to the last node.

## Packing

- **Grid parts** (pitch = width, or a single node): polyominoes on a width-sized cell grid, placed largest first by a
  touching-perimeter score (shared edges with other pieces count double, sheet edges once).
- **Off-pitch single rows** (e.g. the 5.5 mm short piece): packed end to end into free horizontal runs.
- **Other off-pitch shapes**: take their bounding box in whole cells.
- **Fill**: seeded random straights, then discs into single gaps. Same seed, same sheet.

## Output

- Hairline strokes, 0.001″ (0.0254 mm). Holes and slots red `#FF0000`, outlines black `#000000`.
  Map red to run first in the Epilog driver's colour mapping. The outer cuts are open paths after
  deduplication, so driver *Inside/Out* sorting can't be relied on for them.
- The on-screen preview imitates edge-lit fluorescent acrylic; the colour setting affects the preview only.
- The project JSON (settings, custom parts, quantities, placements) is embedded in exported SVGs and
  attached to PDFs. *Open project* accepts `.json` or an exported `.svg`, including files saved before the rename from “drilled sticks”.

## Code map

| File | Role |
| --- | --- |
| `src/lib/parts.ts` | node model, orientations, validation, built-in parts |
| `src/lib/geometry.ts` | node set → outline rings, holes, slots (integer µm, Clipper2) |
| `src/lib/layout.ts` | packing |
| `src/lib/cut.ts` | placed geometry, shared-edge removal, path chaining |
| `src/lib/export.ts` | SVG and PDF |
| `src/lib/project.ts` | defaults, save/load, input sanitising |
| `src/lib/store.svelte.ts` | app state (runes), localStorage persistence |

## Adding parts with extra features (servo holder, rack)

`partGeometry` is the single place that turns a part into cut geometry. Add an optional `features` list to
`PartDef` (e.g. `{ kind: 'rect-cutout', … }`, `{ kind: 'rack', module, teeth }`), union extra outline shapes
into the `blob` call, and emit extra inner cuts alongside slots. Packing treats such parts as `box` unless their
footprint stays within grid cells.

## Deploy with pm2

```sh
npm run build
pm2 start ecosystem.config.cjs
```
