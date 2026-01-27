/**
 * Analyze known coverage for a deck on a specific date
 * 
 * Diagnoses which tickers are KNOWN, INELIGIBLE (insufficient lookback), or MISSING (no data)
 * for a given date. Useful for understanding why health history points are UNKNOWN.
 */

import './load-env';

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type {
  TrendDeckId,
  TrendUniverseItem,
  TrendTickerSnapshot,
} from '../src/modules/trend100/types';
import { getDeck, isDeckId } from '../src/modules/trend100/data/decks';
import { buildTickerMetaIndex, enrichUniverseItemMeta } from '../src/modules/trend100/data/tickerMeta';
import { calcSMA, calcEMA, resampleDailyToWeekly } from '../src/modules/trend100/engine/movingAverages';
import { classifyTrend } from '../src/modules/trend100/engine/classifyTrend';
import type { EodBar } from '../src/modules/trend100/data/providers/marketstack';

const EOD_CACHE_DIR = join(process.cwd(), 'data', 'marketstack', 'eod');

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
 */
function computeTickerSnapshotForDate(
  item: TrendUniverseItem,
  eodBars: EodBar[],
  targetDate: string
): { snapshot: TrendTickerSnapshot | null; reason: 'KNOWN' | 'INELIGIBLE' | 'MISSING' } {
  const barsUpToDate = eodBars.filter((bar) => bar.date <= targetDate);

  if (barsUpToDate.length === 0) {
    return { snapshot: null, reason: 'MISSING' };
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
    // Has bars but insufficient lookback for 50-week MA
    return {
      snapshot: {
        ticker: item.ticker,
        tags: item.tags,
        section: item.section,
        subtitle: item.subtitle,
        name: item.name,
        status: 'UNKNOWN',
        price: latestClose,
        changePct: changePct ? Math.round(changePct * 100) / 100 : undefined,
        sma200: sma200Latest ? Math.round(sma200Latest * 100) / 100 : undefined,
      },
      reason: 'INELIGIBLE',
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
    snapshot: {
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
    },
    reason: 'KNOWN',
  };
}

/**
 * Parse CLI arguments
 */
function parseArgs(): {
  deckId: TrendDeckId;
  date: string;
  limit?: number;
} {
  const args = process.argv.slice(2);
  let deckId: TrendDeckId = 'MACRO';
  let date: string | undefined;
  let limit: number | undefined;

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
    } else if (args[i] === '--date' && i + 1 < args.length) {
      date = args[i + 1];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        console.error(`Invalid date format: ${date}. Use YYYY-MM-DD`);
        process.exit(1);
      }
      i++;
    } else if (args[i] === '--limit' && i + 1 < args.length) {
      limit = parseInt(args[i + 1]!, 10);
      if (isNaN(limit) || limit < 1) {
        console.error(`Invalid limit: ${args[i + 1]}. Must be a positive number`);
        process.exit(1);
      }
      i++;
    }
  }

  if (!date) {
    console.error('--date YYYY-MM-DD is required');
    process.exit(1);
  }

  return { deckId, date, limit };
}

function main() {
  // Ensure offline mode
  if (process.env.MARKETSTACK_OFFLINE !== '1') {
    process.env.MARKETSTACK_OFFLINE = '1';
    console.log('ℹ️  MARKETSTACK_OFFLINE not set, defaulting to 1 (offline)\n');
  }

  const { deckId, date, limit } = parseArgs();

  console.log(`🔍 Analyzing known coverage for ${deckId} on ${date}\n`);

  const deck = getDeck(deckId);
  const metaIndex = buildTickerMetaIndex();

  const known: Array<{ ticker: string; status: string }> = [];
  const ineligible: Array<{ ticker: string; bars: number; weeklyBars: number }> = [];
  const missing: string[] = [];

  for (const item of deck.universe) {
    const providerSymbol = item.providerTicker ?? item.ticker;
    const eodBars = loadEodCache(providerSymbol);

    if (!eodBars || eodBars.length === 0) {
      missing.push(item.ticker);
      continue;
    }

    const enrichedMeta = enrichUniverseItemMeta(item, metaIndex);
    const enrichedItem = {
      ...item,
      subtitle: enrichedMeta.subtitle,
      name: enrichedMeta.name,
    };

    const result = computeTickerSnapshotForDate(enrichedItem, eodBars, date);
    if (result.reason === 'MISSING') {
      missing.push(item.ticker);
    } else if (result.reason === 'INELIGIBLE') {
      const barsUpToDate = eodBars.filter((bar) => bar.date <= date);
      const weeklyBars = resampleDailyToWeekly(barsUpToDate);
      ineligible.push({
        ticker: item.ticker,
        bars: barsUpToDate.length,
        weeklyBars: weeklyBars.length,
      });
    } else if (result.snapshot && result.snapshot.status !== 'UNKNOWN') {
      known.push({
        ticker: item.ticker,
        status: result.snapshot.status,
      });
    }
  }

  const totalTickers = deck.universe.length;
  const knownCount = known.length;
  const ineligibleCount = ineligible.length;
  const missingCount = missing.length;
  const eligibleCount = knownCount + ineligibleCount; // Eligible = has bars (known or ineligible)

  console.log(`Summary:`);
  console.log(`  Total tickers: ${totalTickers}`);
  console.log(`  Eligible (has bars): ${eligibleCount} (${((eligibleCount / totalTickers) * 100).toFixed(1)}%)`);
  console.log(`    Known (computable): ${knownCount} (${((knownCount / totalTickers) * 100).toFixed(1)}%)`);
  console.log(`    Ineligible (insufficient lookback): ${ineligibleCount} (${((ineligibleCount / totalTickers) * 100).toFixed(1)}%)`);
  console.log(`  Missing (no bars): ${missingCount} (${((missingCount / totalTickers) * 100).toFixed(1)}%)`);
  console.log('');

  if (known.length > 0) {
    console.log(`Known tickers (${known.length}${limit ? `, showing first ${limit}` : ''}):`);
    const toShow = limit ? known.slice(0, limit) : known;
    for (const item of toShow) {
      console.log(`  ${item.ticker}: ${item.status}`);
    }
    if (limit && known.length > limit) {
      console.log(`  ... and ${known.length - limit} more`);
    }
    console.log('');
  }

  if (ineligible.length > 0) {
    console.log(`Ineligible tickers (${ineligible.length}${limit ? `, showing first ${limit}` : ''}):`);
    const toShow = limit ? ineligible.slice(0, limit) : ineligible;
    for (const item of toShow) {
      console.log(`  ${item.ticker}: ${item.bars} daily bars, ${item.weeklyBars} weekly bars (needs 50)`);
    }
    if (limit && ineligible.length > limit) {
      console.log(`  ... and ${ineligible.length - limit} more`);
    }
    console.log('');
  }

  if (missing.length > 0) {
    console.log(`Missing tickers (${missing.length}${limit ? `, showing first ${limit}` : ''}):`);
    const toShow = limit ? missing.slice(0, limit) : missing;
    for (const ticker of toShow) {
      console.log(`  ${ticker}`);
    }
    if (limit && missing.length > limit) {
      console.log(`  ... and ${missing.length - limit} more`);
    }
    console.log('');
  }

  console.log('✅ Analysis complete\n');
}

main();
