/**
 * Get health history API
 * 
 * Returns health history data for chart visualization.
 * Tries to load from per-deck JSON file, falls back to mock data.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import type { TrendHealthHistoryPoint, TrendDeckId } from '../types';
import { buildMockHealthHistory } from './mockHealthHistory';

/**
 * Returns health history data for the specified deck.
 * 
 * Tries to load from public/health-history.<deckId>.json if available.
 * Falls back to mock data if file is missing or invalid.
 * 
 * @param deckId Deck ID (defaults to "LEADERSHIP")
 * @returns Array of health history points
 */
export function getHealthHistory(
  deckId: TrendDeckId = 'LEADERSHIP'
): TrendHealthHistoryPoint[] {
  try {
    // Try to read from per-deck history file
    const fileName = `health-history.${deckId}.json`;
    const filePath = join(process.cwd(), 'public', fileName);
    const fileContent = readFileSync(filePath, 'utf-8');
    const history = JSON.parse(fileContent) as TrendHealthHistoryPoint[];

    // Validate it's an array
    if (!Array.isArray(history)) {
      console.warn(
        `${fileName} is not an array, using mock data for deck ${deckId}`
      );
      return buildMockHealthHistory({ deckId });
    }

    // Validate entries have required fields
    const isValid = history.every(
      (point) =>
        typeof point.date === 'string' &&
        typeof point.greenPct === 'number' &&
        point.greenPct >= 0 &&
        point.greenPct <= 100
    );

    if (!isValid) {
      console.warn(
        `${fileName} has invalid entries, using mock data for deck ${deckId}`
      );
      return buildMockHealthHistory({ deckId });
    }

    // Sort by date ascending
    const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));

    return sorted;
  } catch (error) {
    // File doesn't exist or can't be read - use mock data
    console.warn(
      `Could not load health-history.${deckId}.json, using mock data:`,
      error
    );
    return buildMockHealthHistory({ deckId });
  }
}
