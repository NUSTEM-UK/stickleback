import { describe, expect, it } from 'vitest';
import { partGeometry, ringArea } from '../src/lib/geometry';
import { builtinParts, uniqueOrientations, validate } from '../src/lib/parts';
import { computeLayout, kindOf } from '../src/lib/layout';
import { buildCutPlan, chain, dedupe } from '../src/lib/cut';
import { Clipper, FillRule, Path64, Paths64, Point64 } from 'clipper2-js';
import { DEFAULT_SETTINGS, makeProject, parseProject } from '../src/lib/project';
import { svgString } from '../src/lib/export';
import type { PartNode } from '../src/lib/types';

const S = DEFAULT_SETTINGS;
const parts = builtinParts();
const part = (id: string) => parts.find((p) => p.id === id)!;
const g = { pitch: 9000, half: 4500, holeR: 480, slotHalf: 480, fillet: 0, tol: 10 };

describe('geometry', () => {
  it('makes a stadium for a straight', () => {
    const geo = partGeometry(part('straight-5').nodes, g);
    expect(geo.outline).toHaveLength(1);
    expect(geo.w).toBe(45000);
    expect(geo.h).toBe(9000);
    expect(geo.holes).toHaveLength(5);
    const xs = geo.outline[0].filter((_, i) => i % 2 === 0);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(45000);
  });
  it('makes one outline for an L and leaves solid nodes undrilled', () => {
    expect(partGeometry(part('L-3x3').nodes, g).outline).toHaveLength(1);
    expect(partGeometry(part('ends-6').nodes, g).holes).toHaveLength(2);
  });
  it('starts the slot one pitch after the last hole, as on the v5 sheet', () => {
    const geo = partGeometry(part('slotted-12-4').nodes, g);
    expect(geo.slots).toHaveLength(1);
    expect(geo.holes).toHaveLength(4);
    const xs = geo.slots[0].filter((_, i) => i % 2 === 0);
    expect(Math.min(...xs)).toBeCloseTo(4 * 9000 + 4500 - 480, -1);
    expect(Math.max(...xs)).toBeCloseTo(11 * 9000 + 4500 + 480, -1);
  });
  it('keeps the void inside a closed ring as a separate ring', () => {
    const ring: PartNode[] = [];
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) if (x === 0 || y === 0 || x === 4 || y === 4) ring.push({ x, y, s: 'hole' });
    const geo = partGeometry(ring, g);
    expect(geo.outline).toHaveLength(2);
  });
  it('fillets inside corners only', () => {
    const r = 1000;
    const L = part('L-3x3').nodes;
    const sharp = partGeometry(L, g).outline.reduce((a, q) => a + Math.abs(ringArea(q)), 0);
    const round = partGeometry(L, { ...g, fillet: r }).outline.reduce((a, q) => a + Math.abs(ringArea(q)), 0);
    // one inside corner gains r² (1 − π/4)
    expect(round - sharp).toBeGreaterThan(r * r * (1 - Math.PI / 4) * 0.9);
    expect(round - sharp).toBeLessThan(r * r * (1 - Math.PI / 4) * 1.1);
    const st = part('straight-5').nodes;
    expect(partGeometry(st, { ...g, fillet: r }).outline).toEqual(partGeometry(st, g).outline);
  });
  it('keeps a 2×2 block solid at a pitch wider than the stick', () => {
    const block: PartNode[] = [0, 1, 2, 3].map((i) => ({ x: i % 2, y: i >> 1, s: 'hole' }));
    expect(partGeometry(block, { ...g, pitch: 15000 }).outline).toHaveLength(1);
  });
});

describe('parts', () => {
  it('counts distinct orientations', () => {
    expect(uniqueOrientations(part('straight-4').nodes)).toHaveLength(2);
    expect(uniqueOrientations(part('plus-2').nodes)).toHaveLength(1);
    expect(uniqueOrientations(part('L-3x3').nodes)).toHaveLength(4);
  });
  it('rejects disconnected parts', () => {
    expect(validate([{ x: 0, y: 0, s: 'hole' }, { x: 1, y: 1, s: 'hole' }])).not.toHaveLength(0);
    expect(validate(part('spurs-4-2-4').nodes)).toHaveLength(0);
  });
  it('classifies packing kinds', () => {
    expect(kindOf(S, part('straight-6'))).toBe('cell');
    expect(kindOf(S, part('short-3'))).toBe('row');
    expect(kindOf({ ...S, pitch: 11 }, part('L-3x3'))).toBe('box');
  });
});

