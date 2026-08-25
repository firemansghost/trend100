/**
 * Update turbulence shock artifact (correlation structure shock)
 *
 * Computes a proxy "covariance/correlation shock" metric using US_SECTORS ETF universe.
 * Uses EOD cache data; writes public/turbulence.shock.json for Turbulence Model alignment (PR9).
 *
 * Shock calendar: a session is included only if SPY has a close AND at least
 * MIN_ASSETS_TARGET recent-universe symbols have closes. Returns use adjacent
 * *qualified* dates so sparse union-only prints cannot null out 60-day windows.
 *
 * Shock calculation acceptance: still the existing floor-6 minForDate policy
 * TEMPORARILY. MIN_ASSETS_TARGET is NOT fully enforced on shockRaw until a
 * post-calendar audit. Do not treat minAssetsEffective as a hard gate.
 *
 * Env:
 * - TURBULENCE_SHOCK_START (optional; default "2019-10-01")
 */

import './load-env';

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { EodBar } from '../src/modules/trend100/data/providers/marketstack';
import { getDeck } from '../src/modules/trend100/data/decks';
import {
  buildQualifiedShockCalendar,
  logReturnsOnQualifiedDates,
  SHOCK_CALENDAR_SPY_SYMBOL,
} from '../src/modules/trend100/engine/shockCalendar';
import {
  duplicateBarDates,
  incompleteQualifiedDates,
  longWindowCloseDateRange,
  missingOrInvalidCloses,
  nullReturnSlotsInLongWindow,
  shouldLogEligibilityRow,
  windowCountsForSymbol,
  type EligibilityRow,
} from '../src/modules/trend100/engine/shockEligibilityDiag';

const EOD_CACHE_DIR = join(process.cwd(), 'data', 'marketstack', 'eod');
const SHOCK_UNIVERSE_FALLBACK = [
  'SPY', 'XLB', 'XLC', 'XLE', 'XLF', 'XLI', 'XLK', 'XLP', 'XLRE', 'XLU', 'XLV', 'XLY',
];

