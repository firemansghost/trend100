/**
 * Read-only diagnostics for MACRO subsection health-history integrity.
 * No provider calls. Does not write artifacts.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { isPolicyImpossibleStaleUnknown } from '../src/modules/trend100/engine/healthHistoryStaleUnknown';

const MACRO_SECTIONS = [
  'fx',
  'metals',
  'commodities',
  'energy',
  'uranium',
  'crypto',
  'dollar',
] as const;

const GAP_AFTER = '2026-02-18';

type Point = {
  date: string;
  regimeLabel?: string;
  knownCount?: number;
  eligibleCount?: number;
  totalTickers?: number;
};

function load(path: string): Point[] | null {
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8')) as Point[];
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

function longestGapAfter(dates: string[], after: string): { days: number; from: string; to: string } | null {
  const sorted = [...dates].filter((d) => d >= after).sort((a, b) => a.localeCompare(b));
  if (sorted.length === 0) return null;
  let best: { days: number; from: string; to: string } | null = {
    days: Math.floor((new Date(sorted[0]!).getTime() - new Date(after).getTime()) / 86400000),
    from: after,
    to: sorted[0]!,
  };
  for (let i = 1; i < sorted.length; i++) {
    const days = Math.floor(
      (new Date(sorted[i]!).getTime() - new Date(sorted[i - 1]!).getTime()) / 86400000
    );
    if (!best || days > best.days) {
      best = { days, from: sorted[i - 1]!, to: sorted[i]! };
    }
  }
  return best;
}

function main() {
  const publicDir = join(process.cwd(), 'public');
  console.log('=== MACRO subsection health-history integrity ===');
  for (const key of MACRO_SECTIONS) {
    const file = join(publicDir, `health-history.MACRO.${key}.json`);
    const pts = load(file);
    if (!pts) {
      console.log(`${key}: FILE_MISSING`);
      continue;
    }
    const valid = pts.filter((p) => p.regimeLabel && p.regimeLabel !== 'UNKNOWN');
    const unknown = pts.filter((p) => p.regimeLabel === 'UNKNOWN');
    const firstValid = valid[0]?.date ?? null;
    const suspicious = unknown.filter((p) => isPolicyImpossibleStaleUnknown(p)).length;
    const gap = longestGapAfter(
      pts.map((p) => p.date),
      GAP_AFTER
    );
    console.log(
      [
        `${key}:`,
        `total=${pts.length}`,
        `valid=${valid.length}`,
        `UNKNOWN=${unknown.length}`,
        `first=${pts[0]?.date ?? 'n/a'}`,
        `firstValid=${firstValid ?? 'none'}`,
        `last=${pts[pts.length - 1]?.date ?? 'n/a'}`,
        `suspiciousStaleUnknown=${suspicious}`,
        `longestGapAfter_${GAP_AFTER}=${gap ? `${gap.days}d (${gap.from} -> ${gap.to})` : 'n/a'}`,
      ].join(' ')
    );
  }
}

main();
