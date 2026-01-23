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
 * Save EOD bars to cache file (with retention trimming)
 */
function saveCachedBars(symbol: string, bars: EodBar[]): void {
  const filePath = getCacheFilePath(symbol);
  // Ensure sorted ascending
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  
  // Apply retention: keep last MARKETSTACK_CACHE_DAYS (default 800 for lookback buffer)
  // This is longer than MARKETSTACK_HISTORY_DAYS (365) to provide lookback for indicators
  const cacheDays = parseInt(process.env.MARKETSTACK_CACHE_DAYS || '800', 10);
  const trimmed = trimCachedBars(sorted, cacheDays);
  
  writeFileSync(filePath, JSON.stringify(trimmed, null, 2) + '\n', 'utf-8');
}

/**
 * Trim cached bars to retention window
 */
function trimCachedBars(bars: EodBar[], retentionDays: number): EodBar[] {
  if (bars.length === 0) {
    return bars;
  }
  
  // Get latest date
  const latestDate = new Date(bars[bars.length - 1]!.date);
  
  // Calculate cutoff date
  const cutoffDate = new Date(latestDate);
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0]!;
  
  // Filter to bars on or after cutoff date
  return bars.filter((bar) => bar.date >= cutoffDateStr);
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
 * Result of ensureHistory operation
 */
export interface EnsureHistoryResult {
  ok: boolean;
  symbol: string;
  bars?: EodBar[];
  reason?: string;
}

/**
 * Ensure history exists for a symbol (backfill if needed, extend if short, update if stale)
 * 
 * Returns structured result instead of throwing on unavailable symbols.
 * 
 * @param symbol Provider symbol
 * @returns Result with ok flag and bars (or reason if failed)
 */
export async function ensureHistory(symbol: string): Promise<EnsureHistoryResult> {
  const cached = loadCachedBars(symbol);
  const today = new Date().toISOString().split('T')[0]!;

  // Get cache days from env (default 800 for lookback buffer)
  const cacheDays = parseInt(process.env.MARKETSTACK_CACHE_DAYS || '800', 10);
  
  // Get history days from env (default 365 for primary window)
  const historyDays = parseInt(process.env.MARKETSTACK_HISTORY_DAYS || '365', 10);

  if (!cached || cached.length === 0) {
    // No cache - backfill full cache window
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - cacheDays);
    const startDateStr = startDate.toISOString().split('T')[0]!;
    
    console.log(`  📥 Backfilling ${symbol} (${cacheDays} days)...`);
    try {
      const bars = await fetchEodSeries(symbol, {
        startDate: startDateStr,
        limit: 1000,
      });
      saveCachedBars(symbol, bars);
      console.log(`    ✓ Cached ${bars.length} bars`);
      return { ok: true, symbol, bars };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`    ⚠️  Failed to backfill ${symbol}: ${reason}`);
      return { ok: false, symbol, reason };
    }
  }

  // Cache exists - check if we need to extend backwards (one-time cost)
  const earliestCachedDate = cached[0]!.date;
  const latestCachedDate = cached[cached.length - 1]!.date;
  
  // Calculate span in calendar days
  const earliestDate = new Date(earliestCachedDate);
  const latestDate = new Date(latestCachedDate);
  const spanDays = Math.ceil((latestDate.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24));
  
  // If cache span is shorter than CACHE_DAYS (minus small buffer), extend backwards
  const bufferDays = 10; // Small buffer to avoid frequent extensions
  if (spanDays < (cacheDays - bufferDays)) {
    const missingDays = cacheDays - spanDays;
    const extendStartDate = new Date(earliestDate);
    extendStartDate.setDate(extendStartDate.getDate() - missingDays - bufferDays);
    const extendEndDate = new Date(earliestDate);
    extendEndDate.setDate(extendEndDate.getDate() - 1); // One day before existing cache
    
    const extendStartStr = extendStartDate.toISOString().split('T')[0]!;
    const extendEndStr = extendEndDate.toISOString().split('T')[0]!;
    
    console.log(`  📥 Extending ${symbol} cache backwards (${missingDays} days, ${extendStartStr} to ${extendEndStr})...`);
    try {
      const olderBars = await fetchEodSeries(symbol, {
        startDate: extendStartStr,
        endDate: extendEndStr,
        limit: 1000,
      });
      
      // Merge with existing (older bars first, then existing)
      const merged = mergeBars(olderBars, cached);
      saveCachedBars(symbol, merged);
      console.log(`    ✓ Extended cache: ${olderBars.length} older bars, total: ${merged.length} bars`);
      
      // Reload cached data after extension
      const extendedCache = loadCachedBars(symbol);
      if (extendedCache) {
        cached = extendedCache;
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`    ⚠️  Failed to extend cache for ${symbol}, using existing: ${reason}`);
      // Continue with existing cache - not fatal
    }
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
        return { ok: true, symbol, bars: merged };
      } else if (latest && latest.date === lastCachedDate) {
        // Already up to date
        console.log(`    ✓ Already up to date (${lastCachedDate})`);
        return { ok: true, symbol, bars: cached };
      } else {
        // No latest data (symbol unavailable) - return cached but mark as potentially stale
        console.log(`    ⚠️  No new data available, using cache`);
        return { ok: true, symbol, bars: cached };
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`    ⚠️  Failed to fetch latest for ${symbol}, using cache: ${reason}`);
      // Return cached data even on error (better than nothing)
      return { ok: true, symbol, bars: cached };
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
      return { ok: true, symbol, bars: merged };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`    ⚠️  Failed to fill gap for ${symbol}, using cache: ${reason}`);
      // Return cached data even on error
      return { ok: true, symbol, bars: cached };
    }
  }
}

