/**
 * Update snapshots script
 * 
 * Fetches real EOD data from Marketstack (with caching) and generates TrendSnapshot JSON files
 * for all decks. Also updates health history files.
 * 
 * This script:
 * 1. Deduplicates tickers across all decks (by providerSymbol)
 * 2. Uses cached EOD data (backfills if missing, updates incrementally if stale)
 * 3. Computes snapshots for each deck using the cached data
 * 4. Writes public/snapshot.<DECK_ID>.json files
 * 5. Updates public/health-history.<DECK_ID>.json files
 * 
 * Caching strategy:
 * - First run: backfills 1 year of history per symbol (configurable via MARKETSTACK_HISTORY_DAYS)
 * - Subsequent runs: uses batched "latest" calls to update incrementally
 * - Cache files stored in data/marketstack/eod/<symbol>.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type {
  TrendSnapshot,
  TrendTickerSnapshot,
  TrendDeckId,
  TrendHealthHistoryPoint,
} from '../src/modules/trend100/types';
import { getAllDeckIds, getDeck } from '../src/modules/trend100/data/decks';
import { ensureHistoryBatch } from './marketstack-cache';
import { calcSMA, calcEMA, resampleDailyToWeekly } from '../src/modules/trend100/engine/movingAverages';
import { classifyTrend } from '../src/modules/trend100/engine/classifyTrend';
import { computeHealthScore } from '../src/modules/trend100/engine/healthScore';
import { mergeAndTrimTimeSeries } from './timeSeriesUtils';
import { buildTickerMetaIndex, enrichUniverseItemMeta } from '../src/modules/trend100/data/tickerMeta';
import { getMinKnownPctForDeck } from '../src/modules/trend100/data/deckConfig';
import type { EodBar } from '../src/modules/trend100/data/providers/marketstack';

/**
 * Health-history retention policy (calendar days).
 *
 * - If unset: default to 0 (no trimming; retain all points)
 * - If set to 0: no trimming
 * - If set to N>0: keep last N calendar days
 */
function getHealthHistoryRetentionDays(): number {
  const raw = process.env.HEALTH_HISTORY_RETENTION_DAYS;
  if (raw === undefined || raw === null || raw.trim() === '') {
    return 0;
  }
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    console.warn(
      `⚠️  Invalid HEALTH_HISTORY_RETENTION_DAYS="${raw}". Defaulting to 0 (no trim).`
    );
    return 0;
  }
  return Math.max(0, parsed);
}

/**
 * Get minimum known percentage threshold (default 0.9 = 90%)
 * This is the global default; per-deck overrides are applied via getMinKnownPctForDeck.
 */
function getMinKnownPct(): number {
  const raw = process.env.TREND100_MIN_KNOWN_PCT;
  if (!raw || raw.trim() === '') return 0.9;
  const parsed = parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return 0.9;
  return parsed;
}

/**
 * Load EOD cache file for a symbol (offline, no API calls)
 */
function loadEodCache(symbol: string): EodBar[] | null {
  const cacheDir = join(process.cwd(), 'data', 'marketstack', 'eod');
  const fileName = `${symbol.replace(/\./g, '_')}.json`;
  const filePath = join(cacheDir, fileName);

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const bars = JSON.parse(content) as EodBar[];
    if (!Array.isArray(bars)) {
      return null;
    }
    return bars.sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    return null;
  }
}

/**
 * Compute ticker snapshot for a specific date from EOD bars (reused from update-health-history.ts)
 */
