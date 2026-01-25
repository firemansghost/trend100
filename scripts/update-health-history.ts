/**
 * Update health history script
 * 
 * Updates health history for ALL decks.
 * Reads per-deck JSON files, computes today's health from snapshot,
 * and upserts today's entry. Keeps files sorted by date.
 * 
 * Backfill mode:
 * - Use --backfill-days <N> or --start YYYY-MM-DD --end YYYY-MM-DD
 * - Computes health history from local EOD cache (offline)
 * - Requires MARKETSTACK_OFFLINE=1 to prevent accidental API calls
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type {
  TrendHealthHistoryPoint,
  TrendDeckId,
  TrendUniverseItem,
  TrendTickerSnapshot,
} from '../src/modules/trend100/types';
import { getLatestSnapshot } from '../src/modules/trend100/data/getLatestSnapshot';
import { getAllDeckIds, getDeck } from '../src/modules/trend100/data/decks';
import { mergeAndTrimTimeSeries } from './timeSeriesUtils';
import { buildTickerMetaIndex, enrichUniverseItemMeta } from '../src/modules/trend100/data/tickerMeta';
import { getMinKnownPctForDeck, getKnownDenominatorMode, getMinEligibleCountForDeck } from '../src/modules/trend100/data/deckConfig';
import { calcSMA, calcEMA, resampleDailyToWeekly } from '../src/modules/trend100/engine/movingAverages';
import { classifyTrend } from '../src/modules/trend100/engine/classifyTrend';
import { computeHealthScore } from '../src/modules/trend100/engine/healthScore';
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

function getHistoryFilePath(deckId: TrendDeckId): string {
  return join(process.cwd(), 'public', `health-history.${deckId}.json`);
}

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
    // File doesn't exist or is invalid - start fresh
    return [];
  }
}

function saveHistory(deckId: TrendDeckId, history: TrendHealthHistoryPoint[]): void {
  // Sort by date ascending
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));

  // Write with pretty formatting (2 spaces)
  const filePath = getHistoryFilePath(deckId);
  writeFileSync(filePath, JSON.stringify(sorted, null, 2) + '\n', 'utf-8');
}

/**
 * Load EOD cache file for a symbol (offline, no API calls)
 */
function loadEodCache(symbol: string): EodBar[] | null {
  const cacheDir = join(process.cwd(), 'data', 'marketstack', 'eod');
  // Normalize symbol for filename (replace . with _)
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
    // Ensure sorted ascending by date
    return bars.sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    console.warn(`Failed to load EOD cache for ${symbol}:`, error);
    return null;
  }
}

/**
 * Compute ticker snapshot for a specific date from EOD bars
 * (Same logic as update-snapshots.ts but filters bars to <= target date)
 */
