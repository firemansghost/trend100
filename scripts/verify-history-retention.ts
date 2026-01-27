/**
 * Verify history retention guardrail
 * 
 * Checks that history files haven't shrunk dramatically, indicating data loss.
 * This should be run in CI/workflow before committing to catch regressions.
 * 
 * Exit codes:
 * - 0: All checks passed
 * - 1: History loss detected or below minimum threshold
 */

import './load-env';

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import type { TrendHealthHistoryPoint, TrendDeckId } from '../src/modules/trend100/types';
import { getAllDeckIds } from '../src/modules/trend100/data/decks';

const HISTORY_DIR = join(process.cwd(), 'public');
const MIN_POINTS_THRESHOLD = 30; // Minimum points after running for a while
const MAX_SHRINKAGE_PCT = 20; // Fail if history shrinks by more than 20%
const MAX_ZERO_PCT = 30; // Fail if more than 30% of points have zero health (warm-up issue)
const DEFAULT_CACHE_DAYS = 2300; // Default cache days (matches workflow defaults)
const BUFFER_DAYS = 70; // Buffer for expected cache days check (cacheDays - buffer)
const WARMUP_CHECK_DAYS = 365; // Only evaluate warm-up zeros over the most recent window

/**
 * Load history file
 */
function loadHistoryFile(deckId: TrendDeckId): TrendHealthHistoryPoint[] | null {
  const filePath = join(HISTORY_DIR, `health-history.${deckId}.json`);
  if (!existsSync(filePath)) {
    return null;
  }
  
  try {
    const content = readFileSync(filePath, 'utf-8');
    const history = JSON.parse(content) as TrendHealthHistoryPoint[];
    if (!Array.isArray(history)) {
      return null;
    }
    return history;
  } catch (error) {
    console.error(`Failed to load ${filePath}:`, error);
    return null;
  }
}

/**
 * Get git history count from previous commit (if available)
 * 
 * Note: This is a best-effort check. If git isn't available or file didn't exist, returns null.
 * The minimum threshold check is more reliable and will catch most issues.
 */
function getPreviousCommitCount(deckId: TrendDeckId): number | null {
  // Try to get count from git show (previous commit)
  // This is a best-effort check - if git isn't available or file didn't exist, return null
  try {
    const filePath = `public/health-history.${deckId}.json`;
    // Try to get the file content from previous commit and parse it
    // Use shell command that works on both Unix and Windows
    const command = process.platform === 'win32' 
      ? `git show HEAD:${filePath} 2>nul`
      : `git show HEAD:${filePath} 2>/dev/null`;
    const result = execSync(command, { encoding: 'utf-8', stdio: 'pipe' }).trim();
    if (result && result !== '') {
      const history = JSON.parse(result) as TrendHealthHistoryPoint[];
      if (Array.isArray(history)) {
        return history.length;
      }
    }
  } catch (error) {
    // Git command failed or file didn't exist - that's okay, we'll just check minimum threshold
  }
  return null;
}

/**
 * Verify history retention for a deck
 */
