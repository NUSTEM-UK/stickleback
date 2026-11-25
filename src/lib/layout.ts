import { mulberry32 } from './rng';
import { orient, uniqueOrientations } from './parts';
import { sheetDims, toUm } from './sheet';
import type { Bin, Orientation, PartDef, PartNode, Placement, Settings } from './types';

export interface LayoutResult {
  placements: Placement[];
  /** Requested pieces that didn't fit, by part id. */
  unplaced: Record<string, number>;
  grid: { cols: number; rows: number; cell: number; ox: number; oy: number };
}

/** Stick width in µm, forced even so half-width is an exact integer. */
export const widthUm = (s: Settings) => 2 * Math.round(toUm(s.width) / 2);
export const pitchUm = (s: Settings, p: PartDef) => toUm(p.pitch ?? s.pitch);

type Kind = 'cell' | 'row' | 'box';

/**
 * How a part packs:
 *  cell – pitch equals width, so the part is a polyomino on the stick grid and can share edges with anything;
 *  row  – a single row at another pitch: packs end to end in free horizontal runs;
 *  box  – anything else: occupies its bounding box rounded up to whole cells.
 */
export function kindOf(s: Settings, p: PartDef): Kind {
  if (p.nodes.length === 1) return 'cell';
  if (Math.abs(pitchUm(s, p) - widthUm(s)) <= 2) return 'cell';
  if (p.nodes.every((n) => n.y === p.nodes[0].y)) return 'row';
  return 'box';
}

/** Continuous length of a single-row part, µm. */
export function rowLength(s: Settings, p: PartDef): number {
  const n = Math.max(...p.nodes.map((q) => q.x)) + 1;
  return (n - 1) * pitchUm(s, p) + widthUm(s);
}

interface Footprint {
  o: Orientation;
  cells: [number, number][];
  maxDx: number;
  maxDy: number;
}

function footprints(s: Settings, p: PartDef): Footprint[] {
  const w = widthUm(s);
  const pitch = pitchUm(s, p);
  if (kindOf(s, p) === 'cell') {
    return uniqueOrientations(p.nodes).map(({ o, nodes }) => fp(o, nodes.map((n) => [n.x, n.y])));
  }
  // box: bounding box in whole cells, upright and turned
  const cols = Math.max(...p.nodes.map((n) => n.x));
  const rows = Math.max(...p.nodes.map((n) => n.y));
  const cw = Math.ceil((cols * pitch + w) / w - 1e-6);
  const ch = Math.ceil((rows * pitch + w) / w - 1e-6);
  const rect = (a: number, b: number) =>
    Array.from({ length: a * b }, (_, i) => [i % a, Math.floor(i / a)] as [number, number]);
  const out = [fp({ rot: 0, mirror: false }, rect(cw, ch))];
  if (cw !== ch) out.push(fp({ rot: 1, mirror: false }, rect(ch, cw)));
  return out;
}

function fp(o: Orientation, cells: [number, number][]): Footprint {
  return { o, cells, maxDx: Math.max(...cells.map((c) => c[0])), maxDy: Math.max(...cells.map((c) => c[1])) };
}

/** Neighbour cells (relative) across each outer edge of a footprint. */
const perimCache = new WeakMap<Footprint, [number, number][]>();
function perimeter(f: Footprint): [number, number][] {
  let e = perimCache.get(f);
  if (e) return e;
  const has = new Set(f.cells.map(([x, y]) => `${x},${y}`));
  e = [];
  for (const [x, y] of f.cells)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
      if (!has.has(`${x + dx},${y + dy}`)) e.push([x + dx, y + dy]);
  perimCache.set(f, e);
  return e;
}

class Grid {
  occ: Uint8Array;
  constructor(public cols: number, public rows: number) {
    this.occ = new Uint8Array(Math.max(0, cols * rows));
  }
  free(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows && !this.occ[y * this.cols + x];
  }
  fits(f: Footprint, x: number, y: number) {
    if (x + f.maxDx >= this.cols || y + f.maxDy >= this.rows) return false;
    return f.cells.every(([dx, dy]) => !this.occ[(y + dy) * this.cols + x + dx]);
  }
  mark(f: Footprint, x: number, y: number) {
    for (const [dx, dy] of f.cells) this.occ[(y + dy) * this.cols + x + dx] = 1;
  }
  /**
   * Touching-perimeter placement: score every feasible position by how many of
   * the piece's outer cell edges touch other pieces (×2, since those edges are
   * shared cuts) or the sheet edge (×1, keeps packing compact). Ties go to the
   * highest, then leftmost, position.
   */
  best(fps: Footprint[]): { f: Footprint; x: number; y: number } | null {
    let best: { f: Footprint; x: number; y: number; score: number; order: number } | null = null;
    for (const f of fps) {
      const edges = perimeter(f);
      for (let y = 0; y + f.maxDy < this.rows; y++) {
        for (let x = 0; x + f.maxDx < this.cols; x++) {
          if (!this.fits(f, x, y)) continue;
          let score = 0;
          for (const [cx, cy] of edges) {
            const nx = x + cx;
            const ny = y + cy;
            if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) score += 1;
            else if (this.occ[ny * this.cols + nx]) score += 2;
          }
          const order = (y + f.maxDy) * this.cols + x;
          if (!best || score > best.score || (score === best.score && order < best.order))
            best = { f, x, y, score, order };
        }
      }
    }
    return best;
  }
  /** Maximal runs of free cells in each row. */
  runs(): { y: number; x0: number; len: number }[] {
    const out: { y: number; x0: number; len: number }[] = [];
    for (let y = 0; y < this.rows; y++) {
      let x = 0;
      while (x < this.cols) {
        if (!this.free(x, y)) {
          x++;
          continue;
        }
        const x0 = x;
        while (x < this.cols && this.free(x, y)) x++;
        out.push({ y, x0, len: x - x0 });
      }
    }
    return out;
  }
}