function computeTickerSnapshotForDate(
  item: { ticker: string; tags: string[]; section?: string; subtitle?: string; name?: string },
  eodBars: EodBar[],
  targetDate: string
): TrendTickerSnapshot | null {
  const barsUpToDate = eodBars.filter((bar) => bar.date <= targetDate);

  if (barsUpToDate.length === 0) {
    return null;
  }

  const latestBar = barsUpToDate[barsUpToDate.length - 1]!;
  const latestClose = latestBar.close;
  const prevBar = barsUpToDate.length > 1 ? barsUpToDate[barsUpToDate.length - 2] : null;
  const changePct = prevBar
    ? ((latestClose - prevBar.close) / prevBar.close) * 100
    : undefined;

  const dailyCloses = barsUpToDate.map((bar) => bar.close);
  const sma200Daily = calcSMA(dailyCloses, 200);
  const sma200Latest = sma200Daily[sma200Daily.length - 1];

  const weeklyBars = resampleDailyToWeekly(barsUpToDate);
  if (weeklyBars.length < 50) {
    return {
      ticker: item.ticker,
      tags: item.tags,
      section: item.section,
      subtitle: item.subtitle,
      name: item.name,
      status: 'UNKNOWN',
      price: latestClose,
      changePct: changePct ? Math.round(changePct * 100) / 100 : undefined,
      sma200: sma200Latest ? Math.round(sma200Latest * 100) / 100 : undefined,
    };
  }

  const weeklyCloses = weeklyBars.map((bar) => bar.close);
  const sma50wWeekly = calcSMA(weeklyCloses, 50);
  const ema50wWeekly = calcEMA(weeklyCloses, 50);
  const sma50wLatest = sma50wWeekly[sma50wWeekly.length - 1];
  const ema50wLatest = ema50wWeekly[ema50wWeekly.length - 1];

  const status = classifyTrend({
    price: latestClose,
    sma200: sma200Latest,
    sma50w: sma50wLatest,
    ema50w: ema50wLatest,
  });

  const distanceTo200dPct =
    sma200Latest !== undefined
      ? Math.round(((latestClose - sma200Latest) / sma200Latest) * 10000) / 100
      : undefined;

  const upperBand =
    sma50wLatest !== undefined && ema50wLatest !== undefined
      ? Math.max(sma50wLatest, ema50wLatest)
      : undefined;
  const distanceToUpperBandPct =
    upperBand !== undefined
      ? Math.round(((latestClose - upperBand) / upperBand) * 10000) / 100
      : undefined;

  return {
    ticker: item.ticker,
    tags: item.tags,
    section: item.section,
    subtitle: item.subtitle,
    name: item.name,
    status,
    price: Math.round(latestClose * 100) / 100,
    changePct: changePct ? Math.round(changePct * 100) / 100 : undefined,
    sma200: sma200Latest ? Math.round(sma200Latest * 100) / 100 : undefined,
    sma50w: sma50wLatest ? Math.round(sma50wLatest * 100) / 100 : undefined,
    ema50w: ema50wLatest ? Math.round(ema50wLatest * 100) / 100 : undefined,
    distanceTo200dPct,
    distanceToUpperBandPct,
  };
}

/**
 * Compute health for a specific date (offline, from EOD cache)
 */
