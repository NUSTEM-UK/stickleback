import type { Bin, PartDef, Placement, Project, Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  width: 9,
  pitch: 9,
  holeDiameter: 1.0,
  slotWidth: 1.55,
  kerf: 0.04,
  filletRadius: 1,
  sheet: 'A4',
  landscape: false,
  margin: 5,
  fill: { enabled: false, seed: 1, minLength: 2, maxLength: 6, discs: true },
  acrylic: 'green',
};

export const ACRYLICS = {
  green: { label: 'Fluorescent green', hex: '#5cff3a' },
  orange: { label: 'Fluorescent orange', hex: '#ff7a1c' },
  pink: { label: 'Fluorescent pink', hex: '#ff3fa8' },
  yellow: { label: 'Fluorescent yellow', hex: '#e4ff2c' },
  blue: { label: 'Fluorescent blue', hex: '#2fd6ff' },
} as const;

export function makeProject(settings: Settings, parts: PartDef[], bin: Bin, placements?: Placement[]): Project {
  return {
    format: 'stickleback',
    version: 1,
    saved: new Date().toISOString(),
    settings,
    parts: parts.filter((p) => !p.builtin),
    bin: Object.fromEntries(Object.entries(bin).filter(([, q]) => q > 0)),
    placements,
  };
}

/** Accepts project JSON, or an SVG exported by this app (project in <metadata>). */
export function parseProject(text: string): Project {
  let json = text.trim();
  if (json.startsWith('<')) {
    const m = json.match(/<metadata id="(?:stickleback|drilled-sticks)-project"><!\[CDATA\[([\s\S]*?)\]\]><\/metadata>/);
    if (!m) throw new Error('This SVG has no Stickleback project data. Open an SVG exported by Stickleback, or a .json project file.');
    json = m[1];
  }
  const p = JSON.parse(json) as Project;
  // Files from before the rename say 'drilled-sticks'.
  if ((p.format as string) !== 'stickleback' && (p.format as string) !== 'drilled-sticks')
    throw new Error('Not a Stickleback project file.');
  if (p.version !== 1) throw new Error(`Unsupported project version ${p.version}.`);
  return {
    ...p,
    format: 'stickleback',
    settings: { ...DEFAULT_SETTINGS, ...p.settings, fill: { ...DEFAULT_SETTINGS.fill, ...p.settings?.fill } },
  };
}

export function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

const clamp = (v: unknown, lo: number, hi: number, dflt: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt;

/** Settings safe to compute with, whatever is half-typed into the form. */
export function sanitise(s: Settings): Settings {
  const d = DEFAULT_SETTINGS;
  const width = clamp(s.width, 2, 50, d.width);
  return {
    ...s,
    width,
    pitch: clamp(s.pitch, 1, 60, d.pitch),
    holeDiameter: clamp(s.holeDiameter, 0.1, width, d.holeDiameter),
    slotWidth: clamp(s.slotWidth, 0.1, width, d.slotWidth),
    kerf: clamp(s.kerf, 0, 1, d.kerf),
    filletRadius: clamp(s.filletRadius, 0, width / 4, d.filletRadius),
    acrylic: s.acrylic in ACRYLICS ? s.acrylic : d.acrylic,
    margin: clamp(s.margin, 0, 60, d.margin),
    fill: {
      ...s.fill,
      seed: Math.trunc(clamp(s.fill.seed, 0, 2 ** 32 - 1, d.fill.seed)),
      minLength: Math.round(clamp(s.fill.minLength, 2, 12, d.fill.minLength)),
      maxLength: Math.round(clamp(s.fill.maxLength, 2, 12, d.fill.maxLength)),
    },
  };
}