describe('layout and cutting', () => {
  it('stacks two equal straights and cuts the shared edge once', () => {
    const r = computeLayout(S, parts, { 'straight-4': 2 });
    expect(r.placements).toHaveLength(2);
    const plan = buildCutPlan(S, parts, r.placements);
    // two stadia of 36 mm × 9 mm sharing one 27 mm flat
    expect(plan.stats.rawLength - plan.stats.cutLength).toBeCloseTo(27000, -1);
  });
  it('merges partially overlapping edges', () => {
    const segs = dedupe([
      [0, 0, 100, 0, 100, 10, 0, 10],
      [50, 10, 150, 10, 150, 20, 50, 20],
    ]);
    const total = segs.reduce((a, q) => a + Math.hypot(q[2] - q[0], q[3] - q[1]), 0);
    expect(total).toBe(100 + 150 + 100 + 4 * 10);
  });
  it('chains a square into one closed loop', () => {
    const pl = chain([
      [0, 0, 10, 0],
      [10, 0, 10, 10],
      [10, 10, 0, 10],
      [0, 10, 0, 0],
    ]);
    expect(pl).toHaveLength(1);
    expect(pl[0].closed).toBe(true);
  });
  it('reports pieces that do not fit', () => {
    const r = computeLayout({ ...S, sheet: 'A5' }, parts, { 'straight-12': 200 });
    expect(r.unplaced['straight-12']).toBeGreaterThan(0);
  });
  it('fills deterministically from the seed', () => {
    const fs = { ...S, fill: { ...S.fill, enabled: true, seed: 42 } };
    const a = computeLayout(fs, parts, { 'T-5-2': 2 });
    const b = computeLayout(fs, parts, { 'T-5-2': 2 });
    expect(a.placements).toEqual(b.placements);
    expect(a.placements.length).toBeGreaterThan(50);
  });
  it('packs off-pitch rows end to end', () => {
    const r = computeLayout(S, parts, { 'short-3': 9 });
    expect(r.placements).toHaveLength(9);
    expect(new Set(r.placements.map((p) => p.y)).size).toBe(1);
  });
});

describe('no overlaps', () => {
  it('keeps filleted shapes clear of their neighbours', () => {
    const fs = { ...S, filletRadius: S.width / 4, fill: { ...S.fill, enabled: true, seed: 3 } };
    const bin = { 'L-3x3': 4, 'T-5-2': 4, 'plus-2': 3, 'spurs-4-2-4': 3, 'spur-5-1x3': 3, 'straight-6': 6 };
    const plan = buildCutPlan(fs, parts, computeLayout(fs, parts, bin).placements);
    const toPaths = (rings: number[][]) => {
      const ps = new Paths64();
      for (const r of rings) {
        const p = new Path64();
        for (let i = 0; i < r.length; i += 2) p.push(new Point64(r[i], r[i + 1]));
        ps.push(p);
      }
      return ps;
    };
    const area = (ps: Paths64) => ps.reduce((a, p) => a + Math.abs(Clipper.area(p)), 0);
    let overlap = 0;
    for (let i = 0; i < plan.pieces.length; i++)
      for (let j = i + 1; j < plan.pieces.length; j++) {
        const a = plan.pieces[i].placement;
        const b = plan.pieces[j].placement;
        if (Math.abs(a.x - b.x) > 130000 || Math.abs(a.y - b.y) > 130000) continue;
        overlap += area(Clipper.Intersect(toPaths(plan.pieces[i].outline), toPaths(plan.pieces[j].outline), FillRule.NonZero));
      }
    expect(overlap).toBe(0);
  });
});

describe('project', () => {
  it('round-trips through SVG metadata', () => {
    const r = computeLayout(S, parts, { 'straight-3': 3 });
    const proj = makeProject(S, parts, { 'straight-3': 3 }, r.placements);
    const svg = svgString(S, buildCutPlan(S, parts, r.placements), proj);
    const back = parseProject(svg);
    expect(back.bin).toEqual({ 'straight-3': 3 });
    expect(back.placements).toEqual(r.placements);
  });
});
