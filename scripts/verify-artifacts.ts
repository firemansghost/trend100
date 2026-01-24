/**
 * Verify artifacts - print stats for generated files
 * 
 * Prints point counts and date ranges for health history and EOD cache files.
 * Useful for debugging and verification.
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import type { TrendHealthHistoryPoint, TrendDeckId } from '../src/modules/trend100/types';
import { getAllDeckIds } from '../src/modules/trend100/data/decks';

const PUBLIC_DIR = join(process.cwd(), 'public');
const EOD_CACHE_DIR = join(process.cwd(), 'data', 'marketstack', 'eod');

function getHealthHistoryRetentionDays(): number {
  const raw = process.env.HEALTH_HISTORY_RETENTION_DAYS;
  if (!raw || raw.trim() === '') return 0;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return 0;
  return Math.max(0, parsed);
}

/**
 * Print health history stats for a deck
 */
function printHealthHistoryStats(deckId: TrendDeckId): void {
  const filePath = join(PUBLIC_DIR, `health-history.${deckId}.json`);
  if (!existsSync(filePath)) {
    console.log(`  ${deckId}: File not found`);
    return;
  }
  
  try {
    const content = readFileSync(filePath, 'utf-8');
    const history = JSON.parse(content) as TrendHealthHistoryPoint[];
    if (!Array.isArray(history) || history.length === 0) {
      console.log(`  ${deckId}: Empty or invalid`);
      return;
    }
    
    const earliest = history[0]!.date;
    const latest = history[history.length - 1]!.date;
    const days = Math.ceil(
      (new Date(latest).getTime() - new Date(earliest).getTime()) / (1000 * 60 * 60 * 24)
    );
    
    // Check for warm-up issues (points with totalPct == 0) in a recent window.
    // With long-run retention, early "warm-up" zeros are expected and should not dominate the signal.
    const latestDateStr = history[history.length - 1]!.date;
    const windowDays = Math.max(1, parseInt(process.env.TREND100_WARMUP_CHECK_DAYS || '365', 10));
    const windowStart = new Date(latestDateStr);
    windowStart.setDate(windowStart.getDate() - windowDays);
    const windowStartStr = windowStart.toISOString().split('T')[0]!;
    const windowHistory = history.filter((p) => p.date >= windowStartStr);

    // Separate valid and UNKNOWN points
    const validPoints = history.filter((p) => p.greenPct !== null && p.regimeLabel !== 'UNKNOWN');
    const unknownPoints = history.filter((p) => p.regimeLabel === 'UNKNOWN' || p.greenPct === null);
    
    // Find earliest valid date
    let firstValidDate: string | null = null;
    for (const point of history) {
      if (point.greenPct !== null && point.regimeLabel !== 'UNKNOWN') {
        firstValidDate = point.date;
        break;
      }
    }
    
    // Check for warm-up issues in valid points only (recent window)
    const validWindowHistory = windowHistory.filter((p) => p.greenPct !== null && p.regimeLabel !== 'UNKNOWN');
    const zeroPoints = validWindowHistory.filter((p) => {
      const totalPct = (p.greenPct || 0) + (p.yellowPct || 0) + (p.redPct || 0);
      return totalPct === 0;
    });
    
    const zeroPct = validWindowHistory.length > 0 ? (zeroPoints.length / validWindowHistory.length) * 100 : 0;
    
    let status = '';
    if (zeroPct > 30 && validWindowHistory.length > 0) {
      status = ` ⚠️  ${zeroPct.toFixed(1)}% zero points (last ${windowDays}d, valid only)`;
    } else if (firstValidDate && firstValidDate > earliest) {
      const warmupDays = Math.ceil(
        (new Date(firstValidDate).getTime() - new Date(earliest).getTime()) / (1000 * 60 * 60 * 24)
      );
      status = ` (warm-up: ${warmupDays} days)`;
    }
    
    console.log(`  ${deckId}: ${history.length} points (${earliest} to ${latest}, ~${days} days)${status}`);
    console.log(`    Valid: ${validPoints.length}, UNKNOWN: ${unknownPoints.length}`);
    if (firstValidDate && firstValidDate !== earliest) {
      console.log(`    First valid: ${firstValidDate}`);
    }
  } catch (error) {
    console.log(`  ${deckId}: Error reading file: ${error}`);
  }
}