function computeHealthForDate(
  deckId: TrendDeckId,
  targetDate: string,
  metaIndex: Record<string, { subtitle?: string; name?: string }>
): { point: TrendHealthHistoryPoint; tickers: TrendTickerSnapshot[] } | null {
  const deck = getDeck(deckId);
  const tickers: TrendTickerSnapshot[] = [];

  for (const item of deck.universe) {
    const providerSymbol = item.providerTicker ?? item.ticker;
    const eodBars = loadEodCache(providerSymbol);

    if (!eodBars || eodBars.length === 0) {
      continue;
    }

    const enrichedMeta = enrichUniverseItemMeta(item, metaIndex);
    const enrichedItem = {
      ...item,
      subtitle: enrichedMeta.subtitle,
      name: enrichedMeta.name,
    };

    const snapshot = computeTickerSnapshotForDate(enrichedItem, eodBars, targetDate);
    if (snapshot) {
      tickers.push(snapshot);
    }
  }

  if (tickers.length === 0) {
    return null;
  }

  const totalTickers = deck.universe.length;
  const statuses = tickers.map((t) => t.status);
  const knownStatuses = statuses.filter((s) => s !== 'UNKNOWN');
  const knownCount = knownStatuses.length;
  const unknownCount = totalTickers - knownCount;

  // Validity check: if knownCount / totalTickers < MIN_KNOWN_PCT, mark as UNKNOWN
  // Use per-deck override (MACRO uses lower threshold)
  const envDefault = getMinKnownPct();
  const minKnownPct = getMinKnownPctForDeck(deckId, envDefault);
  const knownPct = knownCount / totalTickers;

  if (knownPct < minKnownPct) {
    return {
      point: {
        date: targetDate,
        greenPct: null,
        yellowPct: null,
        redPct: null,
        regimeLabel: 'UNKNOWN',
        diffusionPct: null,
        knownCount,
        unknownCount,
        totalTickers,
      },
      tickers,
    };
  }

  const health = computeHealthScore({ statuses: knownStatuses });

  return {
    point: {
      date: targetDate,
      greenPct: health.greenPct,
      yellowPct: health.yellowPct,
      redPct: health.redPct,
      regimeLabel: health.regimeLabel,
      knownCount,
      unknownCount,
      totalTickers,
    },
    tickers,
  };
}

/**
 * Compute diffusion (status flip percentage) between two dates
 */
function computeDiffusion(
  deckId: TrendDeckId,
  date1: string,
  date2: string,
  metaIndex: Record<string, { subtitle?: string; name?: string }>
): { diffusionPct: number | null; diffusionCount: number; diffusionTotalCompared: number } {
  const result1 = computeHealthForDate(deckId, date1, metaIndex);
  const result2 = computeHealthForDate(deckId, date2, metaIndex);

  if (!result1 || !result2) {
    return { diffusionPct: null, diffusionCount: 0, diffusionTotalCompared: 0 };
  }

  if (result1.point.regimeLabel === 'UNKNOWN' || result2.point.regimeLabel === 'UNKNOWN') {
    return { diffusionPct: null, diffusionCount: 0, diffusionTotalCompared: 0 };
  }

  const statusMap1 = new Map<string, string>();
  const statusMap2 = new Map<string, string>();

  for (const ticker of result1.tickers) {
    if (ticker.status !== 'UNKNOWN') {
      statusMap1.set(ticker.ticker, ticker.status);
    }
  }
  for (const ticker of result2.tickers) {
    if (ticker.status !== 'UNKNOWN') {
      statusMap2.set(ticker.ticker, ticker.status);
    }
  }

  const comparedTickers = new Set<string>();
  for (const ticker of statusMap1.keys()) {
    if (statusMap2.has(ticker)) {
      comparedTickers.add(ticker);
    }
  }

  if (comparedTickers.size === 0) {
    return { diffusionPct: null, diffusionCount: 0, diffusionTotalCompared: 0 };
  }

  let flips = 0;
  for (const ticker of comparedTickers) {
    const status1 = statusMap1.get(ticker)!;
    const status2 = statusMap2.get(ticker)!;
    if (status1 !== status2) {
      flips++;
    }
  }

  const diffusionPct = Math.round((flips / comparedTickers.size) * 1000) / 10;

  return {
    diffusionPct,
    diffusionCount: flips,
    diffusionTotalCompared: comparedTickers.size,
  };
}

// Get today's date in YYYY-MM-DD format
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0]!;
}

// Get snapshot file path
function getSnapshotFilePath(deckId: TrendDeckId): string {
  return join(process.cwd(), 'public', `snapshot.${deckId}.json`);
}

// Get history file path
function getHistoryFilePath(deckId: TrendDeckId): string {
  return join(process.cwd(), 'public', `health-history.${deckId}.json`);
}

// Load existing history
function loadHistory(deckId: TrendDeckId): TrendHealthHistoryPoint[] {
  const filePath = getHistoryFilePath(deckId);
  try {
    const content = readFileSync(filePath, 'utf-8');
    const history = JSON.parse(content) as TrendHealthHistoryPoint[];
    if (!Array.isArray(history)) {
      return [];
    }
    return history;
  } catch (error) {
    return [];
  }
}

