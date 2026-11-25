<script lang="ts">
  import { download, pdfBytes, svgString } from './lib/export';
  import { stamp } from './lib/project';
  import { app } from './lib/store.svelte';
  import type { PartDef } from './lib/types';
  import PartEditor from './components/PartEditor.svelte';
  import PartsBin from './components/PartsBin.svelte';
  import SettingsPanel from './components/SettingsPanel.svelte';
  import SheetPreview from './components/SheetPreview.svelte';
  import Mascot from './components/Mascot.svelte';
  import { ACRYLICS } from './lib/project';

  let editing = $state<{ part: PartDef | null } | null>(null);
  let error = $state('');
  let fileInput: HTMLInputElement;

  const base = () => `stickleback-${app.safe.sheet}-${stamp()}`;

  async function exportPdf() {
    const bytes = await pdfBytes(app.safe, app.plan, app.project());
    download(`${base()}.pdf`, bytes as BlobPart, 'application/pdf');
  }
  function exportSvg() {
    download(`${base()}.svg`, svgString(app.safe, app.plan, app.project()), 'image/svg+xml');
  }
  function saveProject() {
    download(`${base()}.json`, JSON.stringify(app.project(), null, 2), 'application/json');
  }
  async function loadProject(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!f) return;
    try {
      app.load(await f.text());
      error = '';
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    fileInput.value = '';
  }
</script>

<div class="app" style:--acrylic={ACRYLICS[app.safe.acrylic].hex}>
  <header class="top">
    <div class="brand">
      <Mascot size={46} />
      <h1>Stickleback</h1>
      <span class="tag">laser-cut stick sheets</span>
    </div>
    <div class="files">
      <button onclick={() => fileInput.click()}>Open project…</button>
      <input bind:this={fileInput} type="file" accept=".json,.svg,application/json,image/svg+xml" hidden onchange={loadProject} />
      <button onclick={saveProject}>Save project</button>
      <button onclick={exportSvg}>Export SVG</button>
      <button class="primary" onclick={exportPdf} disabled={app.plan.stats.pieces === 0}>Export PDF</button>
    </div>
  </header>
  {#if error}<p class="error" role="alert">{error} <button class="link" onclick={() => (error = '')}>Dismiss</button></p>{/if}

  <aside class="settings"><SettingsPanel /></aside>
  <main class="preview"><SheetPreview /></main>
  <aside class="parts"><PartsBin onedit={(p) => (editing = { part: p })} /></aside>
</div>

{#if editing}
  <div class="theme" style:--acrylic={ACRYLICS[app.safe.acrylic].hex}>
    <PartEditor part={editing.part} onclose={() => (editing = null)} />
  </div>
{/if}

<style>
  .app {
    height: 100vh;
    display: grid;
    grid-template-columns: 17rem 1fr 22rem;
    grid-template-rows: auto auto 1fr;
    grid-template-areas: 'top top top' 'err err err' 'settings preview parts';
  }
  .top {
    grid-area: top;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.55rem 1rem;
    background: var(--ink);
    color: white;
  }
  .brand { display: flex; align-items: center; gap: 0.7rem; }
  h1 { font-size: 1.45rem; letter-spacing: 0.01em; }
  .tag { color: rgb(255 255 255 / 0.55); font-size: 0.9rem; }
  @media (max-width: 700px) { .tag { display: none; } }
  .files { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .files button { background: transparent; color: white; border-color: rgb(255 255 255 / 0.35); }
  .files button:hover { border-color: white; }
  .files button.primary { background: var(--acrylic); border-color: var(--acrylic); color: var(--ink); font-weight: 600; }
  .files button.primary:hover { background: color-mix(in srgb, var(--acrylic) 80%, white); }
  .error { grid-area: err; margin: 0; padding: 0.5rem 1rem; background: #fff1e6; color: var(--warn); }
  .settings { grid-area: settings; background: var(--panel); border-right: 1px solid var(--panel-edge); overflow: auto; }
  .preview { grid-area: preview; min-width: 0; min-height: 0; }
  .parts { grid-area: parts; background: var(--panel); border-left: 1px solid var(--panel-edge); overflow: auto; }

  @media (max-width: 1000px) {
    .app {
      height: auto;
      grid-template-columns: 1fr;
      grid-template-rows: auto;
      grid-template-areas: 'top' 'err' 'preview' 'parts' 'settings';
    }
  }
</style>
