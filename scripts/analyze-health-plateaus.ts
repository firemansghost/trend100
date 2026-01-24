/**
 * Analyze health history plateaus
 * 
 * Detects consecutive identical health points and optionally explains them by
 * recomputing ticker statuses for start/end dates.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type {
  TrendHealthHistoryPoint,
  TrendDeckId,
  TrendUniverseItem,
  TrendTickerSnapshot,
} from '../src/modules/trend100/types';
import { getDeck, isDeckId, getAllDeckIds } from '../src/modules/trend100/data/decks';
import { buildTickerMetaIndex, enrichUniverseItemMeta } from '../src/modules/trend100/data/tickerMeta';
import { calcSMA, calcEMA, resampleDailyToWeekly } from '../src/modules/trend100/engine/movingAverages';
import { classifyTrend } from '../src/modules/trend100/engine/classifyTrend';
import { computeHealthScore } from '../src/modules/trend100/engine/healthScore';
import type { EodBar } from '../src/modules/trend100/data/providers/marketstack';

const PUBLIC_DIR = join(process.cwd(), 'public');
const EOD_CACHE_DIR = join(process.cwd(), 'data', 'marketstack', 'eod');

/**
 * Load health history file
 */
function loadHealthHistory(deckId: TrendDeckId): TrendHealthHistoryPoint[] | null {
  const filePath = join(PUBLIC_DIR, `health-history.${deckId}.json`);
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const history = JSON.parse(content) as TrendHealthHistoryPoint[];
    if (!Array.isArray(history)) {
      return null;
    }
    return history.sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    console.error(`Failed to load health history for ${deckId}:`, error);
    return null;
  }
}

/**
 * Load EOD cache file for a symbol (offline, no API calls)
 */
