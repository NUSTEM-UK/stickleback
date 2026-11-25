<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { SHEETS } from '../lib/sheet';
  import { ACRYLICS } from '../lib/project';
  import type { AcrylicColour, SheetSize } from '../lib/types';

</script>

<section class="panel">
  <h2>Sticks</h2>
  <label><span>Width</span><input type="number" min="3" max="40" step="0.5" bind:value={app.settings.width} /> mm</label>
  <label><span>Hole pitch</span><input type="number" min="2" max="40" step="0.5" bind:value={app.settings.pitch} /> mm</label>
  <p class="hint">
    {#if Math.abs(app.settings.pitch - app.settings.width) < 0.002}
      Pitch matches width, so any piece can share edges with its neighbours.
    {:else}
      Pitch differs from width: straights pack end to end in rows, other shapes take their bounding box.
    {/if}
  </p>
  <label><span>Hole diameter</span><input type="number" min="0.2" max="10" step="0.05" bind:value={app.settings.holeDiameter} /> mm</label>
  <label><span>Slot width</span><input type="number" min="0.2" max="10" step="0.05" bind:value={app.settings.slotWidth} /> mm</label>
  <label><span>Kerf</span><input type="number" min="0" max="1" step="0.01" bind:value={app.settings.kerf} /> mm</label>
  <label><span>Inside corner radius</span><input type="number" min="0" max={app.settings.width / 4} step="0.25" bind:value={app.settings.filletRadius} /> mm</label>
  <p class="hint">
    Holes are drawn at {(app.settings.holeDiameter - app.settings.kerf).toFixed(2)} mm and slots at {(app.settings.slotWidth - app.settings.kerf).toFixed(2)} mm. Outlines
    aren’t compensated, so shared edges stay shared. Inside corners are limited to a quarter of the width.
  </p>
</section>

<section class="panel">
  <h2>Sheet</h2>
  <label>
    <span>Size</span>
    <select bind:value={app.settings.sheet}>
      {#each Object.entries(SHEETS) as [k, d]}
        <option value={k as SheetSize}>{k} ({d.w} × {d.h} mm)</option>
      {/each}
    </select>
  </label>
  <label class="check"><input type="checkbox" bind:checked={app.settings.landscape} /> Landscape</label>
  <label>
    <span>Acrylic</span>
    <select bind:value={app.settings.acrylic}>
      {#each Object.entries(ACRYLICS) as [k, a]}
        <option value={k as AcrylicColour}>{a.label}</option>
      {/each}
    </select>
  </label>
  <label><span>Margin</span><input type="number" min="0" max="50" step="0.5" bind:value={app.settings.margin} /> mm</label>
</section>

<section class="panel">
  <h2>Fill spare space</h2>
  <label class="check"><input type="checkbox" bind:checked={app.settings.fill.enabled} /> Add random straights</label>
  <fieldset disabled={!app.settings.fill.enabled}>
    <label><span>Shortest</span><input type="number" min="2" max="12" bind:value={app.settings.fill.minLength} /> holes</label>
    <label><span>Longest</span><input type="number" min="2" max="12" bind:value={app.settings.fill.maxLength} /> holes</label>
    <label class="check"><input type="checkbox" bind:checked={app.settings.fill.discs} /> Fill single gaps with discs</label>
    <div class="row">
      <label><span>Seed</span><input type="number" bind:value={app.settings.fill.seed} /></label>
      <button onclick={() => app.reshuffle()}>Reshuffle</button>
    </div>
  </fieldset>
</section>

<style>
  .panel { display: grid; gap: 0.45rem; padding: 0.9rem 1rem; border-bottom: 1px solid var(--panel-edge); }
  label { display: flex; align-items: center; gap: 0.5rem; }
  label span { flex: 1; }
  label.check { gap: 0.4rem; }
  .hint { margin: 0; font-size: 0.84rem; color: var(--muted); max-width: 32ch; }
  fieldset { border: 0; padding: 0; margin: 0; display: grid; gap: 0.45rem; }
  fieldset:disabled { opacity: 0.5; }
  .row { display: flex; gap: 0.5rem; align-items: center; }
  .row label { flex: 1; }
</style>
