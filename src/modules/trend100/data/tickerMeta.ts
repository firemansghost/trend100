/**
 * Ticker metadata index
 * 
 * Builds a global metadata index from all deck universes, allowing tickers
 * to inherit subtitle/name from any deck where they're defined.
 * 
 * This enables consistent metadata display across decks without requiring
 * manual annotation in every deck where a ticker appears.
 */

import type { TrendUniverseItem } from '../types';
import { DECKS } from './decks';

/**
 * Metadata for a ticker (subtitle and/or name)
 */
export type TickerMeta = {
  subtitle?: string;
  name?: string;
};

/**
 * Builds a global metadata index keyed by provider symbol
 * 
 * Merges metadata from all decks, preferring richer metadata:
 * - If existing entry is missing subtitle and incoming has it, take it
 * - If existing entry is missing name and incoming has it, take it
 * - Do not overwrite existing non-empty fields
 */
export function buildTickerMetaIndex(): Record<string, TickerMeta> {
  const index: Record<string, TickerMeta> = {};

  for (const deck of DECKS) {
    for (const item of deck.universe) {
      // Use providerTicker if available, otherwise use ticker
      const providerSymbol = item.providerTicker ?? item.ticker;
      
      // Get existing metadata for this symbol (if any)
      const existing = index[providerSymbol];
      
      // Build merged metadata - accumulate from all decks
      // If existing has a field, keep it; otherwise use item's field
      const merged: TickerMeta = {
        subtitle: existing?.subtitle ?? item.subtitle,
        name: existing?.name ?? item.name,
      };
      
      // Only add to index if we have at least one field
      // This allows us to accumulate metadata across decks
      if (merged.subtitle || merged.name) {
        index[providerSymbol] = merged;
      }
    }
  }

  return index;
}

/**
 * Enriches a universe item with metadata from the global index
 * 
 * Returns effective subtitle/name, preferring item's own metadata,
 * then falling back to the global index.
 */
export function enrichUniverseItemMeta(
  item: TrendUniverseItem,
  metaIndex: Record<string, TickerMeta>
): { subtitle?: string; name?: string } {
  const providerSymbol = item.providerTicker ?? item.ticker;
  const meta = metaIndex[providerSymbol];
  
  return {
    // Prefer item's own subtitle, fall back to index
    subtitle: item.subtitle ?? meta?.subtitle,
    // Prefer item's own name, fall back to index
    name: item.name ?? meta?.name,
  };
}
