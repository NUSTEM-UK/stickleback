<script lang="ts">
  import { geomParams } from '../lib/cut';
  import { partGeometry, ringsToD } from '../lib/geometry';
  import { newId, normalise, validate } from '../lib/parts';
  import { app } from '../lib/store.svelte';
  import type { NodeState, PartDef, PartNode } from '../lib/types';

  let { part, onclose }: { part: PartDef | null; onclose: () => void } = $props();

  const COLS = 14;
  const ROWS = 12;
  const S = 34; // px between dots

  type Tool = NodeState | 'erase';
  const TOOLS: { t: Tool; label: string; key: string; help: string }[] = [
    { t: 'hole', label: 'Hole', key: 'h', help: 'Part of the piece, drilled' },
    { t: 'solid', label: 'Solid', key: 's', help: 'Part of the piece, no hole' },
    { t: 'slot', label: 'Slot', key: 'l', help: 'Adjacent slot nodes join into a slot' },
    { t: 'erase', label: 'Erase', key: 'e', help: 'Not part of the piece' },
  ];

  // Start from the part being edited (offset by one so there's room on every side), or empty.
  const init = part ? normalise(part.nodes) : [];
  const dx = part ? Math.max(0, Math.floor((COLS - Math.max(...init.map((n) => n.x)) - 1) / 2)) : 0;
  const dy = part ? Math.max(0, Math.floor((ROWS - Math.max(...init.map((n) => n.y)) - 1) / 2)) : 0;
  let cells = $state<Record<string, NodeState>>(
    Object.fromEntries(init.map((n) => [`${n.x + dx},${n.y + dy}`, n.s])),
  );
  let name = $state(part ? (part.builtin ? `${part.name} (copy)` : part.name) : 'New part');
  let pitch = $state<number | null>(part?.pitch ?? null);
  let tool = $state<Tool>('hole');
  let painting = $state(false);

  const nodes = $derived<PartNode[]>(
    Object.entries(cells).map(([k, s]) => {
      const [x, y] = k.split(',').map(Number);
      return { x, y, s };
    }),
  );
  const errors = $derived(validate(nodes));
  const draft = $derived<PartDef>({
    id: part && !part.builtin ? part.id : 'draft',
    name,
    category: 'custom',
    nodes,
    pitch: pitch && pitch > 0 ? pitch : undefined,
  });

  // Preview drawn in grid space: real geometry, scaled so the pitch maps to the dot spacing.
  const preview = $derived.by(() => {
    if (!nodes.length) return null;
    const g = geomParams(app.safe, draft);
    const geo = partGeometry(nodes, g);
    const k = S / g.pitch;
    return { geo, transform: `translate(${S / 2} ${S / 2}) scale(${k}) translate(${-g.half} ${-g.half})` };
  });

  function apply(x: number, y: number) {
    const k = `${x},${y}`;
    if (tool === 'erase') delete cells[k];
    else cells[k] = tool;
  }
  function down(e: PointerEvent, x: number, y: number) {
    e.preventDefault();
    painting = true;
    apply(x, y);
  }
  function enter(x: number, y: number) {
    if (painting) apply(x, y);
  }
  function keydown(e: KeyboardEvent) {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    const t = TOOLS.find((t) => t.key === e.key.toLowerCase());
    if (t) tool = t.t;
    if (e.key === 'Escape') onclose();
  }
  function save() {
    const p: PartDef = { ...$state.snapshot(draft), nodes: normalise($state.snapshot(nodes)) };
    if (p.id === 'draft') p.id = newId();
    app.savePart(p);
    onclose();
  }
</script>

<svelte:window onpointerup={() => (painting = false)} onkeydown={keydown} />

