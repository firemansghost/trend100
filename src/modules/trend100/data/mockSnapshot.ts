/**
 * Mock snapshot generator
 * 
 * Generates deterministic mock data for snapshot testing.
 * Uses stable hash of ticker string to ensure consistent values across reloads.
 */

import type { TrendTickerSnapshot } from '../types';
import type { TrendUniverseItem } from '../types';
import { classifyTrend } from '../engine/classifyTrend';

/**
 * Simple hash function for deterministic value generation
 * Returns a number between 0 and 1
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Normalize to 0-1 range
  return Math.abs(hash) / 2147483647;
}

/**
 * Generates deterministic mock values for a ticker
 * 
 * Seeds with ticker + deckId + date to allow daily variation while staying stable within a day
 */
function generateMockValues(
  ticker: string,
  deckId: string,
  date: string
) {
  // Combine ticker, deckId, and date for seeding
  const seed = `${ticker}_${deckId}_${date}`;
  const hash = hashString(seed);
  const hash2 = hashString(seed + '_alt');
  const hash3 = hashString(seed + '_alt2');

  // Base price range: 25-500
  const basePrice = 25 + hash * 475;

  // Change percentage: -4% to +4%
  const changePct = -4 + hash2 * 8;

  // Generate moving averages around price to create varied statuses
  // Use different hash seeds to create variation
  const sma200 = basePrice * (0.85 + hash3 * 0.3); // 85% to 115% of price
  const sma50w = basePrice * (0.9 + hash * 0.25); // 90% to 115% of price
  const ema50w = basePrice * (0.88 + hash2 * 0.27); // 88% to 115% of price

  return {
    price: Math.round(basePrice * 100) / 100,
    changePct: Math.round(changePct * 100) / 100,
    sma200: Math.round(sma200 * 100) / 100,
    sma50w: Math.round(sma50w * 100) / 100,
    ema50w: Math.round(ema50w * 100) / 100,
  };
}

/**
 * Generates a mock ticker snapshot from universe item
 */
export function generateMockTickerSnapshot(
  item: TrendUniverseItem,
  deckId: string,
  date: string
): TrendTickerSnapshot {
  const { ticker, tags, section } = item;
  const mock = generateMockValues(ticker, deckId, date);

  // Classify trend
  const status = classifyTrend({
    price: mock.price,
    sma200: mock.sma200,
    sma50w: mock.sma50w,
    ema50w: mock.ema50w,
  });

  // Calculate distance metrics
  const distanceTo200dPct =
    mock.sma200 !== undefined
      ? Math.round(((mock.price - mock.sma200) / mock.sma200) * 10000) / 100
      : undefined;

  const upper = Math.max(mock.sma50w, mock.ema50w);
  const distanceToUpperBandPct =
    upper !== undefined
      ? Math.round(((mock.price - upper) / upper) * 10000) / 100
      : undefined;

  return {
    ticker,
    tags,
    section: section ?? undefined,
    status,
    price: mock.price,
    changePct: mock.changePct,
    sma200: mock.sma200,
    sma50w: mock.sma50w,
    ema50w: mock.ema50w,
    distanceTo200dPct,
    distanceToUpperBandPct,
  };
}
