/**
 * Update health history script
 * 
 * Updates health history for ALL decks.
 * Reads per-deck JSON files, computes today's health from snapshot,
 * and upserts today's entry. Keeps files sorted by date.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { TrendHealthHistoryPoint, TrendDeckId } from '../src/modules/trend100/types';
import { getLatestSnapshot } from '../src/modules/trend100/data/getLatestSnapshot';
import { getAllDeckIds } from '../src/modules/trend100/data/decks';
import { mergeAndTrimTimeSeries } from './timeSeriesUtils';

function getHistoryFilePath(deckId: TrendDeckId): string {
  return join(process.cwd(), 'public', `health-history.${deckId}.json`);
}

function loadHistory(deckId: TrendDeckId): TrendHealthHistoryPoint[] {
  const filePath = getHistoryFilePath(deckId);
  try {
    const content = readFileSync(filePath, 'utf-8');
    const history = JSON.parse(content) as TrendHealthHistoryPoint[];
    if (!Array.isArray(history)) {
      return [];
    }
    return history;
  } catch (error) {
    // File doesn't exist or is invalid - start fresh
    return [];
  }
}

function saveHistory(deckId: TrendDeckId, history: TrendHealthHistoryPoint[]): void {
  // Sort by date ascending
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));

  // Write with pretty formatting (2 spaces)
  const filePath = getHistoryFilePath(deckId);
  writeFileSync(filePath, JSON.stringify(sorted, null, 2) + '\n', 'utf-8');
}

function updateDeckHistory(deckId: TrendDeckId): void {
  console.log(`\nUpdating health history for ${deckId}...`);

  // Get today's snapshot for this deck
  const snapshot = getLatestSnapshot(deckId);
  const today = snapshot.asOfDate; // Already in YYYY-MM-DD format

  // Load existing history
  const existingHistory = loadHistory(deckId);

  // Create today's entry
  const todayEntry: TrendHealthHistoryPoint = {
    date: today,
    greenPct: snapshot.health.greenPct,
    yellowPct: snapshot.health.yellowPct,
    redPct: snapshot.health.redPct,
    regimeLabel: snapshot.health.regimeLabel,
  };

  // Merge with existing (dedupe by date) and trim to retention window
  const retentionDays = 365; // Keep last 365 calendar days
  const mergedHistory = mergeAndTrimTimeSeries(
    existingHistory,
    [todayEntry],
    (point) => point.date,
    retentionDays
  );

  // Save merged and trimmed history
  saveHistory(deckId, mergedHistory);

  const wasNew = existingHistory.findIndex((p) => p.date === today) < 0;
  console.log(`  ${wasNew ? 'Added' : 'Updated'} entry for ${today}`);
  console.log(`  Total entries: ${mergedHistory.length} (retention: ${retentionDays} days)`);
}

function main() {
  console.log('Updating health history for all decks...');

  const deckIds = getAllDeckIds();

  for (const deckId of deckIds) {
    updateDeckHistory(deckId);
  }

  console.log('\n✅ Health history update complete for all decks');
}

main();
