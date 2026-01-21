/**
 * Tag utility functions
 * 
 * Helper functions for tag filtering and management.
 */

import type { TrendTickerSnapshot } from '../types';

/**
 * Extracts all unique tags from ticker snapshots
 */
export function getAllTags(snapshots: TrendTickerSnapshot[]): string[] {
  const tagSet = new Set<string>();
  snapshots.forEach((snapshot) => {
    snapshot.tags.forEach((tag) => tagSet.add(tag));
  });
  return Array.from(tagSet).sort();
}

/**
 * Computes tag counts (number of tickers that include each tag)
 */
export function getTagCounts(snapshots: TrendTickerSnapshot[]): Record<string, number> {
  const counts: Record<string, number> = {};
  snapshots.forEach((snapshot) => {
    snapshot.tags.forEach((tag) => {
      counts[tag] = (counts[tag] || 0) + 1;
    });
  });
  return counts;
}

/**
 * Filters tickers by search query (case-insensitive ticker match)
 */
export function filterBySearch(
  snapshots: TrendTickerSnapshot[],
  searchQuery: string
): TrendTickerSnapshot[] {
  if (!searchQuery.trim()) {
    return snapshots;
  }
  const query = searchQuery.toLowerCase().trim();
  return snapshots.filter((snapshot) =>
    snapshot.ticker.toLowerCase().includes(query)
  );
}

/**
 * Filters tickers by selected tags.
 * 
 * Uses OR logic: ticker matches if it has ANY of the selected tags.
 * This makes filtering more inclusive - selecting "ai" and "semis" 
 * shows all tickers that have either tag.
 */
export function filterByTags(
  snapshots: TrendTickerSnapshot[],
  selectedTags: string[]
): TrendTickerSnapshot[] {
  if (selectedTags.length === 0) {
    return snapshots;
  }
  return snapshots.filter((snapshot) =>
    selectedTags.some((tag) => snapshot.tags.includes(tag))
  );
}

/**
 * Applies both search and tag filters
 */
export function applyFilters(
  snapshots: TrendTickerSnapshot[],
  searchQuery: string,
  selectedTags: string[]
): TrendTickerSnapshot[] {
  let filtered = filterBySearch(snapshots, searchQuery);
  filtered = filterByTags(filtered, selectedTags);
  return filtered;
}