function loadEodCache(symbol: string): EodBar[] | null {
  const fileName = `${symbol.replace(/\./g, '_')}.json`;
  const filePath = join(EOD_CACHE_DIR, fileName);

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
 * Compute ticker snapshot for a specific date from EOD bars
 * (Reused from update-health-history.ts)
 */
function computeTickerSnapshotForDate(
  item: TrendUniverseItem,
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
): { health: { greenPct: number; yellowPct: number; redPct: number; regimeLabel: string }; tickers: TrendTickerSnapshot[] } | null {
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

  const statuses = tickers.map((t) => t.status);
  const health = computeHealthScore({ statuses });

  return { health, tickers };
}

/**
 * Check if EOD bar exists for a symbol on a specific date
 */
function hasEodBar(symbol: string, date: string): boolean {
  const bars = loadEodCache(symbol);
  if (!bars) {
    return false;
  }
  return bars.some((bar) => bar.date === date);
}

/**
 * Detect plateaus in health history
 */
function detectPlateaus(
  history: TrendHealthHistoryPoint[],
  minRun: number
): Array<{ startDate: string; endDate: string; length: number; value: TrendHealthHistoryPoint }> {
  const plateaus: Array<{ startDate: string; endDate: string; length: number; value: TrendHealthHistoryPoint }> = [];

  if (history.length === 0) {
    return plateaus;
  }

  let currentStart = 0;
  let currentValue = history[0]!;

  for (let i = 1; i < history.length; i++) {
    const point = history[i]!;
    
    // Skip UNKNOWN points when detecting plateaus
    if (point.regimeLabel === 'UNKNOWN' || point.greenPct === null) {
      // If we were in a plateau, end it
      const length = i - currentStart;
      if (length >= minRun) {
        plateaus.push({
          startDate: history[currentStart]!.date,
          endDate: history[i - 1]!.date,
          length,
          value: currentValue,
        });
      }
      currentStart = i;
      currentValue = point;
      continue;
    }
    
    // Also skip if current value is UNKNOWN
    if (currentValue.regimeLabel === 'UNKNOWN' || currentValue.greenPct === null) {
      currentStart = i;
      currentValue = point;
      continue;
    }
    
    const isIdentical =
      point.greenPct === currentValue.greenPct &&
      (point.yellowPct || 0) === (currentValue.yellowPct || 0) &&
      (point.redPct || 0) === (currentValue.redPct || 0) &&
      (point.regimeLabel || '') === (currentValue.regimeLabel || '');

    if (!isIdentical) {
      // Plateau ended
      const length = i - currentStart;
      if (length >= minRun) {
        plateaus.push({
          startDate: history[currentStart]!.date,
          endDate: history[i - 1]!.date,
          length,
          value: currentValue,
        });
      }
      currentStart = i;
      currentValue = point;
    }
  }

  // Check final plateau
  const length = history.length - currentStart;
  if (length >= minRun) {
    plateaus.push({
      startDate: history[currentStart]!.date,
      endDate: history[history.length - 1]!.date,
      length,
      value: currentValue,
    });
  }

  return plateaus;
}

/**
 * Explain a plateau by recomputing statuses for start/end dates
 */
function explainPlateau(
  deckId: TrendDeckId,
  startDate: string,
  endDate: string,
  metaIndex: Record<string, { subtitle?: string; name?: string }>
): {
  totalTickers: number;
  changedCount: number;
  changes: Array<{ ticker: string; startStatus: string; endStatus: string }>;
  missingBars: Array<{ ticker: string; date: string }>;
} {
  const deck = getDeck(deckId);
  const startResult = computeHealthForDate(deckId, startDate, metaIndex);
  const endResult = computeHealthForDate(deckId, endDate, metaIndex);

  if (!startResult || !endResult) {
    return {
      totalTickers: deck.universe.length,
      changedCount: 0,
      changes: [],
      missingBars: [],
    };
  }

  const startMap = new Map<string, string>();
  const endMap = new Map<string, string>();

  for (const ticker of startResult.tickers) {
    startMap.set(ticker.ticker, ticker.status);
  }
  for (const ticker of endResult.tickers) {
    endMap.set(ticker.ticker, ticker.status);
  }

  const changes: Array<{ ticker: string; startStatus: string; endStatus: string }> = [];
  const allTickers = new Set([...startMap.keys(), ...endMap.keys()]);

  for (const ticker of allTickers) {
    const startStatus = startMap.get(ticker) || 'MISSING';
    const endStatus = endMap.get(ticker) || 'MISSING';
    if (startStatus !== endStatus) {
      changes.push({ ticker, startStatus, endStatus });
    }
  }

  // Check EOD cache integrity
  const missingBars: Array<{ ticker: string; date: string }> = [];
  for (const item of deck.universe) {
    const providerSymbol = item.providerTicker ?? item.ticker;
    if (!hasEodBar(providerSymbol, startDate)) {
      missingBars.push({ ticker: item.ticker, date: startDate });
    }
    if (!hasEodBar(providerSymbol, endDate)) {
      missingBars.push({ ticker: item.ticker, date: endDate });
    }
  }

  return {
    totalTickers: deck.universe.length,
    changedCount: changes.length,
    changes,
    missingBars,
  };
}

/**
 * Parse CLI arguments
 */
function parseArgs(): {
  deckId: TrendDeckId;
  startDate?: string;
  endDate?: string;
  minRun: number;
  explain: boolean;
} {
  const args = process.argv.slice(2);
  let deckId: TrendDeckId = 'US_SECTORS';
  let startDate: string | undefined;
  let endDate: string | undefined;
  let minRun = 10;
  let explain = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--deck' && i + 1 < args.length) {
      const id = args[i + 1]!;
      if (isDeckId(id)) {
        deckId = id;
      } else {
        console.error(`Invalid deck ID: ${id}`);
        process.exit(1);
      }
      i++;
    } else if (args[i] === '--start' && i + 1 < args.length) {
      startDate = args[i + 1];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        console.error(`Invalid start date format: ${startDate}. Use YYYY-MM-DD`);
        process.exit(1);
      }
      i++;
    } else if (args[i] === '--end' && i + 1 < args.length) {
      endDate = args[i + 1];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        console.error(`Invalid end date format: ${endDate}. Use YYYY-MM-DD`);
        process.exit(1);
      }
      i++;
    } else if (args[i] === '--min-run' && i + 1 < args.length) {
      minRun = parseInt(args[i + 1]!, 10);
      if (isNaN(minRun) || minRun < 1) {
        console.error(`Invalid min-run: ${args[i + 1]}. Must be a positive number`);
        process.exit(1);
      }
      i++;
    } else if (args[i] === '--explain') {
      explain = true;
    }
  }

  if (startDate && endDate && startDate > endDate) {
    console.error('Start date must be before end date');
    process.exit(1);
  }

  return { deckId, startDate, endDate, minRun, explain };
}

