import { partGeometry, ringLength, type Circle, type GeomParams, type PartGeometry, type Ring } from './geometry';
import { pitchUm, placedNodes, widthUm } from './layout';
import { toUm } from './sheet';
import type { PartDef, Placement, Settings } from './types';

export interface Polyline {
  pts: number[]; // flat µm
  closed: boolean;
}

export interface PlacedPiece {
  placement: Placement;
  part: PartDef;
  outline: Ring[]; // sheet coordinates
}

export interface CutPlan {
  pieces: PlacedPiece[];
  /** Outer cuts after removing shared edges, chained into polylines. */
  outlines: Polyline[];
  holes: Circle[];
  slots: Ring[];
  stats: { rawLength: number; cutLength: number; holes: number; pieces: number };
}

export function geomParams(s: Settings, p: PartDef): GeomParams {
  return {
    pitch: pitchUm(s, p),
    half: widthUm(s) / 2,
    holeR: Math.max(10, Math.round(toUm(s.holeDiameter - s.kerf) / 2)),
    slotHalf: Math.max(10, Math.round(toUm(s.slotWidth - s.kerf) / 2)),
    fillet: Math.max(0, Math.min(toUm(s.filletRadius), widthUm(s) / 4)),
    tol: 10,
  };
}

const translate = (r: Ring, dx: number, dy: number) => r.map((v, i) => v + (i % 2 ? dy : dx));

export function buildCutPlan(s: Settings, parts: PartDef[], placements: Placement[]): CutPlan {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const cache = new Map<string, PartGeometry>();
  const pieces: PlacedPiece[] = [];
  const holes: Circle[] = [];
  const slots: Ring[] = [];
  const rings: Ring[] = [];

  for (const pl of placements) {
    const part = byId.get(pl.partId);
    if (!part) continue;
    const k = `${pl.partId}|${pl.orient.rot}|${pl.orient.mirror}`;
    if (!cache.has(k)) cache.set(k, partGeometry(placedNodes(part, pl.orient), geomParams(s, part)));
    const g = cache.get(k)!;
    const outline = g.outline.map((r) => translate(r, pl.x, pl.y));
    rings.push(...outline);
    pieces.push({ placement: pl, part, outline });
    for (const h of g.holes) holes.push({ cx: h.cx + pl.x, cy: h.cy + pl.y, r: h.r });
    for (const r of g.slots) slots.push(translate(r, pl.x, pl.y));
  }

  const segs = dedupe(rings);
  const outlines = chain(segs);
  return {
    pieces,
    outlines,
    holes,
    slots,
    stats: {
      rawLength: rings.reduce((a, r) => a + ringLength(r), 0),
      cutLength: segs.reduce((a, q) => a + Math.hypot(q[2] - q[0], q[3] - q[1]), 0),
      holes: holes.length,
      pieces: pieces.length,
    },
  };
}

type Seg = [number, number, number, number];

/** Cluster nearly-equal coordinates (≤ tol µm) onto one representative value. */
function clusterer(values: number[], tol = 2): (v: number) => number {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const map = new Map<number, number>();
  let rep = sorted[0];
  for (const v of sorted) {
    if (v - rep > tol) rep = v;
    map.set(v, rep);
  }
  return (v) => map.get(v) ?? v;
}

/**
 * Break rings into segments and remove duplicates. Axis-aligned segments on the
 * same line are merged as interval unions (so partially overlapping edges of
 * different-length sticks become one cut); other segments are deduplicated exactly.
 */
export function dedupe(rings: Ring[]): Seg[] {
  const horiz: Seg[] = [];
  const vert: Seg[] = [];
  const other = new Map<string, Seg>();
  for (const r of rings) {
    const n = r.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const s: Seg = [r[2 * i], r[2 * i + 1], r[2 * j], r[2 * j + 1]];
      if (s[0] === s[2] && s[1] === s[3]) continue;
      if (Math.abs(s[1] - s[3]) <= 1) horiz.push(s);
      else if (Math.abs(s[0] - s[2]) <= 1) vert.push(s);
      else {
        const a = `${s[0]},${s[1]}`;
        const b = `${s[2]},${s[3]}`;
        other.set(a < b ? `${a}|${b}` : `${b}|${a}`, s);
      }
    }
  }
  const out: Seg[] = [...other.values()];
  const merge = (segs: Seg[], axis: 0 | 1) => {
    // axis 0: horizontal (constant y, intervals in x); axis 1: vertical
    const c = axis === 0 ? 1 : 0;
    const v = axis === 0 ? 0 : 1;
    const snap = clusterer(segs.map((q) => q[c]));
    const lines = new Map<number, [number, number][]>();
    for (const q of segs) {
      const k = snap(q[c]);
      const a = Math.min(q[v], q[v + 2]);
      const b = Math.max(q[v], q[v + 2]);
      if (!lines.has(k)) lines.set(k, []);
      lines.get(k)!.push([a, b]);
    }
    for (const [k, iv] of lines) {
      iv.sort((p, q) => p[0] - q[0]);
      let [a, b] = iv[0];
      const emit = () => out.push(axis === 0 ? [a, k, b, k] : [k, a, k, b]);
      for (let i = 1; i < iv.length; i++) {
        if (iv[i][0] <= b + 1) b = Math.max(b, iv[i][1]);
        else {
          emit();
          [a, b] = iv[i];
        }
      }
      emit();
    }
  };
  if (horiz.length) merge(horiz, 0);
  if (vert.length) merge(vert, 1);
  return out;
}

/** Join segments that share endpoints into polylines, so the laser makes fewer separate cuts. */
export function chain(segs: Seg[]): Polyline[] {
  const k = (x: number, y: number) => `${x},${y}`;
  const at = new Map<string, number[]>();
  segs.forEach((s, i) => {
    for (const p of [k(s[0], s[1]), k(s[2], s[3])]) {
      if (!at.has(p)) at.set(p, []);
      at.get(p)!.push(i);
    }
  });
  const used = new Uint8Array(segs.length);
  const out: Polyline[] = [];
  const walk = (start: number, fromEnd: 0 | 1) => {
    const s0 = segs[start];
    used[start] = 1;
    const pts = fromEnd ? [s0[2], s0[3], s0[0], s0[1]] : [s0[0], s0[1], s0[2], s0[3]];
    for (;;) {
      const x = pts[pts.length - 2];
      const y = pts[pts.length - 1];
      const next = (at.get(k(x, y)) ?? []).find((i) => !used[i]);
      if (next === undefined) break;
      used[next] = 1;
      const s = segs[next];
      if (s[0] === x && s[1] === y) pts.push(s[2], s[3]);
      else pts.push(s[0], s[1]);
    }
    const closed = pts.length > 4 && pts[0] === pts[pts.length - 2] && pts[1] === pts[pts.length - 1];
    if (closed) pts.splice(-2, 2);
    out.push({ pts, closed });
  };
  // Start open chains at odd-degree endpoints, then sweep up closed loops.
  for (const [p, ids] of at) {
    if (ids.length % 2 === 1) {
      const i = ids.find((j) => !used[j]);
      if (i !== undefined) walk(i, segs[i][0] === +p.split(',')[0] && segs[i][1] === +p.split(',')[1] ? 0 : 1);
    }
  }
  segs.forEach((_, i) => {
    if (!used[i]) walk(i, 0);
  });
  return out;
}
