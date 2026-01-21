/**
 * Update health history script
 * 
 * Reads public/health-history.json, computes today's health from snapshot,
 * and upserts today's entry. Keeps file sorted by date.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { TrendHealthHistoryPoint } from '../src/modules/trend100/types';
import { getLatestSnapshot } from '../src/modules/trend100/data/getLatestSnapshot';

const HISTORY_FILE = join(process.cwd(), 'public', 'health-history.json');

function loadHistory(): TrendHealthHistoryPoint[] {
  try {
    const content = readFileSync(HISTORY_FILE, 'utf-8');
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

function saveHistory(history: TrendHealthHistoryPoint[]): void {
  // Sort by date ascending
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));

  // Write with pretty formatting (2 spaces)
  writeFileSync(HISTORY_FILE, JSON.stringify(sorted, null, 2) + '\n', 'utf-8');
}

function main() {
  console.log('Updating health history...');

  // Get today's snapshot
  const snapshot = getLatestSnapshot();
  const today = snapshot.asOfDate; // Already in YYYY-MM-DD format

  // Load existing history
  const history = loadHistory();

  // Find existing entry for today
  const existingIndex = history.findIndex((point) => point.date === today);

  // Create today's entry
  const todayEntry: TrendHealthHistoryPoint = {
    date: today,
    greenPct: snapshot.health.greenPct,
    yellowPct: snapshot.health.yellowPct,
    redPct: snapshot.health.redPct,
    regimeLabel: snapshot.health.regimeLabel,
  };

  // Upsert: replace if exists, append if not
  if (existingIndex >= 0) {
    history[existingIndex] = todayEntry;
    console.log(`Updated entry for ${today}`);
  } else {
    history.push(todayEntry);
    console.log(`Added entry for ${today}`);
  }

  // Save back to file
  saveHistory(history);

  console.log(`Health history updated. Total entries: ${history.length}`);
}

main();
