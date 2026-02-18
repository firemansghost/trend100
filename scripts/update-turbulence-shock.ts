/**
 * Update turbulence shock artifact (correlation structure shock)
 *
 * Computes a proxy "covariance/correlation shock" metric using US_SECTORS ETF universe.
 * Uses EOD cache data; writes public/turbulence.shock.json for Turbulence Model alignment (PR9).
 *
 * Env:
 * - TURBULENCE_SHOCK_START (optional; default "2019-10-01")
 */

import './load-env';

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { EodBar } from '../src/modules/trend100/data/providers/marketstack';
import { getDeck } from '../src/modules/trend100/data/decks';

const EOD_CACHE_DIR = join(process.cwd(), 'data', 'marketstack', 'eod');
const SHOCK_UNIVERSE_FALLBACK = [
  'SPY', 'XLB', 'XLC', 'XLE', 'XLF', 'XLI', 'XLK', 'XLP', 'XLRE', 'XLU', 'XLV', 'XLY',
];

const SHORT_WINDOW = 20;
const LONG_WINDOW = 60;
const TRAILING_Z_WINDOW = 252;
const MIN_ASSETS_FLOOR = 6;
const MIN_ASSETS_TARGET = 8;
const RECENT_WINDOW_DAYS = 7;
const MIN_Z_POINTS = 100;

interface ShockPoint {
  date: string;
  nAssets: number;
  nPairs: number;
  shockRaw: number | null;
  shockZ: number | null;
}

function loadEodCache(symbol: string): EodBar[] | null {
  const fileName = `${symbol.replace(/\./g, '_')}.json`;
  const filePath = join(EOD_CACHE_DIR, fileName);
  if (!existsSync(filePath)) return null;
  try {
    const content = readFileSync(filePath, 'utf-8');
    const bars = JSON.parse(content) as EodBar[];
    if (!Array.isArray(bars)) return null;
    return bars.sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return null;
  }
}

function getShockUniverse(): string[] {
  try {
    const deck = getDeck('US_SECTORS');
    const symbols = deck.universe.map((item) => item.providerTicker ?? item.ticker);
    if (symbols.length >= MIN_ASSETS_FLOOR) return symbols;
  } catch {
    // fallback
  }
  return SHOCK_UNIVERSE_FALLBACK;
}

function daysBetween(a: string, b: string): number {
  return Math.floor(
    (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24)
  );
}

function computeCorrelationMatrix(returnsMatrix: number[][]): number[][] {
  const n = returnsMatrix.length;
  const m = returnsMatrix[0]?.length ?? 0;
  const corr: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    corr[i]![i] = 1;
    for (let j = i + 1; j < n; j++) {
      const ri = returnsMatrix[i]!;
      const rj = returnsMatrix[j]!;
      let sumRi = 0, sumRj = 0, sumRi2 = 0, sumRj2 = 0, sumRiRj = 0;
      let count = 0;
      for (let k = 0; k < m; k++) {
        const vi = ri[k];
        const vj = rj[k];
        if (vi != null && !Number.isNaN(vi) && vj != null && !Number.isNaN(vj)) {
          sumRi += vi;
          sumRj += vj;
          sumRi2 += vi * vi;
          sumRj2 += vj * vj;
          sumRiRj += vi * vj;
          count++;
        }
      }
      if (count < 2) {
        corr[i]![j] = 0;
        corr[j]![i] = 0;
      } else {
        const meanRi = sumRi / count;
        const meanRj = sumRj / count;
        const stdRi = Math.sqrt(Math.max(0, sumRi2 / count - meanRi * meanRi));
        const stdRj = Math.sqrt(Math.max(0, sumRj2 / count - meanRj * meanRj));
        const cov = sumRiRj / count - meanRi * meanRj;
        const r = stdRi > 0 && stdRj > 0 ? cov / (stdRi * stdRj) : 0;
        corr[i]![j] = r;
        corr[j]![i] = r;
      }
    }
  }
  return corr;
}

function frobeniusOffDiagonal(corrShort: number[][], corrLong: number[][]): number {
  const n = corrShort.length;
  let sumSq = 0;
  let numPairs = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = (corrShort[i]![j] ?? 0) - (corrLong[i]![j] ?? 0);
      sumSq += d * d;
      numPairs++;
    }
  }
  return numPairs > 0 ? Math.sqrt(sumSq / numPairs) : 0;
}

