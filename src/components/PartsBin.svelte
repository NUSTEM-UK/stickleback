<script lang="ts">
  import { app } from '../lib/store.svelte';
  import { kindOf, rowLength, pitchUm, widthUm } from '../lib/layout';
  import type { PartCategory, PartDef } from '../lib/types';
  import PartThumb from './PartThumb.svelte';

  let { onedit }: { onedit: (p: PartDef | null) => void } = $props();

  const groups: { title: string; cats: PartCategory[] }[] = [
    { title: 'Straights', cats: ['straight'] },
    { title: 'Discs and short pieces', cats: ['disc', 'short'] },
    { title: 'Slotted', cats: ['slotted'] },
    { title: 'Shapes', cats: ['shape'] },
    { title: 'Your parts', cats: ['custom'] },
  ];

  const total = $derived(Object.values(app.bin).reduce((a, q) => a + (q || 0), 0));

  function detail(p: PartDef): string {
    const pitch = p.pitch !== undefined ? `${p.pitch} mm pitch` : '';
    const holes = p.nodes.filter((n) => n.s === 'hole').length;
    const bits = [`${holes} hole${holes === 1 ? '' : 's'}`];
    if (pitch) bits.push(pitch);
    if (kindOf(app.safe, p) === 'row' && p.nodes.length > 1) bits.push(`${(rowLength(app.safe, p) / 1000).toFixed(1)} mm long`);
    else if (p.nodes.length > 1 && pitchUm(app.safe, p) === widthUm(app.safe) && p.category === 'straight')
      bits.push(`${(p.nodes.length * app.safe.width).toFixed(0)} mm long`);
    return bits.join(', ');
  }
</script>

<div class="bin">
  <header>
    <h2>Parts to cut</h2>
    <span class="count">{total} requested</span>
  </header>
  <div class="actions">
    <button class="primary" onclick={() => onedit(null)}>New part…</button>
    <button onclick={() => app.clearQuantities()} disabled={total === 0}>Set all to 0</button>
  </div>

  {#each groups as g}
    {@const items = app.parts.filter((p) => g.cats.includes(p.category))}
    {#if items.length || g.cats.includes('custom')}
      <h3>{g.title}</h3>
      {#if items.length === 0}
        <p class="empty">Design T, L, + and other pieces on the dot grid with <em>New part</em>.</p>
      {/if}
      <ul>
        {#each items as p (p.id)}
          {@const q = app.qty(p.id)}
          <li class:active={q > 0}>
            <PartThumb part={p} settings={app.safe} size={52} />
            <div class="meta">
              <span class="name">{p.name}</span>
              <span class="detail">{detail(p)}</span>
              <span class="tools">
                <button class="link" onclick={() => onedit(p)}>{p.builtin ? 'Copy and edit' : 'Edit'}</button>
                {#if !p.builtin}
                  <button class="link" onclick={() => app.deletePart(p.id)}>Delete</button>
                {/if}
              </span>
            </div>
            <div class="qty">
              <button aria-label="One fewer {p.name}" onclick={() => app.setQty(p.id, q - 1)} disabled={q === 0}>−</button>
              <input
                type="number"
                min="0"
                aria-label="Quantity of {p.name}"
                value={q}
                oninput={(e) => app.setQty(p.id, +e.currentTarget.value)}
              />
              <button aria-label="One more {p.name}" onclick={() => app.setQty(p.id, q + 1)}>+</button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  {/each}
</div>

<style>
  .bin { padding: 0.9rem 1rem 2rem; }
  header { display: flex; align-items: baseline; justify-content: space-between; }
  .count { color: var(--muted); font-size: 0.9rem; }
  .actions { display: flex; gap: 0.5rem; margin: 0.6rem 0 0.4rem; }
  h3 { margin: 1rem 0 0.35rem; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  li {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 0.6rem;
    align-items: center;
    padding: 0.3rem 0.4rem;
    border-radius: var(--radius-s);
  }
  li.active { background: white; box-shadow: inset 3px 0 0 var(--acrylic-deep); }
  .meta { display: grid; min-width: 0; }
  .name { font-weight: 500; }
  .detail { font-size: 0.82rem; color: var(--muted); }
  .tools { display: flex; gap: 0.2rem; margin-left: -0.25rem; font-size: 0.82rem; }
  .qty { display: flex; align-items: center; gap: 2px; }
  .qty button { width: 1.8rem; padding: 0.2rem 0; }
  .qty input { width: 3.2rem; text-align: center; }
  .empty { margin: 0; color: var(--muted); font-size: 0.88rem; }
</style>