<div class="scrim" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="editor-title">
    <header>
      <h2 id="editor-title">{part && !part.builtin ? 'Edit part' : 'New part'}</h2>
      <button class="link" onclick={onclose}>Close</button>
    </header>

    <div class="body">
      <div class="left">
        <div class="tools" role="radiogroup" aria-label="Paint tool">
          {#each TOOLS as t}
            <button
              role="radio"
              aria-checked={tool === t.t}
              class:on={tool === t.t}
              title="{t.help} ({t.key.toUpperCase()})"
              onclick={() => (tool = t.t)}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                {#if t.t === 'hole'}<circle cx="7" cy="7" r="6" class="sw-solid" /><circle cx="7" cy="7" r="2" class="sw-hole" />
                {:else if t.t === 'solid'}<circle cx="7" cy="7" r="6" class="sw-solid" />
                {:else if t.t === 'slot'}<circle cx="7" cy="7" r="6" class="sw-solid" /><rect x="1" y="5.5" width="12" height="3" rx="1.5" class="sw-hole" />
                {:else}<circle cx="7" cy="7" r="5.5" class="sw-empty" />{/if}
              </svg>
              {t.label}
            </button>
          {/each}
        </div>

        <svg
          class="grid"
          width={COLS * S}
          height={ROWS * S}
          viewBox="0 0 {COLS * S} {ROWS * S}"
          role="application"
          aria-label="Part design grid: click or drag to paint nodes"
        >
          {#if preview}
            <g transform={preview.transform}>
              <path d={ringsToD(preview.geo.outline)} class="piece" />
              {#if preview.geo.slots.length}<path d={ringsToD(preview.geo.slots)} class="cut" />{/if}
            </g>
          {/if}
          {#each { length: ROWS } as _, y}
            {#each { length: COLS } as _, x}
              {@const st = cells[`${x},${y}`]}
              <g
                class="node"
                role="presentation"
                onpointerdown={(e) => down(e, x, y)}
                onpointerenter={() => enter(x, y)}
              >
                <rect x={x * S} y={y * S} width={S} height={S} class="hit" />
                {#if st === 'hole'}
                  <circle cx={x * S + S / 2} cy={y * S + S / 2} r="4" class="hole" />
                {:else if st === 'solid'}
                  <circle cx={x * S + S / 2} cy={y * S + S / 2} r="2" class="solid" />
                {:else if st === 'slot'}
                  <circle cx={x * S + S / 2} cy={y * S + S / 2} r="3" class="slotnode" />
                {:else if !st}
                  <circle cx={x * S + S / 2} cy={y * S + S / 2} r="1.6" class="dot" />
                {/if}
              </g>
            {/each}
          {/each}
        </svg>
      </div>

      <div class="right">
        <label>Name <input type="text" bind:value={name} /></label>
        <label>
          Hole pitch
          <span class="pitch">
            <input type="number" min="1" step="0.5" placeholder={String(app.settings.pitch)} bind:value={pitch} /> mm
          </span>
        </label>
        <p class="hint">Leave pitch blank to use the sheet default ({app.settings.pitch} mm).</p>
        <p class="hint">
          Paint with the mouse; keys H, S, L and E pick the tool. Nodes join to their neighbours
          above, below and to the sides – not diagonally.
        </p>
        {#each errors as e}<p class="error">{e}</p>{/each}
        <div class="buttons">
          <button onclick={() => (cells = {})}>Clear grid</button>
          <button class="primary" disabled={errors.length > 0 || !name.trim()} onclick={save}>Save to parts</button>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgb(30 41 51 / 0.45);
    display: grid;
    place-items: center;
    z-index: 10;
    padding: 1rem;
  }
  .dialog {
    background: var(--panel);
    border-radius: var(--radius-m);
    box-shadow: 0 12px 40px rgb(30 41 51 / 0.35);
    max-width: 100%;
    max-height: 100%;
    overflow: auto;
  }
  header { display: flex; justify-content: space-between; align-items: center; padding: 0.8rem 1rem; border-bottom: 1px solid var(--panel-edge); }
  .body { display: flex; gap: 1.2rem; padding: 1rem; flex-wrap: wrap; }
  .tools { display: flex; gap: 0.3rem; margin-bottom: 0.6rem; }
  .tools button { display: flex; align-items: center; gap: 0.35rem; }
  .tools button.on { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); background: #eef3fb; }
  .sw-solid { fill: color-mix(in srgb, var(--acrylic) 40%, white); stroke: var(--acrylic-deep); }
  .sw-hole { fill: var(--ink); }
  .sw-empty { fill: none; stroke: var(--muted); stroke-dasharray: 2 2; }
  .grid { display: block; background: var(--bed-surface); border: 1px solid var(--panel-edge); border-radius: var(--radius-s); touch-action: none; cursor: crosshair; }
  .hit { fill: transparent; }
  .node:hover .hit { fill: rgb(31 95 191 / 0.08); }
  .dot { fill: rgb(30 41 51 / 0.3); }
  .hole { fill: var(--bed-surface); stroke: var(--acrylic-deep); stroke-width: 1.5; }
  .solid { fill: var(--acrylic-deep); }
  .slotnode { fill: none; stroke: var(--acrylic-deep); stroke-width: 1; stroke-dasharray: 2 1.5; }
  .piece {
    fill: color-mix(in srgb, var(--acrylic) 42%, white);
    fill-rule: evenodd;
    stroke: var(--acrylic-deep);
    stroke-width: 220;
    stroke-linejoin: round;
    filter: drop-shadow(0 0 1.5px var(--acrylic));
  }
  .cut { fill: var(--bed-surface); stroke: var(--acrylic-deep); stroke-width: 150; }
  .right { display: grid; gap: 0.6rem; align-content: start; width: 16rem; }
  .right label { display: grid; gap: 0.2rem; font-weight: 500; }
  .pitch { display: flex; align-items: center; gap: 0.4rem; font-weight: 400; }
  .hint { margin: 0; font-size: 0.85rem; color: var(--muted); }
  .error { margin: 0; color: var(--warn); font-size: 0.9rem; }
  .buttons { display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 0.5rem; }
</style>