function computeTickerSnapshotForDate(
  item: TrendUniverseItem,
  eodBars: EodBar[],
  targetDate: string
): TrendTickerSnapshot | null {
  // Filter bars to only include bars up to and including target date
  const barsUpToDate = eodBars.filter((bar) => bar.date <= targetDate);
  
  if (barsUpToDate.length === 0) {
    return null;
  }

  // Get latest bar (should be on or before targetDate)
  const latestBar = barsUpToDate[barsUpToDate.length - 1]!;
  const latestClose = latestBar.close;
  const prevBar = barsUpToDate.length > 1 ? barsUpToDate[barsUpToDate.length - 2] : null;
  const changePct = prevBar
    ? ((latestClose - prevBar.close) / prevBar.close) * 100
    : undefined;

  // Extract daily closes
  const dailyCloses = barsUpToDate.map((bar) => bar.close);

  // Compute 200d SMA
  const sma200Daily = calcSMA(dailyCloses, 200);
  const sma200Latest = sma200Daily[sma200Daily.length - 1];

  // Resample to weekly (Friday close)
  const weeklyBars = resampleDailyToWeekly(barsUpToDate);
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
 * Compute health history point for a specific date (offline, from EOD cache)
 * Returns null if insufficient data, or a point (possibly UNKNOWN if validity check fails)
 */
function computeHealthForDate(
  deckId: TrendDeckId,
  targetDate: string,
  metaIndex: Record<string, { subtitle?: string; name?: string }>
): { point: TrendHealthHistoryPoint; tickers: TrendTickerSnapshot[] } | null {
  const deck = getDeck(deckId);
  const tickers: TrendTickerSnapshot[] = [];

  // Load EOD cache for all symbols in deck
  for (const item of deck.universe) {
    const providerSymbol = item.providerTicker ?? item.ticker;
    const eodBars = loadEodCache(providerSymbol);

    if (!eodBars || eodBars.length === 0) {
      // Missing data - skip this ticker for this date
      continue;
    }

    // Enrich item with metadata
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
    // No data available for this date
    return null;
  }

  const totalTickers = deck.universe.length;
  
  // Track eligible/ineligible/missing counts
  // Eligible = has bars (known or ineligible due to insufficient lookback)
  // Ineligible = has bars but status is UNKNOWN due to insufficient lookback
  // Missing = no bars <= targetDate
  const statuses = tickers.map((t) => t.status);
  const knownStatuses = statuses.filter((s) => s !== 'UNKNOWN');
  const knownCount = knownStatuses.length;
  
  // Count eligible (tickers with bars, even if ineligible)
  const eligibleCount = tickers.length;
  const ineligibleCount = statuses.filter((s) => s === 'UNKNOWN').length;
  const missingCount = totalTickers - eligibleCount;
  const unknownCount = ineligibleCount; // Eligible but UNKNOWN = ineligible
  
  // Determine denominator mode (MACRO uses eligible, others use total)
  const denominatorMode = getKnownDenominatorMode(deckId);
  const denominator = denominatorMode === 'eligible' ? eligibleCount : totalTickers;
  
  // Check minEligibleCount threshold (MACRO only)
  const minEligibleCount = getMinEligibleCountForDeck(deckId);
  if (denominatorMode === 'eligible') {
    if (eligibleCount === 0) {
      // No eligible tickers - return UNKNOWN
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
          eligibleCount: 0,
          ineligibleCount: 0,
          missingCount,
        },
        tickers,
      };
    }
    if (eligibleCount < minEligibleCount) {
      // Too few eligible tickers - return UNKNOWN
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
          eligibleCount,
          ineligibleCount,
          missingCount,
        },
        tickers,
      };
    }
  }

  // Validity check: if knownCount / denominator < MIN_KNOWN_PCT, mark as UNKNOWN
  // Use per-deck override (MACRO uses lower threshold)
  const envDefault = getMinKnownPct();
  const minKnownPct = getMinKnownPctForDeck(deckId, envDefault);
  const knownPct = denominator > 0 ? knownCount / denominator : 0;

  if (knownPct < minKnownPct) {
    // Insufficient data - return UNKNOWN point
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
        eligibleCount: denominatorMode === 'eligible' ? eligibleCount : undefined,
        ineligibleCount: denominatorMode === 'eligible' ? ineligibleCount : undefined,
        missingCount: denominatorMode === 'eligible' ? missingCount : undefined,
      },
      tickers,
    };
  }

  // Compute health summary from known statuses only
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
      eligibleCount: denominatorMode === 'eligible' ? eligibleCount : undefined,
      ineligibleCount: denominatorMode === 'eligible' ? ineligibleCount : undefined,
      missingCount: denominatorMode === 'eligible' ? missingCount : undefined,
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

  // If either date is UNKNOWN, diffusion is unavailable
  if (result1.point.regimeLabel === 'UNKNOWN' || result2.point.regimeLabel === 'UNKNOWN') {
    return { diffusionPct: null, diffusionCount: 0, diffusionTotalCompared: 0 };
  }

  // Build maps of ticker -> status for both dates
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

  // Find tickers that are known on both dates
  const comparedTickers = new Set<string>();
  for (const ticker of statusMap1.keys()) {
    if (statusMap2.has(ticker)) {
      comparedTickers.add(ticker);
    }
  }

  if (comparedTickers.size === 0) {
    return { diffusionPct: null, diffusionCount: 0, diffusionTotalCompared: 0 };
  }

  // Count flips
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

/**
 * Get trading days in date range (infer from EOD cache availability)
 */
function getTradingDaysInRange(startDate: string, endDate: string, deckId: TrendDeckId): string[] {
  const deck = getDeck(deckId);
  const dateSet = new Set<string>();

  // Collect all dates that have data for at least one ticker in the deck
  for (const item of deck.universe) {
    const providerSymbol = item.providerTicker ?? item.ticker;
    const eodBars = loadEodCache(providerSymbol);
    if (eodBars) {
      for (const bar of eodBars) {
        if (bar.date >= startDate && bar.date <= endDate) {
          dateSet.add(bar.date);
        }
      }
    }
  }

  // Sort and return
  return Array.from(dateSet).sort((a, b) => a.localeCompare(b));
}

