/**
 * Get latest snapshot API
 * 
 * Main data layer entry point for UI components.
 * Returns the latest snapshot for the specified deck's universe.
 */

import type { TrendSnapshot, TrendDeckId } from '../types';
import { getDeck } from './decks';
import { generateMockTickerSnapshot } from './mockSnapshot';
import { computeHealthScore } from '../engine/healthScore';

/**
 * Returns the latest snapshot for the specified deck.
 * 
 * Currently uses mock data. In production, this will fetch from
 * a snapshot store (database, file, or API).
 * 
 * @param deckId Deck ID (defaults to "LEADERSHIP")
 * @returns Latest trend snapshot with all tickers and health summary
 */
export function getLatestSnapshot(
  deckId: TrendDeckId = 'LEADERSHIP'
): TrendSnapshot {
  // Generate today's date in ISO format (YYYY-MM-DD)
  const today = new Date();
  const asOfDate = today.toISOString().split('T')[0];

  // Get deck and its universe
  const deck = getDeck(deckId);

  // Generate ticker snapshots from deck's universe
  // Pass deckId and date for deterministic but daily-varying values
  const tickers = deck.universe.map((item) =>
    generateMockTickerSnapshot(item, deckId, asOfDate)
  );

  // Compute health summary from statuses
  const statuses = tickers.map((t) => t.status);
  const health = computeHealthScore({ statuses });

  return {
    runDate: asOfDate, // For mock snapshots, runDate and asOfDate are the same
    asOfDate,
    universeSize: deck.universe.length,
    tickers,
    health,
  };
}
