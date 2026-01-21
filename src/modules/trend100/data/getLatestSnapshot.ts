/**
 * Get latest snapshot API
 * 
 * Main data layer entry point for UI components.
 * Returns the latest snapshot for the 100-ticker universe.
 */

import type { TrendSnapshot } from '../types';
import { DEFAULT_UNIVERSE } from './universe';
import { generateMockTickerSnapshot } from './mockSnapshot';
import { computeHealthScore } from '../engine/healthScore';

/**
 * Returns the latest snapshot for the DEFAULT_UNIVERSE.
 * 
 * Currently uses mock data. In production, this will fetch from
 * a snapshot store (database, file, or API).
 * 
 * @returns Latest trend snapshot with all 100 tickers and health summary
 */
export function getLatestSnapshot(): TrendSnapshot {
  // Generate today's date in ISO format (YYYY-MM-DD)
  const today = new Date();
  const asOfDate = today.toISOString().split('T')[0];

  // Generate ticker snapshots from universe
  const tickers = DEFAULT_UNIVERSE.map(generateMockTickerSnapshot);

  // Compute health summary from statuses
  const statuses = tickers.map((t) => t.status);
  const health = computeHealthScore({ statuses });

  return {
    asOfDate,
    universeSize: DEFAULT_UNIVERSE.length,
    tickers,
    health,
  };
}
