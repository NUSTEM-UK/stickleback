import { PDFDocument, rgb } from 'pdf-lib';
import type { CutPlan } from './cut';
import type { Ring } from './geometry';
import { sheetDims } from './sheet';
import type { Project, Settings } from './types';

/** Epilog treats 0.001″ (0.0254 mm, 0.072 pt) strokes as vector cuts. */
export const HAIRLINE_MM = 0.0254;
export const CUT_INNER = '#FF0000'; // holes and slots: map this colour to run first
export const CUT_OUTER = '#000000';

const f = (um: number) => (um / 1000).toFixed(3).replace(/\.?0+$/, '');

function pathD(pts: number[], closed: boolean): string {
  let d = `M${f(pts[0])} ${f(pts[1])}`;
  for (let i = 2; i < pts.length; i += 2) d += `L${f(pts[i])} ${f(pts[i + 1])}`;
  return closed ? d + 'Z' : d;
}

export function svgString(s: Settings, plan: CutPlan, project?: Project): string {
  const { w, h } = sheetDims(s);
  const meta = project
    ? `<metadata id="stickleback-project"><![CDATA[${JSON.stringify(project)}]]></metadata>`
    : '';
  const holes = plan.holes.map((c) => `<circle cx="${f(c.cx)}" cy="${f(c.cy)}" r="${f(c.r)}"/>`).join('');
  const slots = plan.slots.map((r: Ring) => `<path d="${pathD(r, true)}"/>`).join('');
  const outer = plan.outlines.map((p) => `<path d="${pathD(p.pts, p.closed)}"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">
${meta}
<g id="inner-cuts" fill="none" stroke="${CUT_INNER}" stroke-width="${HAIRLINE_MM}">${holes}${slots}</g>
<g id="outer-cuts" fill="none" stroke="${CUT_OUTER}" stroke-width="${HAIRLINE_MM}" stroke-linejoin="round">${outer}</g>
</svg>
`;
}

const MM_TO_PT = 72 / 25.4;

export async function pdfBytes(s: Settings, plan: CutPlan, project: Project): Promise<Uint8Array> {
  const { w, h } = sheetDims(s);
  const doc = await PDFDocument.create();
  doc.setTitle('Stickleback cut sheet');
  doc.setCreator('Stickleback');
  doc.setSubject(`${s.sheet}${s.landscape ? ' landscape' : ''}, ${s.width} mm sticks, ${s.pitch} mm pitch`);
  const page = doc.addPage([w * MM_TO_PT, h * MM_TO_PT]);
  const H = h * MM_TO_PT;
  const lw = HAIRLINE_MM * MM_TO_PT;
  const pt = (um: number) => (um / 1000) * MM_TO_PT;
  const red = rgb(1, 0, 0);
  const black = rgb(0, 0, 0);
  // drawSvgPath takes SVG-style coordinates (y down) relative to (x, y), so build paths in points.
  const svgPt = (pts: number[], closed: boolean) => {
    let d = `M${pt(pts[0])} ${pt(pts[1])}`;
    for (let i = 2; i < pts.length; i += 2) d += `L${pt(pts[i])} ${pt(pts[i + 1])}`;
    return closed ? d + 'Z' : d;
  };
  // Inner cuts first in the content stream too.
  // Holes as two SVG arcs each (pdf-lib turns these into Bézier curves inside one clean path).
  for (const c of plan.holes) {
    const x = pt(c.cx);
    const y = pt(c.cy);
    const r = pt(c.r);
    page.drawSvgPath(`M${x + r} ${y}A${r} ${r} 0 1 0 ${x - r} ${y}A${r} ${r} 0 1 0 ${x + r} ${y}Z`, {
      x: 0,
      y: H,
      borderColor: red,
      borderWidth: lw,
    });
  }
  for (const r of plan.slots) page.drawSvgPath(svgPt(r, true), { x: 0, y: H, borderColor: red, borderWidth: lw });
  for (const p of plan.outlines) {
    page.drawSvgPath(svgPt(p.pts, p.closed), { x: 0, y: H, borderColor: black, borderWidth: lw });
  }
  await doc.attach(new TextEncoder().encode(JSON.stringify(project, null, 2)), 'stickleback-project.json', {
    mimeType: 'application/json',
    description: 'Settings, parts and layout for reopening in Stickleback',
  });
  doc.setKeywords(['stickleback', 'project JSON attached']);
  return doc.save();
}

export function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
