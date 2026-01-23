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
    
    // Check for warm-up issues (points with totalPct == 0)
    const zeroPoints = history.filter((p) => {
      const totalPct = (p.greenPct || 0) + (p.yellowPct || 0) + (p.redPct || 0);
      return totalPct === 0;
    });
    
    // Find earliest date with non-zero health
    let earliestNonZeroDate: string | null = null;
    for (const point of history) {
      const totalPct = (point.greenPct || 0) + (point.yellowPct || 0) + (point.redPct || 0);
      if (totalPct > 0) {
        earliestNonZeroDate = point.date;
        break;
      }
    }
    
    const zeroPct = history.length > 0 ? (zeroPoints.length / history.length) * 100 : 0;
    
    let status = '';
    if (zeroPct > 30) {
      status = ` ⚠️  ${zeroPct.toFixed(1)}% zero points (warm-up issue?)`;
    } else if (earliestNonZeroDate && earliestNonZeroDate > earliest) {
      const warmupDays = Math.ceil(
        (new Date(earliestNonZeroDate).getTime() - new Date(earliest).getTime()) / (1000 * 60 * 60 * 24)
      );
      status = ` (warm-up: ${warmupDays} days)`;
    }
    
    console.log(`  ${deckId}: ${history.length} points (${earliest} to ${latest}, ~${days} days)${status}`);
    if (earliestNonZeroDate && earliestNonZeroDate !== earliest) {
      console.log(`    First non-zero: ${earliestNonZeroDate}`);
    }
  } catch (error) {
    console.log(`  ${deckId}: Error reading file: ${error}`);
  }
}

/**
 * Print EOD cache stats for a sample of symbols
 */
function printEodCacheStats(sampleSize: number = 5): void {
  if (!existsSync(EOD_CACHE_DIR)) {
    console.log('  EOD cache directory not found');
    return;
  }
  
  const files = readdirSync(EOD_CACHE_DIR)
    .filter((f) => f.endsWith('.json'))
    .slice(0, sampleSize);
  
  if (files.length === 0) {
    console.log('  No EOD cache files found');
    return;
  }
  
  for (const file of files) {
    const filePath = join(EOD_CACHE_DIR, file);
    try {
      const content = readFileSync(filePath, 'utf-8');
      const bars = JSON.parse(content) as Array<{ date: string; close: number }>;
      if (!Array.isArray(bars) || bars.length === 0) {
        console.log(`  ${file}: Empty or invalid`);
        continue;
      }
      
      const symbol = file.replace('.json', '');
      const earliest = bars[0]!.date;
      const latest = bars[bars.length - 1]!.date;
      const days = Math.ceil(
        (new Date(latest).getTime() - new Date(earliest).getTime()) / (1000 * 60 * 60 * 24)
      );
      
      console.log(`  ${symbol}: ${bars.length} bars (${earliest} to ${latest}, ~${days} days)`);
    } catch (error) {
      console.log(`  ${file}: Error reading file: ${error}`);
    }
  }
  
  if (files.length < sampleSize) {
    const allFiles = readdirSync(EOD_CACHE_DIR).filter((f) => f.endsWith('.json'));
    console.log(`  ... and ${allFiles.length - files.length} more files`);
  }
}

/**
 * Main function
 */
function main() {
  console.log('📊 Artifact Verification Report\n');
  
  console.log('Health History Files:');
  const deckIds = getAllDeckIds();
  for (const deckId of deckIds) {
    printHealthHistoryStats(deckId);
  }
  
  console.log('\nEOD Cache Files (sample):');
  printEodCacheStats(5);
  
  console.log('');
}

main();
