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