function verifyDeckHistory(deckId: TrendDeckId): { ok: boolean; message: string } {
  const history = loadHistoryFile(deckId);
  
  if (!history) {
    // File doesn't exist - that's okay for new decks or first run
    return { ok: true, message: `No history file for ${deckId} (OK for new decks)` };
  }
  
  const currentCount = history.length;
  
  // Check minimum threshold
  if (currentCount < MIN_POINTS_THRESHOLD) {
    // Only fail if we've been running for a while (more than MIN_POINTS_THRESHOLD days)
    // For new deployments, it's okay to have fewer points
    const latestDate = history.length > 0 ? new Date(history[history.length - 1]!.date) : null;
    const today = new Date();
    const daysRunning = latestDate ? Math.ceil((today.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
    
    if (daysRunning > MIN_POINTS_THRESHOLD && currentCount < MIN_POINTS_THRESHOLD) {
      return {
        ok: false,
        message: `${deckId}: Only ${currentCount} points after ${daysRunning} days (minimum: ${MIN_POINTS_THRESHOLD})`,
      };
    }
  }
  
  // Check for dramatic shrinkage vs previous commit
  const previousCount = getPreviousCommitCount(deckId);
  if (previousCount !== null && previousCount > 0) {
    const shrinkagePct = ((previousCount - currentCount) / previousCount) * 100;
    if (shrinkagePct > MAX_SHRINKAGE_PCT) {
      return {
        ok: false,
        message: `${deckId}: History shrunk from ${previousCount} to ${currentCount} points (${shrinkagePct.toFixed(1)}% loss, max allowed: ${MAX_SHRINKAGE_PCT}%)`,
      };
    }
  }
  
  // Check for warm-up issues (points with zero health), but only in the recent window.
  // With long-run retention, early "warm-up" zeros are expected and should not fail forever.
  // Ignore UNKNOWN points when evaluating warm-up (they're expected early in history).
  const latestDateStr = history.length > 0 ? history[history.length - 1]!.date : null;
  const windowDays = Math.max(
    1,
    parseInt(process.env.TREND100_WARMUP_CHECK_DAYS || `${WARMUP_CHECK_DAYS}`, 10)
  );
  const windowStartStr = (() => {
    if (!latestDateStr) return null;
    const latestDate = new Date(latestDateStr);
    const start = new Date(latestDate);
    start.setDate(start.getDate() - windowDays);
    return start.toISOString().split('T')[0]!;
  })();

  const windowHistory = windowStartStr
    ? history.filter((p) => p.date >= windowStartStr)
    : history;

  // Filter to valid points only (exclude UNKNOWN)
  const validWindowHistory = windowHistory.filter(
    (p) => p.greenPct !== null && p.regimeLabel !== 'UNKNOWN'
  );

  const zeroPoints = validWindowHistory.filter((p) => {
    const totalPct = (p.greenPct || 0) + (p.yellowPct || 0) + (p.redPct || 0);
    return totalPct === 0;
  });
  const zeroPct =
    validWindowHistory.length > 0 ? (zeroPoints.length / validWindowHistory.length) * 100 : 0;
  
  // Check if cache should be extended (if we expect sufficient days but have many zero points)
  // Derive expected cache days from env (with buffer) instead of hard-coded constant
  const cacheDays = parseInt(process.env.MARKETSTACK_CACHE_DAYS || String(DEFAULT_CACHE_DAYS), 10);
  const expectedCacheDays = Math.max(cacheDays - BUFFER_DAYS, 0);
  const strictWarmup = process.env.TREND100_STRICT_WARMUP === '1';
  
  if (cacheDays >= expectedCacheDays && zeroPct > MAX_ZERO_PCT) {
    const message =
      `${deckId}: ${zeroPct.toFixed(1)}% zero points (${zeroPoints.length}/${validWindowHistory.length} valid) ` +
      `in last ${windowDays} days - warm-up issue detected. Cache may need extension (expected ${cacheDays} days).`;
    
    if (strictWarmup) {
      // Strict mode: fail (used in backfill workflow)
      return {
        ok: false,
        message,
      };
    } else {
      // Non-strict mode: warn but don't fail (used in daily update workflow)
      console.warn(`  ⚠️  ${message}`);
      console.warn(`      Warm-up zeros detected; NOT failing in non-strict mode. Run cache extension + backfill-health-history to fix.`);
    }
  }
  
  // Check date range
  if (history.length > 0) {
    const earliest = history[0]!.date;
    const latest = history[history.length - 1]!.date;
    
    // Find earliest non-zero date
    let earliestNonZero: string | null = null;
    for (const point of history) {
      const totalPct = (point.greenPct || 0) + (point.yellowPct || 0) + (point.redPct || 0);
      if (totalPct > 0) {
        earliestNonZero = point.date;
        break;
      }
    }
    
    let warmupInfo = '';
    if (earliestNonZero && earliestNonZero !== earliest) {
      const warmupDays = Math.ceil(
        (new Date(earliestNonZero).getTime() - new Date(earliest).getTime()) / (1000 * 60 * 60 * 24)
      );
      warmupInfo = `, warm-up: ${warmupDays} days`;
    }
    
    return {
      ok: true,
      message: `${deckId}: ${currentCount} points (${earliest} to ${latest}${warmupInfo})`,
    };
  }
  
  return { ok: true, message: `${deckId}: ${currentCount} points` };
}

/**
 * Main verification function
 */
function main() {
  console.log('🔍 Verifying history retention...\n');
  
  const deckIds = getAllDeckIds();
  const results: Array<{ deckId: TrendDeckId; ok: boolean; message: string }> = [];
  
  for (const deckId of deckIds) {
    const result = verifyDeckHistory(deckId);
    results.push({ deckId, ...result });
    const status = result.ok ? '✓' : '✗';
    console.log(`  ${status} ${result.message}`);
  }
  
  console.log('');
  
  const failures = results.filter((r) => !r.ok);
  if (failures.length > 0) {
    console.error('❌ History retention check failed!');
    console.error('   This indicates potential data loss. Review the generation scripts.');
    process.exit(1);
  }
  
  console.log('✅ All history retention checks passed');
  process.exit(0);
}

main();
