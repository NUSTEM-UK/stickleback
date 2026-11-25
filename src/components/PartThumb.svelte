<script lang="ts">
  import { geomParams } from '../lib/cut';
  import { partGeometry, ringsToD } from '../lib/geometry';
  import type { PartDef, Settings } from '../lib/types';

  let { part, settings, size = 64 }: { part: PartDef; settings: Settings; size?: number } = $props();

  const geo = $derived(part.nodes.length ? partGeometry(part.nodes, geomParams(settings, part)) : null);
  const pad = $derived(geo ? Math.max(geo.w, geo.h) * 0.04 : 0);
</script>

{#if geo}
  <svg viewBox="{-pad} {-pad} {geo.w + 2 * pad} {geo.h + 2 * pad}" width={size} height={size} aria-hidden="true">
    <path d={ringsToD(geo.outline)} class="piece" />
    {#if geo.slots.length}<path d={ringsToD(geo.slots)} class="cut" />{/if}
    {#each geo.holes as h}
      <circle cx={h.cx} cy={h.cy} r={Math.max(h.r, 700)} class="cut" />
    {/each}
  </svg>
{/if}

<style>
  svg { display: block; flex: none; }
  .piece {
    fill: color-mix(in srgb, var(--acrylic) 38%, white);
    fill-rule: evenodd;
    stroke: var(--acrylic-deep);
    stroke-width: 350;
    stroke-linejoin: round;
  }
  .cut { fill: var(--ink); }
</style>
