import type { NodeState, Orientation, PartDef, PartNode } from './types';

const ORIENTS: Orientation[] = [0, 1, 2, 3].flatMap((rot) =>
  [false, true].map((mirror) => ({ rot: rot as Orientation['rot'], mirror })),
);

/** Shift so min x and min y are 0, and sort for a canonical order. */
export function normalise(nodes: PartNode[]): PartNode[] {
  if (nodes.length === 0) return [];
  const mx = Math.min(...nodes.map((n) => n.x));
  const my = Math.min(...nodes.map((n) => n.y));
  return nodes
    .map((n) => ({ x: n.x - mx, y: n.y - my, s: n.s }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

export function orient(nodes: PartNode[], o: Orientation): PartNode[] {
  const out = nodes.map((n) => {
    let { x, y } = n;
    for (let i = 0; i < o.rot; i++) [x, y] = [-y, x];
    if (o.mirror) x = -x;
    return { x, y, s: n.s };
  });
  return normalise(out);
}

const key = (nodes: PartNode[]) => nodes.map((n) => `${n.x},${n.y},${n.s}`).join(';');

/** Orientations that give distinct results (a straight has 2, an L has 8, a + has 1…). */
export function uniqueOrientations(nodes: PartNode[]): { o: Orientation; nodes: PartNode[] }[] {
  const seen = new Set<string>();
  const out: { o: Orientation; nodes: PartNode[] }[] = [];
  for (const o of ORIENTS) {
    const n = orient(nodes, o);
    const k = key(n);
    if (!seen.has(k)) {
      seen.add(k);
      out.push({ o, nodes: n });
    }
  }
  return out;
}

export function bounds(nodes: PartNode[]): { cols: number; rows: number } {
  if (nodes.length === 0) return { cols: 0, rows: 0 };
  return {
    cols: Math.max(...nodes.map((n) => n.x)) - Math.min(...nodes.map((n) => n.x)) + 1,
    rows: Math.max(...nodes.map((n) => n.y)) - Math.min(...nodes.map((n) => n.y)) + 1,
  };
}

/** Returns a list of problems; empty means the part is valid. */
export function validate(nodes: PartNode[]): string[] {
  const errs: string[] = [];
  if (nodes.length === 0) return ['Add at least one node.'];
  const set = new Set(nodes.map((n) => `${n.x},${n.y}`));
  const seen = new Set<string>();
  const stack = [`${nodes[0].x},${nodes[0].y}`];
  while (stack.length) {
    const k = stack.pop()!;
    if (seen.has(k)) continue;
    seen.add(k);
    const [x, y] = k.split(',').map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nk = `${x + dx},${y + dy}`;
      if (set.has(nk) && !seen.has(nk)) stack.push(nk);
    }
  }
  if (seen.size !== set.size) errs.push('Nodes must form one connected piece (diagonals don’t join).');
  return errs;
}

/** True if every node sits in one row – such parts can pack end to end at any pitch. */
export function isSingleRow(nodes: PartNode[]): boolean {
  return nodes.every((n) => n.y === nodes[0].y);
}

// ---------------------------------------------------------------- built-ins

const row = (states: NodeState[], y = 0, x0 = 0): PartNode[] =>
  states.map((s, i) => ({ x: x0 + i, y, s }));
const holes = (n: number) => Array<NodeState>(n).fill('hole');

export function builtinParts(): PartDef[] {
  const parts: PartDef[] = [];
  for (let n = 1; n <= 12; n++) {
    parts.push({
      id: `straight-${n}`,
      name: n === 1 ? 'Disc' : `1 × ${n}`,
      category: n === 1 ? 'disc' : 'straight',
      nodes: row(holes(n)),
      builtin: true,
    });
  }
  parts.push({
    id: 'short-3',
    name: 'Short 3-hole (5.5 mm)',
    category: 'short',
    nodes: row(holes(3)),
    pitch: 5.5,
    builtin: true,
  });
  for (const k of [2, 4, 6]) {
    parts.push({
      id: `slotted-12-${k}`,
      name: `Slotted 12, ${k} holes`,
      category: 'slotted',
      // As in the v5 sheet: the slot starts one pitch after the last hole and runs to the end node.
      nodes: row([...holes(k), ...Array<NodeState>(12 - k).fill('slot')]),
      builtin: true,
    });
  }
  parts.push(
    {
      id: 'L-3x3',
      name: 'L 3 × 3',
      category: 'shape',
      nodes: [...row(holes(3)), { x: 0, y: 1, s: 'hole' }, { x: 0, y: 2, s: 'hole' }],
      builtin: true,
    },
    {
      id: 'T-5-2',
      name: 'T 5, 2-hole stem',
      category: 'shape',
      nodes: [...row(holes(5)), { x: 2, y: 1, s: 'hole' }, { x: 2, y: 2, s: 'hole' }],
      builtin: true,
    },
    {
      id: 'plus-2',
      name: '+ 2-hole arms',
      category: 'shape',
      nodes: [
        ...row(holes(5), 2),
        { x: 2, y: 0, s: 'hole' },
        { x: 2, y: 1, s: 'hole' },
        { x: 2, y: 3, s: 'hole' },
        { x: 2, y: 4, s: 'hole' },
      ],
      builtin: true,
    },
    {
      // "4 holes long, 1-hole spurs at positions 2 and 4 on opposing sides"
      id: 'spurs-4-2-4',
      name: '4 long, spurs at 2 and 4',
      category: 'shape',
      nodes: [...row(holes(4), 1), { x: 1, y: 0, s: 'hole' }, { x: 3, y: 2, s: 'hole' }],
      builtin: true,
    },
    {
      // "5 holes long, 3-hole spur at position 1"
      id: 'spur-5-1x3',
      name: '5 long, 3-hole spur at 1',
      category: 'shape',
      nodes: [...row(holes(5)), ...[1, 2, 3].map((y) => ({ x: 0, y, s: 'hole' as NodeState }))],
      builtin: true,
    },
    {
      // Example from the brief: holes only at the ends.
      id: 'ends-6',
      name: '1 × 6, end holes only',
      category: 'shape',
      nodes: row(['hole', 'solid', 'solid', 'solid', 'solid', 'hole']),
      builtin: true,
    },
  );
  return parts.map((p) => ({ ...p, nodes: normalise(p.nodes) }));
}

export function newId(): string {
  return 'c-' + Math.random().toString(36).slice(2, 9);
}
