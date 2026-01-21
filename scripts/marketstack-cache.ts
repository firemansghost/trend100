/**
 * Marketstack EOD cache management
 * 
 * Handles file-based caching of EOD bars to avoid refetching full history.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { EodBar } from '../src/modules/trend100/data/providers/marketstack';
import { fetchEodSeries, fetchEodLatestBatch } from '../src/modules/trend100/data/providers/marketstack';

const CACHE_DIR = join(process.cwd(), 'data', 'marketstack', 'eod');

/**
 * Get safe filename for symbol (replace special chars)
 */
function getCacheFileName(symbol: string): string {
  // Replace '.' with '_' and other unsafe chars
  return `${symbol.replace(/\./g, '_').replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
}

/**
 * Get cache file path for symbol
 */
function getCacheFilePath(symbol: string): string {
  // Ensure cache directory exists
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
  return join(CACHE_DIR, getCacheFileName(symbol));
}

/**
 * Load cached EOD bars from file
 */
function loadCachedBars(symbol: string): EodBar[] | null {
  const filePath = getCacheFilePath(symbol);
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const bars = JSON.parse(content) as EodBar[];
    if (!Array.isArray(bars)) {
      return null;
    }
    // Ensure sorted ascending by date
    return bars.sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    console.warn(`Failed to load cache for ${symbol}:`, error);
    return null;
  }
}

/**
 * Save EOD bars to cache file
 */
function saveCachedBars(symbol: string, bars: EodBar[]): void {
  const filePath = getCacheFilePath(symbol);
  // Ensure sorted ascending
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  writeFileSync(filePath, JSON.stringify(sorted, null, 2) + '\n', 'utf-8');
}

/**
 * Merge new bars into existing bars (no duplicates, keep sorted)
 */
function mergeBars(existing: EodBar[], newBars: EodBar[]): EodBar[] {
  const dateMap = new Map<string, EodBar>();
  
  // Add existing bars
  for (const bar of existing) {
    dateMap.set(bar.date, bar);
  }
  
  // Add/update with new bars
  for (const bar of newBars) {
    dateMap.set(bar.date, bar);
  }
  
  // Convert back to array and sort
  return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get number of trading days between two dates (approximate)
 */
function getTradingDaysBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  // Approximate: ~5/7 of calendar days are trading days
  return Math.ceil(days * (5 / 7));
}

/**
 * Ensure history exists for a symbol (backfill if needed, update if stale)
 * 
 * @param symbol Provider symbol
 * @returns Array of EOD bars (cached or fetched)
 */
export async function ensureHistory(symbol: string): Promise<EodBar[]> {
  const cached = loadCachedBars(symbol);
  const today = new Date().toISOString().split('T')[0]!;

  // Get history days from env (default 365)
  const historyDays = parseInt(process.env.MARKETSTACK_HISTORY_DAYS || '365', 10);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - historyDays);
  const startDateStr = startDate.toISOString().split('T')[0]!;

  if (!cached || cached.length === 0) {
    // No cache - backfill full history
    console.log(`  📥 Backfilling ${symbol} (${historyDays} days)...`);
    const bars = await fetchEodSeries(symbol, {
      startDate: startDateStr,
      limit: 1000,
    });
    saveCachedBars(symbol, bars);
    console.log(`    ✓ Cached ${bars.length} bars`);
    return bars;
  }

  // Cache exists - check if we need to update
  const lastCachedDate = cached[cached.length - 1]!.date;
  const daysSinceLastCache = getTradingDaysBetween(lastCachedDate, today);

  if (daysSinceLastCache <= 3) {
    // Recent cache (within 3 trading days) - try batched latest update
    console.log(`  🔄 Updating ${symbol} (last cached: ${lastCachedDate})...`);
    
    try {
      const latestMap = await fetchEodLatestBatch([symbol]);
      const latest = latestMap.get(symbol);
      
      if (latest && latest.date > lastCachedDate) {
        // New bar available - merge and save
        const merged = mergeBars(cached, [latest]);
        saveCachedBars(symbol, merged);
        console.log(`    ✓ Updated with latest bar (${latest.date})`);
        return merged;
      } else if (latest && latest.date === lastCachedDate) {
        // Already up to date
        console.log(`    ✓ Already up to date (${lastCachedDate})`);
        return cached;
      } else {
        // No latest data or error - return cached
        console.log(`    ⚠️  No new data, using cache`);
        return cached;
      }
    } catch (error) {
      console.warn(`    ⚠️  Failed to fetch latest for ${symbol}, using cache:`, error instanceof Error ? error.message : String(error));
      return cached;
    }
  } else {
    // Gap > 3 trading days - fetch recent history and merge
    console.log(`  🔄 Filling gap for ${symbol} (gap: ${daysSinceLastCache} trading days)...`);
    const gapStartDate = new Date(lastCachedDate);
    gapStartDate.setDate(gapStartDate.getDate() - 5); // Fetch a bit before last cached to ensure overlap
    
    try {
      const newBars = await fetchEodSeries(symbol, {
        startDate: gapStartDate.toISOString().split('T')[0]!,
        limit: 30, // Last ~30 days should cover the gap
      });
      
      const merged = mergeBars(cached, newBars);
      saveCachedBars(symbol, merged);
      console.log(`    ✓ Merged ${newBars.length} new bars, total: ${merged.length}`);
      return merged;
    } catch (error) {
      console.warn(`    ⚠️  Failed to fill gap for ${symbol}, using cache:`, error instanceof Error ? error.message : String(error));
      return cached;
    }
  }
}

/**
 * Ensure history for multiple symbols (batched latest updates)
 * 
 * @param symbols Array of provider symbols
 * @returns Map of symbol -> EOD bars
 */
export async function ensureHistoryBatch(symbols: string[]): Promise<Map<string, EodBar[]>> {
  const result = new Map<string, EodBar[]>();
  
  // First, load all cached data
  const cachedMap = new Map<string, EodBar[]>();
  const symbolsNeedingBackfill: string[] = [];
  const symbolsNeedingUpdate: string[] = [];
  
  for (const symbol of symbols) {
    const cached = loadCachedBars(symbol);
    if (!cached || cached.length === 0) {
      symbolsNeedingBackfill.push(symbol);
    } else {
      cachedMap.set(symbol, cached);
      const lastDate = cached[cached.length - 1]!.date;
      const today = new Date().toISOString().split('T')[0]!;
      const daysSince = getTradingDaysBetween(lastDate, today);
      
      if (daysSince <= 3) {
        symbolsNeedingUpdate.push(symbol);
      } else {
        // Gap too large - will need individual fetch
        symbolsNeedingUpdate.push(symbol);
      }
    }
  }
  
  // Backfill missing symbols
  for (const symbol of symbolsNeedingBackfill) {
    const bars = await ensureHistory(symbol);
    result.set(symbol, bars);
  }
  
  // Batch update symbols with recent cache
  if (symbolsNeedingUpdate.length > 0) {
    console.log(`  📥 Fetching latest for ${symbolsNeedingUpdate.length} symbols...`);
    try {
      const latestMap = await fetchEodLatestBatch(symbolsNeedingUpdate);
      
      for (const symbol of symbolsNeedingUpdate) {
        const cached = cachedMap.get(symbol);
        const latest = latestMap.get(symbol);
        
        if (!cached) {
          // Shouldn't happen, but handle gracefully
          const bars = await ensureHistory(symbol);
          result.set(symbol, bars);
          continue;
        }
        
        if (latest && latest.date > cached[cached.length - 1]!.date) {
          // New bar - merge and save
          const merged = mergeBars(cached, [latest]);
          saveCachedBars(symbol, merged);
          result.set(symbol, merged);
        } else {
          // No update needed or error
          result.set(symbol, cached);
        }
      }
    } catch (error) {
      console.warn(`  ⚠️  Batch update failed, falling back to individual updates:`, error instanceof Error ? error.message : String(error));
      // Fallback to individual updates
      for (const symbol of symbolsNeedingUpdate) {
        const bars = await ensureHistory(symbol);
        result.set(symbol, bars);
      }
    }
  }
  
  // Add symbols that didn't need updates
  for (const [symbol, bars] of cachedMap.entries()) {
    if (!result.has(symbol)) {
      result.set(symbol, bars);
    }
  }
  
  return result;
}
