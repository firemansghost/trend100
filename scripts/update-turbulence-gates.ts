/**
 * Update turbulence gates artifact from Stooq (SPX + VIX EOD closes)
 *
 * Fetches SPX and VIX daily closes from Stooq CSV, computes SPX 50-day MA and
 * gate booleans, writes public/turbulence.gates.json for Turbulence Model (PR26).
 *
 * Replaces FRED to eliminate 0–1 day lag — gates now align with ShockZ timing.
 *
 * Env:
 * - TURBULENCE_GATES_START (optional; default "2019-10-01")
 * - TURBULENCE_STOOQ_SPX_SYMBOL (optional; default "^spx")
 * - TURBULENCE_STOOQ_VIX_SYMBOL (optional; default "vi.c" = S&P 500 VIX Cash)
 *   If set, tried first; on failure, fallback list is used. CI pins vi.c for stability.
 */

import './load-env';

import { writeFileSync } from 'fs';
import { join } from 'path';

const STOOQ_BASE = 'https://stooq.com/q/d/l/';

interface TurbulenceGatePoint {
  date: string;
  spx: number | null;
  spx50dma: number | null;
  spxAbove50dma: boolean | null;
  vix: number | null;
  vixBelow25: boolean | null;
}

function toYyyyMmDd(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

async function fetchStooqCsv(
  symbol: string,
  start: string,
  end: string
): Promise<Map<string, number>> {
  const d1 = toYyyyMmDd(start);
  const d2 = toYyyyMmDd(end);
  const url = `${STOOQ_BASE}?s=${encodeURIComponent(symbol)}&d1=${d1}&d2=${d2}&i=d`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Stooq fetch failed for ${symbol}: ${res.status} ${res.statusText}\nURL: ${url}`);
  }

  const text = await res.text();
  const trimmed = text.trim();

  if (!trimmed || trimmed === 'No data.' || trimmed.toLowerCase().includes('no data')) {
    throw new Error(
      `Stooq returned no data for symbol "${symbol}". URL used: ${url}\n` +
        'Hint: The symbol may be wrong. Try ^spx, ^gspc for SPX; ^vix for VIX.'
    );
  }

  const lines = trimmed.split('\n').filter((l) => l.trim());
  if (lines.length < 2) {
    throw new Error(
      `Stooq CSV has no data rows for symbol "${symbol}". URL used: ${url}\n` +
        'Hint: Check the symbol and date range.'
    );
  }

  const header = lines[0]!.toLowerCase();
  const closeIdx = header.split(',').findIndex((c) => c.trim() === 'close');
  const dateIdx = header.split(',').findIndex((c) => c.trim() === 'date');

  if (closeIdx < 0 || dateIdx < 0) {
    throw new Error(`Stooq CSV missing Date or Close column. URL: ${url}`);
  }

  const map = new Map<string, number>();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(',');
    const date = cols[dateIdx]?.trim();
    const closeStr = cols[closeIdx]?.trim();
    if (!date || !closeStr) continue;
    const close = parseFloat(closeStr);
    if (Number.isFinite(close)) map.set(date, close);
  }

  if (map.size === 0) {
    throw new Error(
      `Stooq CSV parsed 0 valid rows for symbol "${symbol}". URL used: ${url}\n` +
        'Hint: The symbol may be incorrect for this exchange.'
    );
  }

  return map;
}

const VIX_FALLBACK_SYMBOLS = ['vi.c', '^vix', '^VIX', 'vi.f'];

async function fetchVixWithFallback(
  start: string,
  end: string
): Promise<{ map: Map<string, number>; symbolUsed: string }> {
  const envSymbol = process.env.TURBULENCE_STOOQ_VIX_SYMBOL?.trim();
  const toTry = envSymbol ? [envSymbol, ...VIX_FALLBACK_SYMBOLS.filter((s) => s !== envSymbol)] : VIX_FALLBACK_SYMBOLS;

  let lastError: Error | null = null;
  let lastUrl = '';

  for (const symbol of toTry) {
    const d1 = toYyyyMmDd(start);
    const d2 = toYyyyMmDd(end);
    lastUrl = `${STOOQ_BASE}?s=${encodeURIComponent(symbol)}&d1=${d1}&d2=${d2}&i=d`;

    try {
      const res = await fetch(lastUrl);
      if (!res.ok) {
        lastError = new Error(`Stooq fetch failed: ${res.status} ${res.statusText}`);
        continue;
      }
      const text = await res.text();
      const trimmed = text.trim();
      if (!trimmed || trimmed === 'No data.' || trimmed.toLowerCase().includes('no data')) {
        lastError = new Error('Stooq returned no data');
        continue;
      }
      const lines = trimmed.split('\n').filter((l) => l.trim());
      if (lines.length < 2) {
        lastError = new Error('Stooq CSV has no data rows');
        continue;
      }
      const header = lines[0]!.toLowerCase();
      const closeIdx = header.split(',').findIndex((c) => c.trim() === 'close');
      const dateIdx = header.split(',').findIndex((c) => c.trim() === 'date');
      if (closeIdx < 0 || dateIdx < 0) {
        lastError = new Error('Stooq CSV missing Date or Close column');
        continue;
      }
      const map = new Map<string, number>();
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i]!.split(',');
        const date = cols[dateIdx]?.trim();
        const closeStr = cols[closeIdx]?.trim();
        if (!date || !closeStr) continue;
        const close = parseFloat(closeStr);
        if (Number.isFinite(close)) map.set(date, close);
      }
      if (map.size === 0) {
        lastError = new Error('Stooq CSV parsed 0 valid rows');
        continue;
      }
      return { map, symbolUsed: symbol };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      continue;
    }
  }

  throw new Error(
    `Stooq VIX: all symbols failed. Tried: ${toTry.join(', ')}. Last URL: ${lastUrl}. Last error: ${lastError?.message ?? 'unknown'}`
  );
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
  const start = process.env.TURBULENCE_GATES_START || '2019-10-01';
  const end = new Date().toISOString().split('T')[0]!;
  const spxSymbol = process.env.TURBULENCE_STOOQ_SPX_SYMBOL || '^spx';

  console.log(`Fetching Stooq ${spxSymbol} and VIX (${start} to ${end})...`);

  const [spxMap, vixResult] = await Promise.all([
    fetchStooqCsv(spxSymbol, start, end),
    fetchVixWithFallback(start, end),
  ]);

  const vixMap = vixResult.map;
  console.log(`   VIX symbol used: ${vixResult.symbolUsed}`);

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
