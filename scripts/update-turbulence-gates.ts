/**
 * Update turbulence gates artifact from FRED (SP500 + VIXCLS)
 *
 * Fetches SP500 and VIXCLS from FRED, computes SPX 50-day MA and gate booleans,
 * writes public/turbulence.gates.json for Turbulence Model alignment (PR8).
 *
 * Env:
 * - FRED_API_KEY (required)
 * - TURBULENCE_GATES_START (optional; default "2019-10-01")
 */

import './load-env';

import { writeFileSync } from 'fs';
import { join } from 'path';

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

interface FredObservation {
  date: string;
  value: string;
}

interface FredResponse {
  observations?: FredObservation[];
}

interface TurbulenceGatePoint {
  date: string;
  spx: number | null;
  spx50dma: number | null;
  spxAbove50dma: boolean | null;
  vix: number | null;
  vixBelow25: boolean | null;
}

function parseValue(val: string): number | null {
  if (!val || val === '.') return null;
  const n = parseFloat(val);
  return Number.isFinite(n) ? n : null;
}

async function fetchFredSeries(
  seriesId: string,
  apiKey: string,
  start: string,
  end: string
): Promise<Map<string, number>> {
  const url = new URL(FRED_BASE);
  url.searchParams.set('series_id', seriesId);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('file_type', 'json');
  url.searchParams.set('observation_start', start);
  url.searchParams.set('observation_end', end);
  url.searchParams.set('sort_order', 'asc');

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`FRED API error for ${seriesId}: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as FredResponse;
  const obs = data.observations ?? [];
  const map = new Map<string, number>();
  for (const o of obs) {
    const v = parseValue(o.value);
    if (v !== null) map.set(o.date, v);
  }
  return map;
}

function computeSpx50dma(
  dates: string[],
  spxByDate: Map<string, number>
): Map<string, number> {
  const result = new Map<string, number>();
  const sortedDates = [...dates].sort();
  const validSpx: { date: string; value: number }[] = [];

  for (const date of sortedDates) {
    const spx = spxByDate.get(date);
    if (spx !== undefined) validSpx.push({ date, value: spx });

    if (validSpx.length >= 50) {
      const window = validSpx.slice(-50);
      const avg = window.reduce((s, p) => s + p.value, 0) / 50;
      result.set(date, avg);
    }
  }
  return result;
}

async function main() {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new Error('FRED_API_KEY environment variable is required');
  }

  const start = process.env.TURBULENCE_GATES_START || '2019-10-01';
  const end = new Date().toISOString().split('T')[0]!;

  console.log(`Fetching FRED SP500 and VIXCLS (${start} to ${end})...`);

  const [spxMap, vixMap] = await Promise.all([
    fetchFredSeries('SP500', apiKey, start, end),
    fetchFredSeries('VIXCLS', apiKey, start, end),
  ]);

  const allDates = new Set<string>([...spxMap.keys(), ...vixMap.keys()]);
  const dates = [...allDates].sort();

  const spx50dmaByDate = computeSpx50dma(dates, spxMap);

  const points: TurbulenceGatePoint[] = dates.map((date) => {
    const spx = spxMap.get(date) ?? null;
    const spx50dma = spx50dmaByDate.get(date) ?? null;
    const vix = vixMap.get(date) ?? null;

    const spxAbove50dma =
      spx !== null && spx50dma !== null ? spx > spx50dma : null;
    const vixBelow25 = vix !== null ? vix < 25 : null;

    return {
      date,
      spx,
      spx50dma,
      spxAbove50dma,
      vix,
      vixBelow25,
    };
  });

  const outPath = join(process.cwd(), 'public', 'turbulence.gates.json');
  writeFileSync(outPath, JSON.stringify(points, null, 2), 'utf-8');

  const last = points[points.length - 1];
  console.log(`\n✅ Wrote ${points.length} points to public/turbulence.gates.json`);
  console.log(`   Last date: ${last?.date ?? 'N/A'}`);
  if (last) {
    console.log(`   Last spx: ${last.spx ?? 'null'}`);
    console.log(`   Last spx50dma: ${last.spx50dma ?? 'null'}`);
    console.log(`   Last spxAbove50dma: ${last.spxAbove50dma ?? 'null'}`);
    console.log(`   Last vix: ${last.vix ?? 'null'}`);
    console.log(`   Last vixBelow25: ${last.vixBelow25 ?? 'null'}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
