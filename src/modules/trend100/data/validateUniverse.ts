/**
 * Validation for Trend100 universe
 * 
 * Ensures universe integrity: exactly 100 unique tickers.
 */

import type { TrendUniverse } from '../types';

/**
 * Validates the universe meets requirements:
 * - Exactly 100 items
 * - No duplicate tickers
 * 
 * @throws Error if validation fails
 */
export function validateUniverse(universe: TrendUniverse): void {
  if (universe.length !== 100) {
    throw new Error(
      `Universe must contain exactly 100 tickers, found ${universe.length}`
    );
  }

  const tickers = new Set<string>();
  const duplicates: string[] = [];

  for (const item of universe) {
    if (tickers.has(item.ticker)) {
      duplicates.push(item.ticker);
    }
    tickers.add(item.ticker);
  }

  if (duplicates.length > 0) {
    throw new Error(
      `Duplicate tickers found: ${duplicates.join(', ')}`
    );
  }
}