function main() {
  const start = process.env.TURBULENCE_SHOCK_START || '2019-10-01';

  const symbols = getShockUniverse();
  console.log(`Turbulence shock universe: ${symbols.join(', ')}`);

  const barsBySymbol = new Map<string, EodBar[]>();
  for (const sym of symbols) {
    const bars = loadEodCache(sym);
    if (bars && bars.length > 0) {
      barsBySymbol.set(sym, bars);
    }
  }

  if (barsBySymbol.size < MIN_ASSETS_FLOOR) {
    throw new Error(
      `Need at least ${MIN_ASSETS_FLOOR} symbols with EOD cache; found ${barsBySymbol.size}. Run update:snapshots first.`
    );
  }

  const maxDate = [...barsBySymbol.values()]
    .map((bars) => bars[bars.length - 1]!.date)
    .sort()
    .pop()!;
  const recentUniverse = symbols.filter((sym) => {
    const bars = barsBySymbol.get(sym);
    if (!bars || bars.length === 0) return false;
    const lastBarDate = bars[bars.length - 1]!.date;
    return Math.abs(daysBetween(lastBarDate, maxDate)) <= RECENT_WINDOW_DAYS;
  });
  const minAssetsEffective = Math.max(
    MIN_ASSETS_FLOOR,
    Math.min(MIN_ASSETS_TARGET, recentUniverse.length)
  );

  console.log(`Recent universe (${recentUniverse.length}): ${recentUniverse.join(', ')}`);
  console.log(`minAssetsEffective: ${minAssetsEffective}`);

  const allDates = new Set<string>();
  for (const bars of barsBySymbol.values()) {
    for (const b of bars) {
      if (b.date >= start) allDates.add(b.date);
    }
  }
  const dates = [...allDates].sort();

  const closeByDate = new Map<string, Map<string, number>>();
  for (const sym of recentUniverse) {
    const bars = barsBySymbol.get(sym)!;
    for (const b of bars) {
      if (b.date < start) continue;
      let m = closeByDate.get(b.date);
      if (!m) {
        m = new Map();
        closeByDate.set(b.date, m);
      }
      m.set(sym, b.close);
    }
  }

  const dateIndex = new Map<string, number>();
  dates.forEach((d, i) => dateIndex.set(d, i));

  const returnsBySymbol = new Map<string, (number | null)[]>();
  for (const sym of recentUniverse) {
    const bars = barsBySymbol.get(sym)!;
    const arr: (number | null)[] = new Array(dates.length).fill(null);
    const closeMap = new Map(bars.map((b) => [b.date, b.close]));
    for (let i = 0; i < dates.length; i++) {
      const d = dates[i]!;
      const prevIdx = dateIndex.get(d) ?? 0;
      if (prevIdx === 0) continue;
      const prevDate = dates[prevIdx - 1];
      if (!prevDate) continue;
      const close = closeMap.get(d);
      const prevClose = closeMap.get(prevDate);
      if (close != null && prevClose != null && prevClose > 0) {
        arr[i] = Math.log(close / prevClose);
      }
    }
    returnsBySymbol.set(sym, arr);
  }

  const points: ShockPoint[] = [];
  const shockRawSeries: (number | null)[] = [];

  for (let idx = LONG_WINDOW; idx < dates.length; idx++) {
    const date = dates[idx]!;
    const shortStart = idx - SHORT_WINDOW + 1;
    const longStart = idx - LONG_WINDOW + 1;

    const validSymbols: string[] = [];
    for (const sym of recentUniverse) {
      const rets = returnsBySymbol.get(sym);
      if (!rets) continue;
      let shortCount = 0;
      let longCount = 0;
      for (let k = shortStart; k <= idx; k++) {
        if (rets[k] != null && !Number.isNaN(rets[k]!)) shortCount++;
      }
      for (let k = longStart; k <= idx; k++) {
        if (rets[k] != null && !Number.isNaN(rets[k]!)) longCount++;
      }
      if (shortCount >= SHORT_WINDOW && longCount >= LONG_WINDOW) {
        validSymbols.push(sym);
      }
    }

    const minForDate = Math.max(MIN_ASSETS_FLOOR, Math.min(MIN_ASSETS_TARGET, validSymbols.length));
    if (validSymbols.length < minForDate) {
      points.push({
        date,
        nAssets: validSymbols.length,
        nPairs: (validSymbols.length * (validSymbols.length - 1)) / 2,
        shockRaw: null,
        shockZ: null,
      });
      shockRawSeries.push(null);
      continue;
    }

    const shortRets: number[][] = validSymbols.map((sym) => {
      const r = returnsBySymbol.get(sym)!;
      return r.slice(shortStart, idx + 1) as number[];
    });
    const longRets: number[][] = validSymbols.map((sym) => {
      const r = returnsBySymbol.get(sym)!;
      return r.slice(longStart, idx + 1) as number[];
    });

    const corrShort = computeCorrelationMatrix(shortRets);
    const corrLong = computeCorrelationMatrix(longRets);
    const shockRaw = frobeniusOffDiagonal(corrShort, corrLong);

    const nPairs = (validSymbols.length * (validSymbols.length - 1)) / 2;
    points.push({
      date,
      nAssets: validSymbols.length,
      nPairs,
      shockRaw,
      shockZ: null,
    });
    shockRawSeries.push(shockRaw);
  }

  for (let i = 0; i < points.length; i++) {
    const zStart = Math.max(0, i - TRAILING_Z_WINDOW + 1);
    const window = shockRawSeries.slice(zStart, i + 1).filter((v): v is number => v != null);
    if (window.length >= MIN_Z_POINTS) {
      const mean = window.reduce((a, b) => a + b, 0) / window.length;
      const variance =
        window.reduce((a, b) => a + (b - mean) ** 2, 0) / window.length;
      const std = Math.sqrt(variance) || 1e-10;
      const raw = points[i]!.shockRaw;
      if (raw != null) {
        points[i]!.shockZ = (raw - mean) / std;
      }
    }
  }

  const lastComputedIdx = [...points].reverse().findIndex((p) => p.shockRaw != null);
  const trimmedPoints =
    lastComputedIdx >= 0
      ? points.slice(0, points.length - lastComputedIdx)
      : points;
  const lastComputedDate = trimmedPoints[trimmedPoints.length - 1]?.date ?? null;
  if (lastComputedIdx > 0) {
    console.log(`Trimmed ${lastComputedIdx} trailing null rows; last computed: ${lastComputedDate}`);
  }

  const outPath = join(process.cwd(), 'public', 'turbulence.shock.json');
  writeFileSync(outPath, JSON.stringify(trimmedPoints, null, 2), 'utf-8');

  const nonNullRaw = trimmedPoints.filter((p) => p.shockRaw != null).length;
  const nonNullZ = trimmedPoints.filter((p) => p.shockZ != null).length;
  const pctNullRaw = trimmedPoints.length > 0 ? ((trimmedPoints.length - nonNullRaw) / trimmedPoints.length) * 100 : 0;
  const pctNullZ = trimmedPoints.length > 0 ? ((trimmedPoints.length - nonNullZ) / trimmedPoints.length) * 100 : 0;

  const rawVals = trimmedPoints.map((p) => p.shockRaw).filter((v): v is number => v != null);
  const minRaw = rawVals.length > 0 ? Math.min(...rawVals) : null;
  const maxRaw = rawVals.length > 0 ? Math.max(...rawVals) : null;

  console.log(`\n✅ Wrote ${trimmedPoints.length} points to public/turbulence.shock.json`);
  console.log(`   First: ${trimmedPoints[0]?.date ?? 'N/A'}, Last: ${lastComputedDate ?? 'N/A'}`);
  console.log(`   shockRaw: ${nonNullRaw} non-null (${pctNullRaw.toFixed(1)}% null)`);
  console.log(`   shockZ: ${nonNullZ} non-null (${pctNullZ.toFixed(1)}% null)`);
  if (minRaw != null && maxRaw != null) {
    console.log(`   shockRaw range: ${minRaw.toFixed(4)} to ${maxRaw.toFixed(4)}`);
  }
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