/**
 * Backfill health history for a date range
 */
function backfillDeckHistory(
  deckId: TrendDeckId,
  startDate: string,
  endDate: string
): TrendHealthHistoryPoint[] {
  console.log(`\nBackfilling health history for ${deckId} (${startDate} to ${endDate})...`);

  // Check offline mode
  const isOffline = process.env.MARKETSTACK_OFFLINE === '1';
  if (!isOffline) {
    throw new Error(
      'Backfill mode requires MARKETSTACK_OFFLINE=1 to prevent accidental API calls. ' +
      'Set MARKETSTACK_OFFLINE=1 explicitly if you want to allow API calls.'
    );
  }

  // Build metadata index for enrichment
  const metaIndex = buildTickerMetaIndex();

  // Get trading days in range
  const tradingDays = getTradingDaysInRange(startDate, endDate, deckId);
  console.log(`  Found ${tradingDays.length} trading days with EOD data`);

  // Log per-deck MIN_KNOWN_PCT setting
  const envDefault = getMinKnownPct();
  const deckMinKnownPct = getMinKnownPctForDeck(deckId, envDefault);
  console.log(`  Deck MIN_KNOWN_PCT: ${deckMinKnownPct.toFixed(2)} (envDefault=${envDefault.toFixed(2)})`);

  if (tradingDays.length === 0) {
    console.warn(`  ⚠️  No trading days found in range - check EOD cache files`);
    return [];
  }

  // Compute health for each trading day with diffusion
  const newPoints: TrendHealthHistoryPoint[] = [];
  let computed = 0;
  let unknown = 0;
  let prevDate: string | null = null;
  let prevTickers: TrendTickerSnapshot[] | null = null;

  for (const date of tradingDays) {
    const result = computeHealthForDate(deckId, date, metaIndex);
    if (!result) {
      unknown++;
      continue;
    }

    let point = result.point;

    // Compute diffusion if we have previous day
    if (prevDate && prevTickers && point.regimeLabel !== 'UNKNOWN') {
      const diffusion = computeDiffusion(deckId, prevDate, date, metaIndex);
      point = {
        ...point,
        diffusionPct: diffusion.diffusionPct,
        diffusionCount: diffusion.diffusionCount,
        diffusionTotalCompared: diffusion.diffusionTotalCompared,
      };
    } else {
      point = {
        ...point,
        diffusionPct: null,
      };
    }

    // Include UNKNOWN points (they won't be plotted but preserve timeline)
    newPoints.push(point);
    if (point.regimeLabel === 'UNKNOWN') {
      unknown++;
    } else {
      computed++;
    }

    // Update previous for next iteration
    prevDate = date;
    prevTickers = result.tickers;
  }

  console.log(`  Computed ${computed} valid points, ${unknown} UNKNOWN (insufficient history)`);

  // Load existing history and merge
  const existingHistory = loadHistory(deckId);
  const retentionDays = getHealthHistoryRetentionDays();
  const mergedHistory = mergeAndTrimTimeSeries(
    existingHistory,
    newPoints,
    (point) => point.date,
    retentionDays
  );

  // Save
  saveHistory(deckId, mergedHistory);
  console.log(
    `  ✓ Backfilled: ${newPoints.length} new points, total: ${mergedHistory.length} (retention: ${retentionDays === 0 ? 'none' : `${retentionDays} days`})`
  );

  return mergedHistory;
}