/**
 * Print EOD cache stats for a sample of symbols
 */
function printEodCacheStats(sampleSymbols?: string[]): void {
  if (!existsSync(EOD_CACHE_DIR)) {
    console.log('  EOD cache directory not found');
    return;
  }
  
  // If specific symbols requested, use those; otherwise sample from all files
  let files: string[];
  if (sampleSymbols && sampleSymbols.length > 0) {
    files = sampleSymbols
      .map((sym) => `${sym.replace(/\./g, '_')}.json`)
      .filter((f) => existsSync(join(EOD_CACHE_DIR, f)));
  } else {
    files = readdirSync(EOD_CACHE_DIR)
      .filter((f) => f.endsWith('.json'))
      .slice(0, 5);
  }
  
  if (files.length === 0) {
    console.log('  No EOD cache files found');
    return;
  }
  
  const cacheDays = parseInt(process.env.MARKETSTACK_CACHE_DAYS || '1600', 10);
  const limitedHistoryAllowlist = new Set<string>(['FBTC', 'FETH']);
  
  for (const file of files) {
    const filePath = join(EOD_CACHE_DIR, file);
    try {
      const content = readFileSync(filePath, 'utf-8');
      const bars = JSON.parse(content) as Array<{ date: string; close: number }>;
      if (!Array.isArray(bars) || bars.length === 0) {
        console.log(`  ${file}: Empty or invalid`);
        continue;
      }
      
      const symbol = file.replace('.json', '').replace(/_/g, '.');
      const earliest = bars[0]!.date;
      const latest = bars[bars.length - 1]!.date;
      const days = Math.ceil(
        (new Date(latest).getTime() - new Date(earliest).getTime()) / (1000 * 60 * 60 * 24)
      );
      
      const bufferDays = 10;
      const needsExtension = days < (cacheDays - bufferDays);

      // Heuristic: treat some symbols as legitimately limited history (inception),
      // so we don't warn forever.
      //
      // Rules:
      // - Explicit allowlist (FBTC, FETH)
      // - OR if it has "enough" bars already (>=250) and earliest is within ~15 months of today,
      //   assume inception-limited (extension likely won't go earlier).
      const today = new Date();
      const earliestDate = new Date(earliest);
      const inceptionLikely =
        limitedHistoryAllowlist.has(symbol) ||
        (bars.length >= 250 &&
          Math.ceil((today.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24)) <= 460);

      const status = needsExtension
        ? inceptionLikely
          ? ' ℹ️  (limited history: inception)'
          : ' ⚠️  (needs extension)'
        : '';
      console.log(`  ${symbol}: ${bars.length} bars (${earliest} to ${latest}, ~${days} days${status})`);
    } catch (error) {
      console.log(`  ${file}: Error reading file: ${error}`);
    }
  }
  
  if (!sampleSymbols || sampleSymbols.length === 0) {
    const allFiles = readdirSync(EOD_CACHE_DIR).filter((f) => f.endsWith('.json'));
    if (allFiles.length > files.length) {
      console.log(`  ... and ${allFiles.length - files.length} more files`);
    }
  }
}

/**
 * Main function
 */
function main() {
  console.log('📊 Artifact Verification Report\n');
  
  const hhRetentionDays = getHealthHistoryRetentionDays();
  console.log(
    `Health-history retention: ${hhRetentionDays === 0 ? 'none (retain all)' : `${hhRetentionDays} days`}\n`
  );

  console.log('Health History Files:');
  const deckIds = getAllDeckIds();
  for (const deckId of deckIds) {
    printHealthHistoryStats(deckId);
  }
  
  console.log('\nEOD Cache Files (sample: SPY, QQQ, TLT, GLDM, FBTC):');
  printEodCacheStats(['SPY', 'QQQ', 'TLT', 'GLDM', 'FBTC']);
  
  console.log('');
}

main();