// Save history
function saveHistory(deckId: TrendDeckId, history: TrendHealthHistoryPoint[]): void {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const filePath = getHistoryFilePath(deckId);
  writeFileSync(filePath, JSON.stringify(sorted, null, 2) + '\n', 'utf-8');
}

// Compute ticker snapshot from EOD series
function computeTickerSnapshot(
  item: { ticker: string; tags: string[]; section?: string; subtitle?: string; name?: string },
  eodBars: Array<{ date: string; close: number }>
): TrendTickerSnapshot | null {
  if (eodBars.length === 0) {
    return null;
  }

  // Get latest bar
  const latestBar = eodBars[eodBars.length - 1]!;
  const latestClose = latestBar.close;
  const prevBar = eodBars.length > 1 ? eodBars[eodBars.length - 2] : null;
  const changePct = prevBar
    ? ((latestClose - prevBar.close) / prevBar.close) * 100
    : undefined;

  // Extract daily closes
  const dailyCloses = eodBars.map((bar) => bar.close);

  // Compute 200d SMA
  const sma200Daily = calcSMA(dailyCloses, 200);
  const sma200Latest = sma200Daily[sma200Daily.length - 1];

  // Resample to weekly (Friday close)
  const weeklyBars = resampleDailyToWeekly(eodBars);
  if (weeklyBars.length < 50) {
    // Not enough weekly data for 50w MAs
    return {
      ticker: item.ticker,
      tags: item.tags,
      section: item.section,
      subtitle: item.subtitle,
      name: item.name,
      status: 'UNKNOWN',
      price: latestClose,
      changePct: changePct ? Math.round(changePct * 100) / 100 : undefined,
      sma200: sma200Latest ? Math.round(sma200Latest * 100) / 100 : undefined,
    };
  }

  const weeklyCloses = weeklyBars.map((bar) => bar.close);

  // Compute 50w SMA and EMA on weekly closes
  const sma50wWeekly = calcSMA(weeklyCloses, 50);
  const ema50wWeekly = calcEMA(weeklyCloses, 50);

  // Get latest weekly MA values
  const sma50wLatest = sma50wWeekly[sma50wWeekly.length - 1];
  const ema50wLatest = ema50wWeekly[ema50wWeekly.length - 1];

  // Compute upper/lower band
  const upperBand =
    sma50wLatest !== undefined && ema50wLatest !== undefined
      ? Math.max(sma50wLatest, ema50wLatest)
      : undefined;
  const lowerBand =
    sma50wLatest !== undefined && ema50wLatest !== undefined
      ? Math.min(sma50wLatest, ema50wLatest)
      : undefined;

  // Classify trend
  const status = classifyTrend({
    price: latestClose,
    sma200: sma200Latest,
    sma50w: sma50wLatest,
    ema50w: ema50wLatest,
  });

  // Compute distances
  const distanceTo200dPct =
    sma200Latest !== undefined
      ? Math.round(((latestClose - sma200Latest) / sma200Latest) * 10000) / 100
      : undefined;

  const distanceToUpperBandPct =
    upperBand !== undefined
      ? Math.round(((latestClose - upperBand) / upperBand) * 10000) / 100
      : undefined;

  return {
    ticker: item.ticker,
    tags: item.tags,
    section: item.section,
    subtitle: item.subtitle,
    name: item.name,
    status,
    price: Math.round(latestClose * 100) / 100,
    changePct: changePct ? Math.round(changePct * 100) / 100 : undefined,
    sma200: sma200Latest ? Math.round(sma200Latest * 100) / 100 : undefined,
    sma50w: sma50wLatest ? Math.round(sma50wLatest * 100) / 100 : undefined,
    ema50w: ema50wLatest ? Math.round(ema50wLatest * 100) / 100 : undefined,
    distanceTo200dPct,
    distanceToUpperBandPct,
  };
}

