/**
 * Deck-specific configuration
 * 
 * Provides per-deck overrides for various settings.
 */

import type { TrendDeckId } from '../types';

/**
 * Get minimum known percentage threshold for a deck.
 * 
 * - Default: uses TREND100_MIN_KNOWN_PCT (default 0.9)
 * - MACRO: uses TREND100_MACRO_MIN_KNOWN_PCT (default 0.7) due to inception-limited components
 * 
 * @param deckId Deck ID
 * @param envDefault Default value from environment (TREND100_MIN_KNOWN_PCT, fallback 0.9)
 * @returns Minimum known percentage (clamped to [0, 1])
 */
export function getMinKnownPctForDeck(deckId: TrendDeckId, envDefault: number): number {
  // MACRO uses a lower threshold due to inception-limited components (FBTC/FETH)
  if (deckId === 'MACRO') {
    const raw = process.env.TREND100_MACRO_MIN_KNOWN_PCT;
    if (raw && raw.trim() !== '') {
      const parsed = parseFloat(raw);
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
        return parsed;
      }
    }
    // Default override for MACRO: 0.7
    return 0.7;
  }

  // All other decks use the global default
  return envDefault;
}

/**
 * Get minimum eligible count threshold for a deck.
 * 
 * - MACRO: uses TREND100_MACRO_MIN_ELIGIBLE (default 10)
 * - All others: no minimum (use totalTickers as denominator)
 * 
 * @param deckId Deck ID
 * @returns Minimum eligible count (clamped to [1, totalTickers])
 */
export function getMinEligibleCountForDeck(deckId: TrendDeckId): number {
  if (deckId === 'MACRO') {
    const raw = process.env.TREND100_MACRO_MIN_ELIGIBLE;
    if (raw && raw.trim() !== '') {
      const parsed = parseInt(raw, 10);
      if (Number.isFinite(parsed) && parsed >= 1) {
        return parsed;
      }
    }
    // Default for MACRO: 10
    return 10;
  }
  // Other decks don't use eligible denominator mode
  return 0;
}

/**
 * Get known denominator mode for a deck.
 * 
 * - MACRO: uses 'eligible' (computes against tickers with bars, not static deck size)
 * - All others: uses 'total' (computes against total deck size)
 * 
 * @param deckId Deck ID
 * @returns 'eligible' or 'total'
 */
export function getKnownDenominatorMode(deckId: TrendDeckId): 'total' | 'eligible' {
  if (deckId === 'MACRO') {
    return 'eligible';
  }
  return 'total';
}