/**
 * Ensure history for multiple symbols (batched latest updates)
 * 
 * Handles failures gracefully - continues processing even if some symbols fail.
 * 
 * @param symbols Array of provider symbols
 * @returns Map of symbol -> EOD bars (only successful symbols)
 */
export async function ensureHistoryBatch(symbols: string[]): Promise<Map<string, EodBar[]>> {
  const result = new Map<string, EodBar[]>();
  const failures: string[] = [];
  
  // Get cache extension budget (default: 10 symbols per run to avoid blowing credits)
  const extendMaxSymbols = parseInt(process.env.MARKETSTACK_EXTEND_MAX_SYMBOLS || '10', 10);
  const cacheDays = parseInt(process.env.MARKETSTACK_CACHE_DAYS || '800', 10);
  
  // First, load all cached data and identify what needs to be done
  const cachedMap = new Map<string, EodBar[]>();
  const symbolsNeedingBackfill: string[] = [];
  const symbolsNeedingUpdate: string[] = [];
  const symbolsNeedingExtension: string[] = [];
  
  for (const symbol of symbols) {
    const cached = loadCachedBars(symbol);
    if (!cached || cached.length === 0) {
      symbolsNeedingBackfill.push(symbol);
    } else {
      cachedMap.set(symbol, cached);
      
      // Check if cache needs extension (span < CACHE_DAYS)
      const earliestCachedDate = cached[0]!.date;
      const latestCachedDate = cached[cached.length - 1]!.date;
      const earliestDate = new Date(earliestCachedDate);
      const latestDate = new Date(latestCachedDate);
      const spanDays = Math.ceil((latestDate.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24));
      const bufferDays = 10;
      
      if (spanDays < (cacheDays - bufferDays)) {
        // Cache span is too short - needs extension
        symbolsNeedingExtension.push(symbol);
      } else {
        // Cache span is sufficient - check if update needed
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
  }
  
  // Extend caches that need it (respect budget)
  if (symbolsNeedingExtension.length > 0) {
    const symbolsToExtend = symbolsNeedingExtension.slice(0, extendMaxSymbols);
    console.log(`  📥 Extending cache for ${symbolsToExtend.length} symbol(s) (budget: ${extendMaxSymbols}, ${symbolsNeedingExtension.length} total need extension)...`);
    
    for (const symbol of symbolsToExtend) {
      const cached = cachedMap.get(symbol)!;
      const earliestCachedDate = cached[0]!.date;
      const latestCachedDate = cached[cached.length - 1]!.date;
      
      const earliestDate = new Date(earliestCachedDate);
      const latestDate = new Date(latestCachedDate);
      const spanDays = Math.ceil((latestDate.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24));
      const missingDays = cacheDays - spanDays;
      const bufferDays = 10;
      
      const extendStartDate = new Date(earliestDate);
      extendStartDate.setDate(extendStartDate.getDate() - missingDays - bufferDays);
      const extendEndDate = new Date(earliestDate);
      extendEndDate.setDate(extendEndDate.getDate() - 1);
      
      const extendStartStr = extendStartDate.toISOString().split('T')[0]!;
      const extendEndStr = extendEndDate.toISOString().split('T')[0]!;
      
      console.log(`    Extending cache for ${symbol} back to ${extendStartStr}...`);
      try {
        const olderBars = await fetchEodSeries(symbol, {
          startDate: extendStartStr,
          endDate: extendEndStr,
          limit: 1000,
        });
        
        const merged = mergeBars(olderBars, cached);
        saveCachedBars(symbol, merged);
        
        // Reload and update cachedMap
        const extendedCache = loadCachedBars(symbol);
        if (extendedCache) {
          cachedMap.set(symbol, extendedCache);
          console.log(`      ✓ Extended: ${olderBars.length} older bars, total: ${extendedCache.length} bars`);
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(`      ⚠️  Failed to extend cache for ${symbol}: ${reason}`);
        // Continue with existing cache - not fatal
      }
    }
    
    if (symbolsNeedingExtension.length > extendMaxSymbols) {
      console.log(`    ℹ️  ${symbolsNeedingExtension.length - extendMaxSymbols} more symbol(s) need extension (budget exhausted). Run again or increase MARKETSTACK_EXTEND_MAX_SYMBOLS.`);
    }
  }
  
  // Backfill missing symbols
  for (const symbol of symbolsNeedingBackfill) {
    const historyResult = await ensureHistory(symbol);
    if (historyResult.ok && historyResult.bars) {
      result.set(symbol, historyResult.bars);
    } else {
      failures.push(symbol);
      console.warn(`  ⚠️  Skipping ${symbol}: ${historyResult.reason || 'unavailable'}`);
    }
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
          // Shouldn't happen, but handle gracefully - try individual ensureHistory
          const historyResult = await ensureHistory(symbol);
          if (historyResult.ok && historyResult.bars) {
            result.set(symbol, historyResult.bars);
          } else {
            failures.push(symbol);
            console.warn(`  ⚠️  Skipping ${symbol}: ${historyResult.reason || 'unavailable'}`);
          }
          continue;
        }
        
        if (latest && latest.date > cached[cached.length - 1]!.date) {
          // New bar - merge and save
          const merged = mergeBars(cached, [latest]);
          saveCachedBars(symbol, merged);
          result.set(symbol, merged);
        } else if (latest === null) {
          // Symbol unavailable - use cached but log warning
          console.warn(`  ⚠️  ${symbol} unavailable, using cached data`);
          result.set(symbol, cached);
        } else {
          // No update needed
          result.set(symbol, cached);
        }
      }
    } catch (error) {
      console.warn(`  ⚠️  Batch update failed, falling back to individual updates:`, error instanceof Error ? error.message : String(error));
      // Fallback to individual updates
      for (const symbol of symbolsNeedingUpdate) {
        const historyResult = await ensureHistory(symbol);
        if (historyResult.ok && historyResult.bars) {
          result.set(symbol, historyResult.bars);
        } else {
          failures.push(symbol);
          console.warn(`  ⚠️  Skipping ${symbol}: ${historyResult.reason || 'unavailable'}`);
        }
      }
    }
  }
  
  // Add symbols that didn't need updates
  for (const [symbol, bars] of cachedMap.entries()) {
    if (!result.has(symbol)) {
      result.set(symbol, bars);
    }
  }
  
  if (failures.length > 0) {
    console.warn(`\n  ⚠️  ${failures.length} symbol(s) unavailable: ${failures.join(', ')}`);
  }
  
  return result;
}