async function main() {
  console.log('🚀 Starting snapshot update for all decks...\n');

  const today = getTodayDate();
  const deckIds = getAllDeckIds();
  const historyDays = parseInt(process.env.MARKETSTACK_HISTORY_DAYS || '365', 10);
  
  console.log(`📅 History window: ${historyDays} days\n`);

  // Step 1: Build deduplicated symbol map
  // Map: providerSymbol -> list of (deckId, ticker, tags, section, subtitle, name)
  const symbolMap = new Map<
    string,
    Array<{ deckId: TrendDeckId; ticker: string; tags: string[]; section?: string; subtitle?: string; name?: string }>
  >();

  for (const deckId of deckIds) {
    const deck = getDeck(deckId);
    for (const item of deck.universe) {
      // Use providerTicker if available, otherwise use ticker
      const providerSymbol = item.providerTicker ?? item.ticker;
      if (!symbolMap.has(providerSymbol)) {
        symbolMap.set(providerSymbol, []);
      }
      symbolMap.get(providerSymbol)!.push({
        deckId,
        ticker: item.ticker,
        tags: item.tags,
        section: item.section,
        subtitle: item.subtitle,
        name: item.name,
      });
    }
  }

  console.log(`📊 Found ${symbolMap.size} unique symbols across ${deckIds.length} decks\n`);

  // Step 2: Ensure history exists for all symbols (uses cache, backfills if needed, updates incrementally)
  console.log('📥 Ensuring EOD history (using cache, backfilling if needed)...\n');
  
  const allSymbols = Array.from(symbolMap.keys());
  const seriesCache = await ensureHistoryBatch(allSymbols);
  
  const backfilledCount = Array.from(seriesCache.values()).filter((bars) => {
    // Rough heuristic: if we have ~365 bars, likely backfilled
    return bars.length >= historyDays * 0.8;
  }).length;
  
  const updatedCount = allSymbols.length - backfilledCount;
  
  console.log(`\n✅ History ready: ${backfilledCount} backfilled, ${updatedCount} updated incrementally\n`);

  // Step 3: Generate snapshots for each deck
  const snapshots = new Map<TrendDeckId, TrendSnapshot>();

  for (const deckId of deckIds) {
    console.log(`\n📦 Generating snapshot for ${deckId}...`);
    const deck = getDeck(deckId);
    const tickers: TrendTickerSnapshot[] = [];
    
    // Track latest EOD bar date across all tickers that have data
    let latestBarDate: string | null = null;

    // Iterate deck.universe as source of truth for metadata (subtitle, name, section, tags)
    for (const item of deck.universe) {
      const providerSymbol = item.providerTicker ?? item.ticker;
      const eodBars = seriesCache.get(providerSymbol);

      // Always include deck metadata regardless of data availability
      const baseSnapshot: Partial<TrendTickerSnapshot> = {
        ticker: item.ticker,
        tags: item.tags,
        section: item.section,
        subtitle: item.subtitle,
        name: item.name,
      };

      if (!eodBars || eodBars.length === 0) {
        console.log(`  ⚠️  No data for ${item.ticker} (${providerSymbol}) - creating UNKNOWN snapshot`);
        // Create UNKNOWN snapshot with deck metadata
        tickers.push({
          ...baseSnapshot,
          status: 'UNKNOWN',
          price: 0,
          // All other fields undefined (safe for UI)
        } as TrendTickerSnapshot);
        continue;
      }

      // Track latest bar date
      const lastBar = eodBars[eodBars.length - 1];
      if (lastBar && (!latestBarDate || lastBar.date > latestBarDate)) {
        latestBarDate = lastBar.date;
      }

      const snapshot = computeTickerSnapshot(item, eodBars);
      if (snapshot) {
        // Ensure deck metadata is included (computeTickerSnapshot already includes it, but be explicit)
        tickers.push({
          ...baseSnapshot,
          ...snapshot,
        } as TrendTickerSnapshot);
      } else {
        console.log(`  ⚠️  Failed to compute snapshot for ${item.ticker}`);
        // Create UNKNOWN snapshot with deck metadata
        tickers.push({
          ...baseSnapshot,
          status: 'UNKNOWN',
          price: 0,
        } as TrendTickerSnapshot);
      }
    }

    // Compute health summary
    const statuses = tickers.map((t) => t.status);
    const health = computeHealthScore({ statuses });

    // Use latest bar date if available, otherwise fall back to today
    const asOfDate = latestBarDate || today;

    const snapshot: TrendSnapshot = {
      runDate: today,
      asOfDate,
      universeSize: tickers.length,
      tickers,
      health,
    };

    snapshots.set(deckId, snapshot);
    console.log(`  ✓ Generated snapshot: ${tickers.length} tickers, ${health.greenPct}% green, asOfDate: ${asOfDate}`);
  }

  // Step 4: Write snapshot files
  console.log('\n💾 Writing snapshot files...\n');
  for (const [deckId, snapshot] of snapshots.entries()) {
    const filePath = getSnapshotFilePath(deckId);
    writeFileSync(filePath, JSON.stringify(snapshot, null, 2) + '\n', 'utf-8');
    console.log(`  ✓ Wrote ${filePath}`);
  }

  // Step 5: Update health history files
  console.log('\n📈 Updating health history files...\n');
  const retentionDays = getHealthHistoryRetentionDays();
  const metaIndex = buildTickerMetaIndex();
  
  for (const deckId of deckIds) {
    const snapshot = snapshots.get(deckId);
    if (!snapshot) continue;

    // Load existing history
    const existingHistory = loadHistory(deckId);

    // Recompute today's health with validity check (to get knownCount/unknownCount)
    const todayResult = computeHealthForDate(deckId, snapshot.asOfDate, metaIndex);
    if (!todayResult) {
      console.log(`  ⚠️  Skipping health history entry for ${deckId}: no data available (date: ${snapshot.asOfDate})`);
      continue;
    }

    let entry = todayResult.point;

    // Compute diffusion: find previous trading day and compare
    let prevTradingDate: string | null = null;
    if (existingHistory.length > 0) {
      for (let i = existingHistory.length - 1; i >= 0; i--) {
        const prev = existingHistory[i]!;
        if (prev.date < snapshot.asOfDate) {
          prevTradingDate = prev.date;
          break;
        }
      }
    }

    if (prevTradingDate && entry.regimeLabel !== 'UNKNOWN') {
      const diffusion = computeDiffusion(deckId, prevTradingDate, snapshot.asOfDate, metaIndex);
      entry = {
        ...entry,
        diffusionPct: diffusion.diffusionPct,
        diffusionCount: diffusion.diffusionCount,
        diffusionTotalCompared: diffusion.diffusionTotalCompared,
      };
    } else {
      entry = {
        ...entry,
        diffusionPct: null,
      };
    }

    // Include UNKNOWN points (they won't be plotted but preserve timeline)
    // Merge with existing (dedupe by date) and trim to retention window
    const mergedHistory = mergeAndTrimTimeSeries(
      existingHistory,
      [entry],
      (point) => point.date,
      retentionDays
    );

    // Save merged and trimmed history
    saveHistory(deckId, mergedHistory);
    const statusLabel = entry.regimeLabel === 'UNKNOWN' ? 'UNKNOWN' : 'valid';
    console.log(
      `  ✓ Updated health history for ${deckId}: ${mergedHistory.length} points (${statusLabel}, retention: ${retentionDays === 0 ? 'none' : `${retentionDays} days`})`
    );
    if (entry.diffusionPct !== null) {
      console.log(`    Diffusion: ${entry.diffusionPct}% (${entry.diffusionCount}/${entry.diffusionTotalCompared} flips)`);
    }
  }

  console.log('\n✅ Snapshot update complete for all decks!');
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
