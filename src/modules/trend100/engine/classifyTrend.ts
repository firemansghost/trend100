/**
 * Trend classification engine
 * 
 * Pure function that classifies trend status based on price and moving averages.
 * No React, no DOM, no network - pure logic.
 */

export interface TrendInputs {
  price: number;
  sma200?: number;
  sma50w?: number;
  ema50w?: number;
}

export type TrendStatus = 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';

/**
 * Classifies trend status based on trend rules:
 * - GREEN: price > 200d SMA AND price > upper band (max of 50w SMA/EMA)
 * - YELLOW: price > 200d SMA AND price <= upper band
 * - RED: price < 200d SMA
 * - UNKNOWN: if any required value is missing
 */
export function classifyTrend(inputs: TrendInputs): TrendStatus {
  const { price, sma200, sma50w, ema50w } = inputs;

  // If any required value is missing, return UNKNOWN
  if (sma200 === undefined || sma50w === undefined || ema50w === undefined) {
    return 'UNKNOWN';
  }

  // Calculate upper band: max of 50w SMA and 50w EMA
  const upper = Math.max(sma50w, ema50w);

  // Classification rules
  if (price < sma200) {
    return 'RED';
  }

  if (price > upper) {
    return 'GREEN';
  }

  // price > sma200 && price <= upper
  return 'YELLOW';
}
