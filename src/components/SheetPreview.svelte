<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { sheetDims } from '../lib/sheet';
  import { ringsToD } from '../lib/geometry';

  const dims = $derived(sheetDims(app.safe));
  const plan = $derived(app.plan);
  const mm = (um: number) => um / 1000;
  const d = (pts: number[], closed: boolean) =>
    pts.reduce((s, v, i) => s + (i % 2 ? `${mm(v)} ` : `${i ? 'L' : 'M'}${mm(v)},`), '') + (closed ? 'Z' : '');

  let showFills = $state(true);
  const names = $derived(new Map(app.parts.map((p) => [p.id, p.name])));
  const unplaced = $derived(Object.entries(app.layout.unplaced));
  const saving = $derived(plan.stats.rawLength > 0 ? 1 - plan.stats.cutLength / plan.stats.rawLength : 0);
</script>

<div class="wrap">
  <div class="stats" aria-live="polite">
    <span><b>{plan.stats.pieces}</b> pieces</span>
    <span><b>{plan.stats.holes}</b> holes</span>
    <span><b>{(plan.stats.cutLength / 1e6).toFixed(2)} m</b> of outline cut</span>
    <span>shared edges save <b>{(saving * 100).toFixed(0)}%</b></span>
    <label class="toggle"><input type="checkbox" bind:checked={showFills} /> Shade pieces</label>
  </div>

  {#if app.layout.fromFile}
    <p class="note">
      Showing the layout saved in the file. Changing any setting or quantity repacks it.
      <button class="link" onclick={() => app.repack()}>Repack now</button>
    </p>
  {/if}
  {#if unplaced.length}
    <p class="note warn">
      Didn’t fit:
      {unplaced.map(([id, n]) => `${n} × ${names.get(id) ?? id}`).join(', ')}. Try a bigger sheet or a smaller margin.
    </p>
  {/if}

  <div class="bed">
    <svg
      class="sheet"
      viewBox="0 0 {dims.w} {dims.h}"
      style:aspect-ratio="{dims.w} / {dims.h}"
      role="img"
      aria-label="{app.safe.sheet} cutting layout with {plan.stats.pieces} pieces"
    >
      <rect width={dims.w} height={dims.h} class="paper" />
      <rect
        x={app.safe.margin}
        y={app.safe.margin}
        width={Math.max(0, dims.w - 2 * app.safe.margin)}
        height={Math.max(0, dims.h - 2 * app.safe.margin)}
        class="margin"
      />
      {#if showFills}
        {#each plan.pieces as pc}
          <path d={ringsToD(pc.outline, 0.001)} class="fill" class:filler={pc.placement.filler}>
            <title>{pc.part.name}</title>
          </path>
        {/each}
      {/if}
      <g class="outer">
        {#each plan.outlines as p}<path d={d(p.pts, p.closed)} />{/each}
      </g>
      <g class="inner">
        {#each plan.slots as r}<path d={d(r, true)} />{/each}
        {#each plan.holes as h}<circle cx={mm(h.cx)} cy={mm(h.cy)} r={mm(h.r)} />{/each}
      </g>
    </svg>
  </div>
</div>

<style>
  .wrap { display: grid; grid-template-rows: auto auto auto 1fr; height: 100%; min-height: 0; background: var(--bed-surface); }
  .stats {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1.2rem;
    padding: 0.6rem 1rem;
    font-size: 0.92rem;
    color: var(--muted);
  }
  .stats b { color: var(--ink); font-weight: 600; }
  .toggle input { accent-color: var(--acrylic); }
  .toggle { margin-left: auto; display: flex; gap: 0.35rem; align-items: center; }
  .note { margin: 0 1rem 0.5rem; padding: 0.4rem 0.6rem; background: var(--panel); border-radius: var(--radius-s); font-size: 0.9rem; }
  .note.warn { color: var(--warn); }
  .bed {
    min-height: 0;
    overflow: auto;
    padding: 1rem 1.5rem 2rem;
    display: grid;
    place-items: start center;
    /* the laser's honeycomb bed, as a dot grid */
    background-color: var(--bed-surface);
    background-image: radial-gradient(circle, var(--bed-dot) 1px, transparent 1.4px);
    background-size: 12px 12px;
  }
  .sheet {
    display: block;
    height: calc(100vh - 9rem);
    min-height: 420px;
    width: auto;
    max-width: 100%;
  }
  @media (max-width: 1000px) {
    .sheet { width: 100%; height: auto; min-height: 0; }
  }
  /* the uncut acrylic sheet */
  /* the uncut acrylic sheet, lightly tinted */
  .paper { fill: color-mix(in srgb, var(--acrylic) 10%, white); stroke: color-mix(in srgb, var(--acrylic) 45%, var(--ink)); stroke-width: 0.3; }
  .margin { fill: none; stroke: color-mix(in srgb, var(--acrylic-deep) 45%, transparent); stroke-width: 0.25; stroke-dasharray: 1.5 1.5; }
  .fill { fill: color-mix(in srgb, var(--acrylic) 42%, white); fill-rule: evenodd; }
  .fill.filler { fill: color-mix(in srgb, var(--acrylic) 24%, white); }
  .fill:hover { fill: color-mix(in srgb, var(--acrylic) 62%, white); }
  /* cut edges: bright acrylic edge with a darker core so they read on a light ground */
  .outer { filter: drop-shadow(0 0 0.5px var(--acrylic)); }
  .outer path { fill: none; stroke: var(--acrylic-deep); stroke-width: 0.22; stroke-linejoin: round; }
  .inner { fill: var(--bed-surface); stroke: var(--acrylic-deep); stroke-width: 0.15; }
  .inner path { fill: var(--bed-surface); }
</style>
