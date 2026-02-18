/**
 * Update turbulence green bar artifact (derived from gates + shock)
 *
 * Joins turbulence.gates.json and turbulence.shock.json by date.
 * Green Bar active when: shockZ >= threshold AND spxAbove50dma === true AND vixBelow25 === true.
 * Writes public/turbulence.greenbar.json for Turbulence Model alignment (PR10).
 *
 * Env:
 * - TURBULENCE_SHOCK_Z_THRESHOLD (optional; default "2.0")
 */

import './load-env';

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const PUBLIC_DIR = join(process.cwd(), 'public');

interface GatePoint {
  date: string;
  spxAbove50dma: boolean | null;
  vixBelow25: boolean | null;
}

interface ShockPoint {
  date: string;
  shockRaw: number | null;
  shockZ: number | null;
}

interface GreenBarPoint {
  date: string;
  shockZ: number | null;
  shockRaw: number | null;
  spxAbove50dma: boolean | null;
  vixBelow25: boolean | null;
  isGreenBar: boolean;
}

function main() {
  const threshold = parseFloat(process.env.TURBULENCE_SHOCK_Z_THRESHOLD || '2.0') || 2.0;

  const gatesPath = join(PUBLIC_DIR, 'turbulence.gates.json');
  const shockPath = join(PUBLIC_DIR, 'turbulence.shock.json');

  if (!existsSync(gatesPath)) {
    throw new Error('turbulence.gates.json not found. Run update:turbulence-gates first.');
  }
  if (!existsSync(shockPath)) {
    throw new Error('turbulence.shock.json not found. Run update:turbulence-shock first.');
  }

  const gatesRaw = JSON.parse(readFileSync(gatesPath, 'utf-8')) as GatePoint[];
  const shockRaw = JSON.parse(readFileSync(shockPath, 'utf-8')) as ShockPoint[];

  const gatesByDate = new Map<string, GatePoint>();
  for (const g of gatesRaw) {
    gatesByDate.set(g.date, g);
  }
  const shockByDate = new Map<string, ShockPoint>();
  for (const s of shockRaw) {
    shockByDate.set(s.date, s);
  }

  const lastComputedShockDate = [...shockRaw].reverse().find((s) => s.shockRaw != null)?.date ?? null;
  const dates = [...shockByDate.keys()].sort();

  const points: GreenBarPoint[] = dates.map((date) => {
    const gate = gatesByDate.get(date);
    const shock = shockByDate.get(date);

    const shockZ = shock?.shockZ ?? null;
    const shockRawVal = shock?.shockRaw ?? null;
    const spxAbove50dma = gate?.spxAbove50dma ?? null;
    const vixBelow25 = gate?.vixBelow25 ?? null;

    const isGreenBar =
      shockZ != null &&
      shockZ >= threshold &&
      spxAbove50dma === true &&
      vixBelow25 === true;

    return {
      date,
      shockZ,
      shockRaw: shockRawVal,
      spxAbove50dma,
      vixBelow25,
      isGreenBar,
    };
  });

  const outPath = join(PUBLIC_DIR, 'turbulence.greenbar.json');
  writeFileSync(outPath, JSON.stringify(points, null, 2), 'utf-8');

  const countGreenBars = points.filter((p) => p.isGreenBar).length;
  const today = new Date().toISOString().split('T')[0]!;
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const oneYearAgoStr = oneYearAgo.toISOString().split('T')[0]!;
  const countGreenBarsLast365 = points.filter(
    (p) => p.isGreenBar && p.date >= oneYearAgoStr
  ).length;
  const lastGreenBar = [...points].reverse().find((p) => p.isGreenBar);
  const last = points[points.length - 1];

  console.log(`\n✅ Wrote ${points.length} points to public/turbulence.greenbar.json`);
  console.log(`   Threshold: shockZ >= ${threshold}`);
  console.log(`   Last date: ${last?.date ?? 'N/A'} (aligned to last computed shock: ${lastComputedShockDate ?? 'N/A'})`);
  console.log(`   Green bars: ${countGreenBars} all-time, ${countGreenBarsLast365} last 365d`);
  console.log(`   Last green bar: ${lastGreenBar?.date ?? 'none'}`);
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
