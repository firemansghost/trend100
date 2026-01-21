/**
 * Validation for Trend100 universe
 * 
 * Ensures universe integrity: exactly 100 unique tickers.
 */

import type { TrendUniverse } from '../types';

/**
 * Validates the universe meets requirements:
 * - No duplicate tickers
 * - At least 1 item
 * 
 * Note: Length validation removed to support decks with varying sizes.
 * 
 * @throws Error if validation fails
 */
export function validateUniverse(universe: TrendUniverse): void {
  if (universe.length === 0) {
    throw new Error('Universe must contain at least 1 ticker');
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