const SHORT_WINDOW = 20;
const LONG_WINDOW = 60;
const TRAILING_Z_WINDOW = 252;
const MIN_ASSETS_FLOOR = 6;
/** Calendar qualification uses this as the participation floor (SPY + >= this many closes). */
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
  console.log(`minAssetsEffective: ${minAssetsEffective} (logged only; shockRaw still uses floor-6 minForDate)`);

  const allDates = new Set<string>();
  for (const bars of barsBySymbol.values()) {
    for (const b of bars) {
      if (b.date >= start) allDates.add(b.date);
    }
  }
  const unionDates = [...allDates].sort();

  const symbolsWithCloseByDate = new Map<string, Set<string>>();
  for (const sym of recentUniverse) {
    const bars = barsBySymbol.get(sym)!;
    for (const b of bars) {
      if (b.date < start) continue;
      let present = symbolsWithCloseByDate.get(b.date);
      if (!present) {
        present = new Set();
        symbolsWithCloseByDate.set(b.date, present);
      }
      present.add(sym);
    }
  }

  const calendar = buildQualifiedShockCalendar({
    unionDates,
    symbolsWithCloseByDate,
    recentUniverse,
    minAssetsTarget: MIN_ASSETS_TARGET,
    spySymbol: SHOCK_CALENDAR_SPY_SYMBOL,
  });
  const dates = calendar.qualifiedDates;
  const discardedSince2023 = calendar.discarded.filter((d) => d.date >= '2023-01-01');

  console.log(`Shock calendar: union=${calendar.unionDates.length} qualified=${dates.length} discarded=${calendar.discarded.length}`);
  console.log(`Latest qualified date: ${dates[dates.length - 1] ?? 'n/a'}`);
  if (discardedSince2023.length > 0) {
    const preview = discardedSince2023.length > 24 ? discardedSince2023.slice(-24) : discardedSince2023;
    console.log(
      `Discarded union/low-participation dates since 2023: ${discardedSince2023.length} (showing ${preview.length})`
    );
    for (const d of preview) {
      console.log(
        `  ${d.date} nCloses=${d.symbolCount} spyClose=${d.spyHadClose ? 'yes' : 'no'}`
      );
    }
  }

  const returnsBySymbol = new Map<string, (number | null)[]>();
  const closeMapsBySymbol = new Map<string, Map<string, number>>();
  for (const sym of recentUniverse) {
    const bars = barsBySymbol.get(sym)!;
    const closeMap = new Map(bars.map((b) => [b.date, b.close]));
    closeMapsBySymbol.set(sym, closeMap);
    returnsBySymbol.set(sym, logReturnsOnQualifiedDates(dates, closeMap));
  }

  const points: ShockPoint[] = [];
  const shockRawSeries: (number | null)[] = [];
  const eligibilityRows: EligibilityRow[] = [];

  for (let idx = LONG_WINDOW; idx < dates.length; idx++) {
    const date = dates[idx]!;
    const shortStart = idx - SHORT_WINDOW + 1;
    const longStart = idx - LONG_WINDOW + 1;

    const validSymbols: string[] = [];
    let shortEligibleCount = 0;
    let longEligibleCount = 0;
    for (const sym of recentUniverse) {
      const rets = returnsBySymbol.get(sym);
      if (!rets) continue;
      const counts = windowCountsForSymbol(rets, idx, SHORT_WINDOW, LONG_WINDOW);
      if (counts.shortCount >= SHORT_WINDOW) shortEligibleCount += 1;
      if (counts.longCount >= LONG_WINDOW) longEligibleCount += 1;
      if (counts.eligible) {
        validSymbols.push(sym);
      }
    }
    const excluded = recentUniverse.filter((s) => !validSymbols.includes(s));
    const nCloses = symbolsWithCloseByDate.get(date)?.size ?? 0;

    // ShockRaw acceptance: TEMPORARY floor-6 policy (minForDate tautology for n>=6).
    // Calendar already required SPY + >= MIN_ASSETS_TARGET closes. Do not treat this
    // as enforcing MIN_ASSETS_TARGET on the correlation universe yet.
    const minForDate = Math.max(MIN_ASSETS_FLOOR, Math.min(MIN_ASSETS_TARGET, validSymbols.length));
    const shockRawNull = validSymbols.length < minForDate;
    eligibilityRows.push({
      date,
      idx,
      nCloses,
      shortEligibleCount,
      longEligibleCount,
      validSymbolsCount: validSymbols.length,
      excluded,
      shockRawNull,
    });
    if (shockRawNull) {
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

  // --- Temporary trailing-null diagnostics (no model change) ---
  const lastIdx = dates.length - 1;
  const lastDate = dates[lastIdx];
  const last80Qualified = dates.slice(-80);
  const last61 = dates.slice(-61);
  const last65 = dates.slice(-65);
  const last80Rows = eligibilityRows.slice(-80);

  console.log('\n=== Shock eligibility diagnostics (no model change) ===');
  console.log(
    `Qualified dates=${dates.length} last=${lastDate ?? 'n/a'} eligibilityRows=${eligibilityRows.length}`
  );
  console.log(
    `60 returns require 61 closes: last61=${last61[0] ?? 'n/a'}..${last61[last61.length - 1] ?? 'n/a'} (n=${last61.length}) last65 n=${last65.length}`
  );

  console.log('\nCache at shock execution (per symbol):');
  for (const sym of recentUniverse) {
    const bars = barsBySymbol.get(sym) ?? [];
    const closeMap = closeMapsBySymbol.get(sym) ?? new Map();
    const dups = duplicateBarDates(bars.map((b) => b.date));
    const last80Bad = missingOrInvalidCloses(last80Qualified, closeMap);
    const last61Cov = missingOrInvalidCloses(last61, closeMap);
    const last61Present = last61.filter((d) => closeMap.has(d)).length;
    console.log(
      `  ${sym}: bars=${bars.length} first=${bars[0]?.date ?? 'n/a'} last=${bars[bars.length - 1]?.date ?? 'n/a'} last61Closes=${last61Present}/${last61.length}`
    );
    if (dups.length) console.log(`    duplicateDates=${dups.join(',')}`);
    if (last61Cov.missing.length) {
      console.log(`    missingCloses last61 (${last61Cov.missing.length}): ${last61Cov.missing.join(',')}`);
    }
    if (last61Cov.invalid.length) {
      console.log(
        `    invalidCloses last61: ${last61Cov.invalid.map((x) => `${x.date}=${x.close}`).join(',')}`
      );
    }
    if (last80Bad.invalid.length) {
      console.log(
        `    invalidCloses last80: ${last80Bad.invalid.map((x) => `${x.date}=${x.close}`).join(',')}`
      );
    }
    const rets = returnsBySymbol.get(sym) ?? [];
    const canForm60 =
      lastIdx >= LONG_WINDOW &&
      windowCountsForSymbol(rets, lastIdx, SHORT_WINDOW, LONG_WINDOW).longCount >= LONG_WINDOW;
    console.log(`    canForm60LogReturnsAtLast=${canForm60 ? 'yes' : 'no'}`);
  }

  const incompleteSince2026 = incompleteQualifiedDates(
    dates,
    symbolsWithCloseByDate,
    recentUniverse,
    '2026-01-01'
  );
  const last61Set = new Set(last61);
  const incompleteInLast61 = incompleteSince2026.filter((r) => last61Set.has(r.date));
  console.log(
    `\nQualified-incomplete dates since 2026-01-01 (nCloses<${recentUniverse.length}): ${incompleteSince2026.length}`
  );
  const incompletePreview =
    incompleteSince2026.length > 40 ? incompleteSince2026.slice(-40) : incompleteSince2026;
  for (const r of incompletePreview) {
    const inWin = last61Set.has(r.date) ? ' IN_LAST_61' : '';
    console.log(`  ${r.date} nCloses=${r.nCloses} missing=${r.missingSymbols.join(',')}${inWin}`);
  }
  console.log(`Incomplete dates inside final 61 qualified: ${incompleteInLast61.length}`);

  console.log('\nEligibility (last 80 qualified shock dates; printing <8 valid, null shockRaw, latest 10):');
  for (const row of last80Rows) {
    if (!shouldLogEligibilityRow(row, last80Rows, MIN_ASSETS_TARGET)) continue;
    console.log(
      `  ${row.date} nCloses=${row.nCloses} shortElig=${row.shortEligibleCount} longElig=${row.longEligibleCount} valid=${row.validSymbolsCount} shockRawNull=${row.shockRawNull} excluded=${row.excluded.join(',') || 'none'}`
    );
  }

  if (lastDate != null && lastIdx >= LONG_WINDOW) {
    console.log(`\nPer-symbol windows at latest qualified ${lastDate} (idx=${lastIdx}):`);
    const closeRange = longWindowCloseDateRange(dates, lastIdx, LONG_WINDOW);
    console.log(
      `  longWindow return dates ${closeRange.returnDates[0]}..${closeRange.returnDates[closeRange.returnDates.length - 1]} (n=${closeRange.returnDates.length}); close dates n=${closeRange.closeDates.length} priorClose=${closeRange.priorCloseDate}`
    );
    for (const sym of recentUniverse) {
      const rets = returnsBySymbol.get(sym) ?? [];
      const closeMap = closeMapsBySymbol.get(sym) ?? new Map();
      const counts = windowCountsForSymbol(rets, lastIdx, SHORT_WINDOW, LONG_WINDOW);
      console.log(
        `  ${sym}: short=${counts.shortCount}/${SHORT_WINDOW} long=${counts.longCount}/${LONG_WINDOW} eligible=${counts.eligible ? 'yes' : 'no'}`
      );
      if (counts.longCount < LONG_WINDOW) {
        const slots = nullReturnSlotsInLongWindow(dates, rets, closeMap, lastIdx, LONG_WINDOW);
        console.log(`    nullReturnsInLongWindow=${slots.length}`);
        for (const s of slots) {
          console.log(
            `    null @ ${s.currentDate} prev=${s.previousDate} curClose=${s.currentClosePresent ? s.currentClose : 'MISSING'} prevClose=${s.previousClosePresent ? s.previousClose : 'MISSING'}`
          );
        }
      }
    }
  }
  console.log('=== end shock eligibility diagnostics ===\n');

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
  const lastRow = trimmedPoints[trimmedPoints.length - 1];
  if (lastRow) {
    console.log(
      `   Latest shock row: date=${lastRow.date} nAssets=${lastRow.nAssets} nPairs=${lastRow.nPairs} shockRaw=${lastRow.shockRaw ?? 'null'} shockZ=${lastRow.shockZ ?? 'null'}`
    );
  }
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