function updateDeckHistory(deckId: TrendDeckId): void {
  console.log(`\nUpdating health history for ${deckId}...`);

  // Get today's snapshot for this deck
  const snapshot = getLatestSnapshot(deckId);
  const asOfDate = snapshot.asOfDate; // Already in YYYY-MM-DD format (effective trading day)

  // Load existing history
  const existingHistory = loadHistory(deckId);

  // Build metadata index for recomputing previous day
  const metaIndex = buildTickerMetaIndex();

  // Recompute today's health with validity check
  const todayResult = computeHealthForDate(deckId, asOfDate, metaIndex);
  if (!todayResult) {
    console.log(`  ⚠️  Skipping health history entry for ${deckId}: no data available (date: ${asOfDate})`);
    return;
  }

  let entry = todayResult.point;

  // Compute diffusion: find previous trading day and compare
  let prevTradingDate: string | null = null;
  if (existingHistory.length > 0) {
    // Find most recent valid point (or just latest if we want to compare even with UNKNOWN)
    for (let i = existingHistory.length - 1; i >= 0; i--) {
      const prev = existingHistory[i]!;
      if (prev.date < asOfDate) {
        prevTradingDate = prev.date;
        break;
      }
    }
  }

  if (prevTradingDate && entry.regimeLabel !== 'UNKNOWN') {
    const diffusion = computeDiffusion(deckId, prevTradingDate, asOfDate, metaIndex);
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
  const retentionDays = getHealthHistoryRetentionDays();
  const mergedHistory = mergeAndTrimTimeSeries(
    existingHistory,
    [entry],
    (point) => point.date,
    retentionDays
  );

  // Save merged and trimmed history
  saveHistory(deckId, mergedHistory);

  const wasNew = existingHistory.findIndex((p) => p.date === asOfDate) < 0;
  const statusLabel = entry.regimeLabel === 'UNKNOWN' ? 'UNKNOWN' : 'valid';
  console.log(`  ${wasNew ? 'Added' : 'Updated'} entry for ${asOfDate} (${statusLabel})`);
  if (entry.diffusionPct !== null) {
    console.log(`  Diffusion: ${entry.diffusionPct}% (${entry.diffusionCount}/${entry.diffusionTotalCompared} flips)`);
  }
  console.log(
    `  Total entries: ${mergedHistory.length} (retention: ${retentionDays === 0 ? 'none' : `${retentionDays} days`})`
  );
}

/**
 * Parse CLI arguments
 */
function parseArgs(): {
  mode: 'incremental' | 'backfill';
  backfillDays?: number;
  startDate?: string;
  endDate?: string;
} {
  const args = process.argv.slice(2);
  
  // Check for backfill mode
  const backfillDaysIndex = args.indexOf('--backfill-days');
  if (backfillDaysIndex >= 0 && backfillDaysIndex < args.length - 1) {
    const days = parseInt(args[backfillDaysIndex + 1]!, 10);
    if (isNaN(days) || days <= 0) {
      throw new Error('--backfill-days must be a positive number');
    }
    return { mode: 'backfill', backfillDays: days };
  }

  const startIndex = args.indexOf('--start');
  const endIndex = args.indexOf('--end');
  if (startIndex >= 0 && endIndex >= 0) {
    const startDate = args[startIndex + 1];
    const endDate = args[endIndex + 1];
    if (!startDate || !endDate) {
      throw new Error('--start and --end require date values (YYYY-MM-DD)');
    }
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      throw new Error('Dates must be in YYYY-MM-DD format');
    }
    if (startDate > endDate) {
      throw new Error('Start date must be before end date');
    }
    return { mode: 'backfill', startDate, endDate };
  }

  return { mode: 'incremental' };
}

function main() {
  const args = parseArgs();

  if (args.mode === 'backfill') {
    console.log('🔄 Backfill mode: Computing health history from EOD cache (offline)\n');

    // Determine date range
    let startDate: string;
    let endDate: string;

    if (args.backfillDays) {
      // Use backfill-days: end = today, start = end - N days
      const today = new Date().toISOString().split('T')[0]!;
      endDate = today;
      const start = new Date();
      start.setDate(start.getDate() - args.backfillDays);
      startDate = start.toISOString().split('T')[0]!;
    } else if (args.startDate && args.endDate) {
      startDate = args.startDate;
      endDate = args.endDate;
    } else {
      throw new Error('Backfill mode requires --backfill-days or --start/--end');
    }

    console.log(`Date range: ${startDate} to ${endDate}\n`);

    // Check offline mode (default to offline for backfill)
    if (process.env.MARKETSTACK_OFFLINE !== '1' && process.env.MARKETSTACK_OFFLINE !== '0') {
      // Default to offline for backfill
      process.env.MARKETSTACK_OFFLINE = '1';
      console.log('ℹ️  MARKETSTACK_OFFLINE not set, defaulting to 1 (offline) for backfill\n');
    }

    const deckIds = getAllDeckIds();

    for (const deckId of deckIds) {
      backfillDeckHistory(deckId, startDate, endDate);
    }

    console.log('\n✅ Health history backfill complete for all decks');
  } else {
    // Incremental mode (default)
    console.log('Updating health history for all decks...');

    const deckIds = getAllDeckIds();

    for (const deckId of deckIds) {
      updateDeckHistory(deckId);
    }

    console.log('\n✅ Health history update complete for all decks');
  }
}

main();