/** Nodes of a part in a given orientation (for rendering a placement). */
export function placedNodes(p: PartDef, o: Orientation): PartNode[] {
  return orient(p.nodes, o);
}

export function computeLayout(s: Settings, parts: PartDef[], bin: Bin): LayoutResult {
  const w = widthUm(s);
  const { w: sw, h: sh } = sheetDims(s);
  const m = toUm(s.margin);
  const cols = Math.floor((toUm(sw) - 2 * m) / w);
  const rows = Math.floor((toUm(sh) - 2 * m) / w);
  const grid = new Grid(cols, rows);
  const byId = new Map(parts.map((p) => [p.id, p]));
  const placements: Placement[] = [];
  const unplaced: Record<string, number> = {};
  const at = (cx: number, cy: number) => ({ x: m + cx * w, y: m + cy * w });

  // Expand the bin into individual pieces.
  const cellish: PartDef[] = [];
  const rowish: PartDef[] = [];
  for (const [id, qty] of Object.entries(bin)) {
    const p = byId.get(id);
    if (!p || !qty || qty < 0 || p.nodes.length === 0) continue;
    for (let i = 0; i < qty; i++) (kindOf(s, p) === 'row' ? rowish : cellish).push(p);
  }

  // Phase 1: grid pieces, largest footprint first.
  const fpCache = new Map<string, Footprint[]>();
  const fps = (p: PartDef) => {
    if (!fpCache.has(p.id)) fpCache.set(p.id, footprints(s, p));
    return fpCache.get(p.id)!;
  };
  const area = (p: PartDef) => fps(p)[0].cells.length;
  cellish.sort((a, b) => area(b) - area(a) || a.id.localeCompare(b.id));
  const placeCell = (p: PartDef, filler = false) => {
    const b = grid.best(fps(p));
    if (!b) return false;
    grid.mark(b.f, b.x, b.y);
    placements.push({ partId: p.id, ...at(b.x, b.y), orient: b.f.o, filler });
    return true;
  };
  for (const p of cellish) if (!placeCell(p)) unplaced[p.id] = (unplaced[p.id] ?? 0) + 1;

  // Phase 2: off-pitch single-row pieces, end to end in free horizontal runs (first fit decreasing).
  const placeRows = (pieces: PartDef[], filler: boolean): PartDef[] => {
    const left: PartDef[] = [];
    const runs = grid.runs().map((r) => ({ ...r, used: 0 }));
    for (const p of pieces) {
      const L = rowLength(s, p);
      const r = runs.find((r) => r.len * w - r.used >= L);
      if (!r) {
        left.push(p);
        continue;
      }
      placements.push({
        partId: p.id,
        x: m + r.x0 * w + r.used,
        y: m + r.y * w,
        orient: { rot: 0, mirror: false },
        filler,
      });
      r.used += L;
    }
    for (const r of runs) for (let x = r.x0; x < r.x0 + Math.ceil(r.used / w - 1e-9); x++) grid.occ[r.y * cols + x] = 1;
    return left;
  };
  rowish.sort((a, b) => rowLength(s, b) - rowLength(s, a));
  for (const p of placeRows(rowish, false)) unplaced[p.id] = (unplaced[p.id] ?? 0) + 1;

  // Phase 3: optional random fill with straights at the sheet pitch, then discs.
  if (s.fill.enabled) {
    const rand = mulberry32(s.fill.seed);
    const lo = Math.max(2, Math.min(s.fill.minLength, s.fill.maxLength));
    const hi = Math.min(12, Math.max(s.fill.minLength, s.fill.maxLength));
    const lengths = Array.from({ length: Math.max(0, hi - lo + 1) }, (_, i) => lo + i);
    const weight = (L: number) => 1 + Math.min(L - lo, hi - L);
    const pick = (cands: number[]) => {
      const tot = cands.reduce((a, L) => a + weight(L), 0);
      let r = rand() * tot;
      for (const L of cands) if ((r -= weight(L)) < 0) return L;
      return cands[cands.length - 1];
    };
    const straight = (L: number): PartDef => ({
      id: `straight-${L}`,
      name: '',
      category: 'straight',
      nodes: Array.from({ length: L }, (_, x) => ({ x, y: 0, s: 'hole' as const })),
    });
    const sheetIsGrid = Math.abs(toUm(s.pitch) - w) <= 2;
    if (sheetIsGrid) {
      let cands = [...lengths];
      while (cands.length) {
        const L = pick(cands);
        if (!placeCell(straight(L), true)) cands = cands.filter((c) => c < L);
      }
    } else {
      // Fill each free run with random lengths that still fit.
      const pitch = toUm(s.pitch);
      const len = (L: number) => (L - 1) * pitch + w;
      const runs = grid.runs();
      for (const r of runs) {
        let used = 0;
        for (;;) {
          const fits = lengths.filter((L) => len(L) <= r.len * w - used);
          if (!fits.length) break;
          const L = pick(fits);
          placements.push({
            partId: `straight-${L}`,
            x: m + r.x0 * w + used,
            y: m + r.y * w,
            orient: { rot: 0, mirror: false },
            filler: true,
          });
          used += len(L);
        }
        for (let x = r.x0; x < r.x0 + Math.ceil(used / w - 1e-9); x++) grid.occ[r.y * cols + x] = 1;
      }
    }
    if (s.fill.discs) while (placeCell(straight(1), true));
  }

  return { placements, unplaced, grid: { cols, rows, cell: w, ox: m, oy: m } };
}
