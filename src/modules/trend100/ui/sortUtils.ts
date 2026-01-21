/**
 * Sort utility functions
 * 
 * Helper functions for sorting ticker snapshots.
 */

import type { TrendTickerSnapshot } from '../types';

export type SortKey = 'UNIVERSE' | 'STATUS' | 'CHANGE' | 'TICKER';

/**
 * Status order for sorting (GREEN > YELLOW > RED > UNKNOWN)
 */
const STATUS_ORDER: Record<TrendTickerSnapshot['status'], number> = {
  GREEN: 0,
  YELLOW: 1,
  RED: 2,
  UNKNOWN: 3,
};

/**
 * Compare two tickers alphabetically (handles punctuation like "BRK.B")
 */
function compareTickers(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

/**
 * Sorts tickers by STATUS (GREEN > YELLOW > RED > UNKNOWN, then ticker A→Z)
 */
function sortByStatus(
  a: TrendTickerSnapshot,
  b: TrendTickerSnapshot
): number {
  const statusDiff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  if (statusDiff !== 0) {
    return statusDiff;
  }
  return compareTickers(a.ticker, b.ticker);
}

/**
 * Sorts tickers by CHANGE (descending, undefined last, then ticker A→Z)
 */
function sortByChange(
  a: TrendTickerSnapshot,
  b: TrendTickerSnapshot
): number {
  const aChange = a.changePct ?? -Infinity;
  const bChange = b.changePct ?? -Infinity;

  // Undefined values sort last (treat as -Infinity)
  if (a.changePct === undefined && b.changePct === undefined) {
    return compareTickers(a.ticker, b.ticker);
  }
  if (a.changePct === undefined) {
    return 1; // a goes last
  }
  if (b.changePct === undefined) {
    return -1; // b goes last
  }

  // Sort descending (highest first)
  const changeDiff = bChange - aChange;
  if (changeDiff !== 0) {
    return changeDiff;
  }
  return compareTickers(a.ticker, b.ticker);
}

/**
 * Sorts tickers by TICKER (alphabetical A→Z)
 */
function sortByTicker(
  a: TrendTickerSnapshot,
  b: TrendTickerSnapshot
): number {
  return compareTickers(a.ticker, b.ticker);
}

/**
 * Sorts tickers based on the specified sort key.
 * 
 * Note: UNIVERSE sort preserves original order (no-op).
 * For other sorts, creates a new sorted array without mutating input.
 */
export function sortTickers(
  snapshots: TrendTickerSnapshot[],
  sortKey: SortKey
): TrendTickerSnapshot[] {
  // UNIVERSE preserves original order (no sorting needed)
  if (sortKey === 'UNIVERSE') {
    return [...snapshots]; // Return copy to maintain immutability
  }

  // Create a copy before sorting to avoid mutation
  const sorted = [...snapshots];

  switch (sortKey) {
    case 'STATUS':
      sorted.sort(sortByStatus);
      break;
    case 'CHANGE':
      sorted.sort(sortByChange);
      break;
    case 'TICKER':
      sorted.sort(sortByTicker);
      break;
    default:
      // Fallback to universe order
      return [...snapshots];
  }

  return sorted;
}
