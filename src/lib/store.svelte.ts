import { buildCutPlan } from './cut';
import { computeLayout, type LayoutResult } from './layout';
import { builtinParts } from './parts';
import { DEFAULT_SETTINGS, makeProject, parseProject, sanitise } from './project';
import type { Bin, PartDef, Placement, Project, Settings } from './types';

const STORAGE_KEY = 'stickleback:v1';
const OLD_STORAGE_KEY = 'drilled-sticks:v1';
const BUILTINS = builtinParts();

interface Persisted {
  settings: Settings;
  custom: PartDef[];
  bin: Bin;
}

function restore(): Persisted {
  const fallback: Persisted = {
    settings: structuredClone(DEFAULT_SETTINGS),
    custom: [],
    bin: { 'straight-12': 4, 'straight-7': 4, 'straight-5': 6, 'straight-3': 6, 'T-5-2': 2, 'L-3x3': 2, 'plus-2': 1 },
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(OLD_STORAGE_KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Persisted;
    return {
      settings: { ...DEFAULT_SETTINGS, ...p.settings, fill: { ...DEFAULT_SETTINGS.fill, ...p.settings?.fill } },
      custom: p.custom ?? [],
      bin: p.bin ?? {},
    };
  } catch {
    return fallback;
  }
}

const inputsKey = (s: Settings, parts: PartDef[], bin: Bin) =>
  JSON.stringify([s, parts.filter((p) => !p.builtin), Object.entries(bin).filter(([, q]) => q > 0).sort()]);

class AppState {
  settings = $state<Settings>(DEFAULT_SETTINGS);
  custom = $state<PartDef[]>([]);
  bin = $state<Bin>({});
  /** A layout loaded from a file, used while nothing that affects packing has changed. */
  saved = $state<{ key: string; placements: Placement[] } | null>(null);

  parts = $derived<PartDef[]>([...BUILTINS, ...this.custom]);
  /** Settings with half-typed or out-of-range values replaced; all geometry uses these. */
  safe = $derived<Settings>(sanitise(this.settings));

  layout = $derived.by<LayoutResult & { fromFile: boolean }>(() => {
    const key = inputsKey(this.safe, this.parts, this.bin);
    const auto = computeLayout(this.safe, this.parts, this.bin);
    if (this.saved && this.saved.key === key) return { ...auto, placements: this.saved.placements, unplaced: {}, fromFile: true };
    return { ...auto, fromFile: false };
  });

  plan = $derived(buildCutPlan(this.safe, this.parts, this.layout.placements));

  constructor() {
    const p = restore();
    this.settings = p.settings;
    this.custom = p.custom;
    this.bin = p.bin;
    $effect.root(() => {
      $effect(() => {
        const data = JSON.stringify({ settings: this.settings, custom: this.custom, bin: this.bin });
        try {
          localStorage.setItem(STORAGE_KEY, data);
        } catch {
          /* storage unavailable: the app still works, it just won't remember */
        }
      });
    });
  }

  qty(id: string) {
    return this.bin[id] ?? 0;
  }
  setQty(id: string, q: number) {
    this.bin[id] = Math.max(0, Math.min(999, Math.round(q) || 0));
  }
  clearQuantities() {
    this.bin = {};
  }

  savePart(p: PartDef) {
    const i = this.custom.findIndex((c) => c.id === p.id);
    if (i >= 0) this.custom[i] = p;
    else this.custom.push(p);
  }
  deletePart(id: string) {
    this.custom = this.custom.filter((c) => c.id !== id);
    delete this.bin[id];
  }

  reshuffle() {
    this.settings.fill.seed = Math.floor(Math.random() * 1e9);
  }

  project(): Project {
    return makeProject($state.snapshot(this.safe), $state.snapshot(this.parts), $state.snapshot(this.bin), $state.snapshot(this.layout.placements));
  }

  load(text: string) {
    const p = parseProject(text);
    this.settings = p.settings;
    this.custom = p.parts.filter((x) => !x.builtin);
    this.bin = p.bin;
    this.saved = p.placements ? { key: inputsKey(sanitise(p.settings), [...BUILTINS, ...this.custom], p.bin), placements: p.placements } : null;
  }

  repack() {
    this.saved = null;
  }
}

export const app = new AppState();