function main() {
  // Ensure offline mode
  if (process.env.MARKETSTACK_OFFLINE !== '1') {
    process.env.MARKETSTACK_OFFLINE = '1';
    console.log('ℹ️  MARKETSTACK_OFFLINE not set, defaulting to 1 (offline)\n');
  }

  const { deckId, startDate, endDate, minRun, explain } = parseArgs();

  console.log(`🔍 Analyzing health plateaus for ${deckId}\n`);
  console.log(`  Min run length: ${minRun} days`);
  if (startDate) {
    console.log(`  Start date: ${startDate}`);
  }
  if (endDate) {
    console.log(`  End date: ${endDate}`);
  }
  console.log(`  Explain mode: ${explain ? 'ON' : 'OFF'}\n`);

  // Load health history
  const history = loadHealthHistory(deckId);
  if (!history || history.length === 0) {
    console.error(`❌ No health history found for ${deckId}`);
    process.exit(1);
  }

  // Filter by date range if provided
  let filtered = history;
  if (startDate) {
    filtered = filtered.filter((p) => p.date >= startDate);
  }
  if (endDate) {
    filtered = filtered.filter((p) => p.date <= endDate);
  }

  if (filtered.length === 0) {
    console.error('❌ No data in specified date range');
    process.exit(1);
  }

  console.log(`  Total points in range: ${filtered.length}\n`);

  // Detect plateaus
  const plateaus = detectPlateaus(filtered, minRun);

  if (plateaus.length === 0) {
    console.log('✅ No plateaus found (all points are unique or runs are too short)\n');
    process.exit(0);
  }

  console.log(`📊 Found ${plateaus.length} plateau(s):\n`);

  const metaIndex = explain ? buildTickerMetaIndex() : {};

  for (let i = 0; i < plateaus.length; i++) {
    const plateau = plateaus[i]!;
    console.log(`Plateau ${i + 1}:`);
    console.log(`  Date range: ${plateau.startDate} to ${plateau.endDate} (${plateau.length} days)`);
    console.log(
      `  Health: Green=${plateau.value.greenPct}%, Yellow=${plateau.value.yellowPct || 0}%, Red=${plateau.value.redPct || 0}%, Regime=${plateau.value.regimeLabel || 'N/A'}`
    );

    if (explain) {
      // Skip explanation if plateau is UNKNOWN
      if (plateau.value.regimeLabel === 'UNKNOWN' || plateau.value.greenPct === null) {
        console.log(`\n  ⚠️  Plateau contains UNKNOWN points (insufficient history) - skipping explanation`);
      } else {
        console.log(`\n  Analyzing...`);
        const explanation = explainPlateau(deckId, plateau.startDate, plateau.endDate, metaIndex);

        console.log(`  Total tickers: ${explanation.totalTickers}`);
        console.log(`  Tickers with status changes: ${explanation.changedCount}`);

        if (explanation.missingBars.length > 0) {
          console.log(`\n  ⚠️  BUG SUSPICION: Missing EOD bars detected:`);
          for (const missing of explanation.missingBars.slice(0, 10)) {
            console.log(`    - ${missing.ticker} missing bar for ${missing.date}`);
          }
          if (explanation.missingBars.length > 10) {
            console.log(`    ... and ${explanation.missingBars.length - 10} more`);
          }
          console.log(`\n  ⚠️  Missing EOD bars may cause carry-forward/last-known behavior.`);
        } else if (explanation.changedCount === 0) {
          console.log(`\n  ✅ Likely legitimate: no status flips in this window (rules are slow-moving).`);
        } else {
          console.log(`\n  ℹ️  Offset churn: statuses changed but counts stayed constant (flatline is expected).`);
          if (explanation.changes.length > 0 && explanation.changes.length <= 20) {
            console.log(`\n  Status changes:`);
            for (const change of explanation.changes) {
              console.log(`    - ${change.ticker}: ${change.startStatus} → ${change.endStatus}`);
            }
          } else if (explanation.changes.length > 20) {
            console.log(`\n  Status changes (showing first 20):`);
            for (const change of explanation.changes.slice(0, 20)) {
              console.log(`    - ${change.ticker}: ${change.startStatus} → ${change.endStatus}`);
            }
            console.log(`    ... and ${explanation.changes.length - 20} more`);
          }
        }
      }
    }

    console.log('');
  }

  console.log('✅ Analysis complete\n');
}

main();
