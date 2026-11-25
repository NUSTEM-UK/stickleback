import type { Settings, SheetSize } from './types';

/** ISO 216 portrait dimensions, mm. */
export const SHEETS: Record<SheetSize, { w: number; h: number }> = {
  A5: { w: 148, h: 210 },
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
};

export function sheetDims(s: Settings): { w: number; h: number } {
  const d = SHEETS[s.sheet];
  return s.landscape ? { w: d.h, h: d.w } : { w: d.w, h: d.h };
}

export const UM = 1000;
export const toUm = (mm: number) => Math.round(mm * UM);
export const toMm = (um: number) => um / UM;
