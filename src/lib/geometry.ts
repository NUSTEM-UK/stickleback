import { Clipper, FillRule, Path64, Paths64, Point64 } from 'clipper2-js';
import type { PartNode } from './types';

/** All geometry is integer micrometres so shared edges coincide exactly. */
export type Ring = number[]; // flat [x0, y0, x1, y1, …], implicitly closed
export interface Circle {
  cx: number;
  cy: number;
  r: number;
}
export interface PartGeometry {
  outline: Ring[];
  holes: Circle[];
  slots: Ring[];
  /** Bounding box size, µm. */
  w: number;
  h: number;
}

export interface GeomParams {
  pitch: number; // µm
  half: number; // half stick width, µm
  holeR: number; // drawn hole radius, µm (kerf already removed)
  slotHalf: number; // drawn half slot width, µm
  fillet: number; // inside-corner radius, µm (0 = sharp)
  tol: number; // max chord deviation for arcs, µm
}

/** Vertex count for a circle of radius r: a multiple of 4 so vertices land on the axes. */
export function circleSegments(r: number, tol: number): number {
  if (r <= tol) return 8;
  const n = Math.ceil(Math.PI / Math.acos(1 - tol / r));
  return Math.max(16, Math.ceil(n / 4) * 4);
}

function circlePath(cx: number, cy: number, r: number, tol: number): Path64 {
  const n = circleSegments(r, tol);
  const p = new Path64();
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    p.push(new Point64(Math.round(cx + r * Math.cos(a)) + 0, Math.round(cy + r * Math.sin(a)) + 0));
  }
  return p;
}

function rectPath(x0: number, y0: number, x1: number, y1: number): Path64 {
  const p = new Path64();
  p.push(new Point64(x0, y0));
  p.push(new Point64(x1, y0));
  p.push(new Point64(x1, y1));
  p.push(new Point64(x0, y1));
  return p;
}

/** Drop repeated and collinear vertices (exact integer test). */
export function cleanRing(path: { x: number; y: number }[]): Ring {
  let pts = path.map((p) => [p.x + 0, p.y + 0] as [number, number]);
  pts = pts.filter((p, i) => {
    const q = pts[(i + pts.length - 1) % pts.length];
    return p[0] !== q[0] || p[1] !== q[1];
  });
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i + pts.length - 1) % pts.length];
      const b = pts[i];
      const c = pts[(i + 1) % pts.length];
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (cross === 0) {
        pts.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return pts.flat();
}

/**
 * Union of discs at each centre plus a bar between each pair of 4-adjacent
 * centres, plus a filled square inside each fully occupied 2×2 block.
 * This one function makes both piece outlines and slots.
 */
function blob(
  cells: { x: number; y: number }[],
  centre: (x: number, y: number) => [number, number],
  half: number,
  tol: number,
  extra: Path64[] = [],
): Paths64 {
  if (cells.length === 0) return new Paths64();
  const has = new Set(cells.map((c) => `${c.x},${c.y}`));
  const paths = new Paths64();
  for (const c of cells) {
    const [cx, cy] = centre(c.x, c.y);
    paths.push(circlePath(cx, cy, half, tol));
    if (has.has(`${c.x + 1},${c.y}`)) {
      const [nx] = centre(c.x + 1, c.y);
      paths.push(rectPath(cx, cy - half, nx, cy + half));
    }
    if (has.has(`${c.x},${c.y + 1}`)) {
      const [, ny] = centre(c.x, c.y + 1);
      paths.push(rectPath(cx - half, cy, cx + half, ny));
    }
    if (has.has(`${c.x + 1},${c.y}`) && has.has(`${c.x},${c.y + 1}`) && has.has(`${c.x + 1},${c.y + 1}`)) {
      const [nx, ny] = centre(c.x + 1, c.y + 1);
      paths.push(rectPath(cx, cy, nx, ny));
    }
  }
  for (const e of extra) paths.push(e);
  return Clipper.Union(paths, undefined, FillRule.NonZero);
}

const toRings = (ps: Paths64): Ring[] => ps.map((p) => cleanRing(p)).filter((r) => r.length >= 6);

/**
 * Inside corners only occur where a node has neighbours on two perpendicular
 * sides and the diagonal between them is empty; the corner is then at
 * centre + (dx, dy) × half. A fillet is the r × r square in the empty quadrant
 * minus a quarter disc, unioned into the outline.
 */
function filletPatches(
  cells: { x: number; y: number }[],
  centre: (x: number, y: number) => [number, number],
  half: number,
  r: number,
  tol: number,
): Path64[] {
  const has = new Set(cells.map((c) => `${c.x},${c.y}`));
  const out: Path64[] = [];
  const n = Math.max(2, Math.ceil(circleSegments(r, tol) / 4));
  for (const c of cells) {
    for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      if (!has.has(`${c.x + dx},${c.y}`) || !has.has(`${c.x},${c.y + dy}`) || has.has(`${c.x + dx},${c.y + dy}`)) continue;
      const [cx, cy] = centre(c.x, c.y);
      const X = cx + dx * half;
      const Y = cy + dy * half;
      const p = new Path64();
      p.push(new Point64(X, Y));
      for (let i = 0; i <= n; i++) {
        const a = ((Math.PI / 2) * i) / n;
        p.push(new Point64(Math.round(X + dx * r - dx * r * Math.sin(a)) + 0, Math.round(Y + dy * r - dy * r * Math.cos(a)) + 0));
      }
      out.push(p);
    }
  }
  return out;
}

export function partGeometry(nodes: PartNode[], g: GeomParams): PartGeometry {
  const centre = (x: number, y: number): [number, number] => [x * g.pitch + g.half, y * g.pitch + g.half];
  // The straight run beside an inside corner is pitch − half long, so the fillet can't exceed it.
  const r = Math.min(g.fillet, g.pitch - g.half);
  const fillets = r > 0 ? filletPatches(nodes, centre, g.half, r, g.tol) : [];
  const outline = toRings(blob(nodes, centre, g.half, g.tol, fillets));
  const holes = nodes
    .filter((n) => n.s === 'hole')
    .map((n) => {
      const [cx, cy] = centre(n.x, n.y);
      return { cx, cy, r: g.holeR };
    });
  const slots = toRings(blob(
    nodes.filter((n) => n.s === 'slot'),
    centre,
    g.slotHalf,
    Math.min(g.tol, g.slotHalf / 20),
  ));
  const cols = Math.max(...nodes.map((n) => n.x));
  const rows = Math.max(...nodes.map((n) => n.y));
  return { outline, holes, slots, w: cols * g.pitch + 2 * g.half, h: rows * g.pitch + 2 * g.half };
}

export function ringLength(r: Ring, closed = true): number {
  let L = 0;
  const n = r.length / 2;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const j = (i + 1) % n;
    L += Math.hypot(r[2 * j] - r[2 * i], r[2 * j + 1] - r[2 * i + 1]);
  }
  return L;
}

/** Signed shoelace area of a ring, µm². */
export function ringArea(r: Ring): number {
  let a = 0;
  const n = r.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += r[2 * i] * r[2 * j + 1] - r[2 * j] * r[2 * i + 1];
  }
  return a / 2;
}

/** SVG path data for a set of rings; render with fill-rule="evenodd" so enclosed voids stay open. */
export function ringsToD(rings: Ring[], scale = 1): string {
  return rings
    .map((r) => {
      let d = '';
      for (let i = 0; i < r.length; i += 2) d += `${i ? 'L' : 'M'}${r[i] * scale} ${r[i + 1] * scale}`;
      return d + 'Z';
    })
    .join('');
}
