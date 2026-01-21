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
  item: { ticker: string; tags: string[]; section?: string },
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
  // Map: providerSymbol -> list of (deckId, ticker, tags, section)
  const symbolMap = new Map<
    string,
    Array<{ deckId: TrendDeckId; ticker: string; tags: string[]; section?: string }>
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

    for (const item of deck.universe) {
      const providerSymbol = item.providerTicker ?? item.ticker;
      const eodBars = seriesCache.get(providerSymbol);

      if (!eodBars || eodBars.length === 0) {
        console.log(`  ⚠️  No data for ${item.ticker} (${providerSymbol}) - creating UNKNOWN snapshot`);
        // Create UNKNOWN snapshot with safe defaults
        tickers.push({
          ticker: item.ticker,
          tags: item.tags,
          section: item.section,
          status: 'UNKNOWN',
          price: 0,
          // All other fields undefined (safe for UI)
        });
        continue;
      }

      const snapshot = computeTickerSnapshot(item, eodBars);
      if (snapshot) {
        tickers.push(snapshot);
      } else {
        console.log(`  ⚠️  Failed to compute snapshot for ${item.ticker}`);
        tickers.push({
          ticker: item.ticker,
          tags: item.tags,
          section: item.section,
          status: 'UNKNOWN',
          price: 0,
        });
      }
    }

    // Compute health summary
    const statuses = tickers.map((t) => t.status);
    const health = computeHealthScore({ statuses });

    const snapshot: TrendSnapshot = {
      asOfDate: today,
      universeSize: tickers.length,
      tickers,
      health,
    };

    snapshots.set(deckId, snapshot);
    console.log(`  ✓ Generated snapshot: ${tickers.length} tickers, ${health.greenPct}% green`);
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
  for (const deckId of deckIds) {
    const snapshot = snapshots.get(deckId);
    if (!snapshot) continue;

    const history = loadHistory(deckId);
    const existingIndex = history.findIndex((point) => point.date === today);

    const todayEntry: TrendHealthHistoryPoint = {
      date: today,
      greenPct: snapshot.health.greenPct,
      yellowPct: snapshot.health.yellowPct,
      redPct: snapshot.health.redPct,
      regimeLabel: snapshot.health.regimeLabel,
    };

    if (existingIndex >= 0) {
      history[existingIndex] = todayEntry;
    } else {
      history.push(todayEntry);
    }

    saveHistory(deckId, history);
    console.log(`  ✓ Updated health history for ${deckId}`);
  }

  console.log('\n✅ Snapshot update complete for all decks!');
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
