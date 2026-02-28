/**
 * Marketstack EOD cache management
 * 
 * Handles file-based caching of EOD bars to avoid refetching full history.
 */

import './load-env';

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { EodBar } from '../src/modules/trend100/data/providers/marketstack';
import { fetchEodSeries, fetchEodLatestBatch } from '../src/modules/trend100/data/providers/marketstack';
import { fetchStooqEodSeries } from './stooq-eod';

const CACHE_DIR = join(process.cwd(), 'data', 'marketstack', 'eod');
const META_DIR = join(CACHE_DIR, '.meta');

/**
 * Metadata for inception-limited symbols
 * 
 * Inception-limited: Symbols that cannot extend earlier than their oldest cached date
 * because the provider (Marketstack) has no historical data before that point (e.g., ARM, PLTR, SNOW).
 * When extension attempts return 0 older bars, we mark the symbol as inception-limited to avoid
 * wasting extension budget on future runs.
 * 
 * Environment variables:
 * - MARKETSTACK_EXTEND_MAX_SYMBOLS: Budget for extension attempts per run (default: 10)
 * - MARKETSTACK_FORCE_EXTEND=1: Override inception-limited check and retry extension
 */
interface CacheMetadata {
  inceptionLimited: boolean;
  oldestCachedDate: string;
  checkedAt: string;
}

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
 * Get metadata file path for symbol
 */
function getMetadataFilePath(symbol: string): string {
  // Ensure metadata directory exists
  if (!existsSync(META_DIR)) {
    mkdirSync(META_DIR, { recursive: true });
  }
  return join(META_DIR, getCacheFileName(symbol));
}

/**
 * Load metadata for a symbol
 */
function loadMetadata(symbol: string): CacheMetadata | null {
  const filePath = getMetadataFilePath(symbol);
  if (!existsSync(filePath)) {
    return null;
  }
  
  try {
    const content = readFileSync(filePath, 'utf-8');
    const metadata = JSON.parse(content) as CacheMetadata;
    return metadata;
  } catch (error) {
    return null;
  }
}

/**
 * Save metadata for a symbol
 */
function saveMetadata(symbol: string, metadata: CacheMetadata): void {
  const filePath = getMetadataFilePath(symbol);
  writeFileSync(filePath, JSON.stringify(metadata, null, 2) + '\n', 'utf-8');
}

/**
 * Check if symbol is marked as inception-limited
 */
function isInceptionLimited(symbol: string, forceExtend: boolean): boolean {
  if (forceExtend) {
    return false;
  }
  const metadata = loadMetadata(symbol);
  return metadata?.inceptionLimited === true;
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
  
  // Apply retention: keep last MARKETSTACK_CACHE_DAYS (default 2300 for lookback buffer)
  // This is longer than MARKETSTACK_HISTORY_DAYS (365) to provide lookback for indicators
  const cacheDays = parseInt(process.env.MARKETSTACK_CACHE_DAYS || '2300', 10);
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

  // Get cache days from env (default 2300 for lookback buffer)
  const cacheDays = parseInt(process.env.MARKETSTACK_CACHE_DAYS || '2300', 10);
  
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
  // Skip if marked as inception-limited (unless force extend)
  const forceExtend = process.env.MARKETSTACK_FORCE_EXTEND === '1';
  if (!isInceptionLimited(symbol, forceExtend)) {
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
        
        if (olderBars.length === 0) {
          // API returned 0 bars - symbol is inception-limited
          const today = new Date().toISOString().split('T')[0]!;
          saveMetadata(symbol, {
            inceptionLimited: true,
            oldestCachedDate: earliestCachedDate,
            checkedAt: today,
          });
          console.log(`    ℹ️  ${symbol} cannot extend earlier than ${earliestCachedDate} (provider limit/inception)`);
        } else {
          // Successfully extended
          const merged = mergeBars(olderBars, cached);
          saveCachedBars(symbol, merged);
          console.log(`    ✓ Extended cache: ${olderBars.length} older bars, total: ${merged.length} bars`);
          
          // Reload cached data after extension
          const extendedCache = loadCachedBars(symbol);
          if (extendedCache) {
            cached = extendedCache;
          }
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(`    ⚠️  Failed to extend cache for ${symbol}, using existing: ${reason}`);
        // Continue with existing cache - not fatal
      }
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
  const cacheDays = parseInt(process.env.MARKETSTACK_CACHE_DAYS || '2300', 10);
  
  // First, load all cached data and identify what needs to be done
  const cachedMap = new Map<string, EodBar[]>();
  const symbolsNeedingBackfill: string[] = [];
  const symbolsNeedingUpdate: string[] = [];
  const symbolsNeedingExtension: string[] = [];
  const forceExtend = process.env.MARKETSTACK_FORCE_EXTEND === '1';
  
  for (const symbol of symbols) {
    const cached = loadCachedBars(symbol);
    if (!cached || cached.length === 0) {
      symbolsNeedingBackfill.push(symbol);
    } else {
      cachedMap.set(symbol, cached);
      
      // Check if cache needs extension (span < CACHE_DAYS)
      // Skip if marked as inception-limited (unless force extend)
      if (isInceptionLimited(symbol, forceExtend)) {
        // Symbol is inception-limited - skip extension, just update if needed
        const lastDate = cached[cached.length - 1]!.date;
        const today = new Date().toISOString().split('T')[0]!;
        const daysSince = getTradingDaysBetween(lastDate, today);
        symbolsNeedingUpdate.push(symbol);
      } else {
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
        
        if (olderBars.length === 0) {
          // API returned 0 bars - symbol is inception-limited
          const today = new Date().toISOString().split('T')[0]!;
          saveMetadata(symbol, {
            inceptionLimited: true,
            oldestCachedDate: earliestCachedDate,
            checkedAt: today,
          });
          console.log(`      ℹ️  ${symbol} cannot extend earlier than ${earliestCachedDate} (provider limit/inception)`);
          // Move to update queue since extension is not possible
          symbolsNeedingUpdate.push(symbol);
        } else {
          // Successfully extended
          const merged = mergeBars(olderBars, cached);
          saveCachedBars(symbol, merged);
          
          // Reload and update cachedMap
          const extendedCache = loadCachedBars(symbol);
          if (extendedCache) {
            cachedMap.set(symbol, extendedCache);
            console.log(`      ✓ Extended: ${olderBars.length} older bars, total: ${extendedCache.length} bars`);
          }
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

/**
 * Ensure history for symbols using Stooq (pilot provider for selected decks).
 *
 * Same cache format and path as Marketstack; uses Stooq CSV API for fetch.
 * No API key required.
 *
 * @param symbols Array of provider symbols (e.g. GLTR, GDX)
 * @returns Map of symbol -> EOD bars (only successful symbols)
 */
export async function ensureHistoryStooqBatch(symbols: string[]): Promise<Map<string, EodBar[]>> {
  const result = new Map<string, EodBar[]>();
  const today = new Date().toISOString().split('T')[0]!;
  const cacheDays = parseInt(process.env.MARKETSTACK_CACHE_DAYS || '2300', 10);

  for (const symbol of symbols) {
    const cached = loadCachedBars(symbol);

    if (!cached || cached.length === 0) {
      // Backfill full range
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - cacheDays);
      const startDateStr = startDate.toISOString().split('T')[0]!;
      console.log(`  📥 [Stooq] Backfilling ${symbol} (${cacheDays} days)...`);
      try {
        const bars = await fetchStooqEodSeries(symbol, startDateStr, today);
        saveCachedBars(symbol, bars);
        result.set(symbol, bars);
        console.log(`    ✓ Cached ${bars.length} bars`);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(`    ⚠️  Failed to backfill ${symbol}: ${reason}`);
      }
      continue;
    }

    // Cache exists - check if update needed
    const lastCachedDate = cached[cached.length - 1]!.date;
    const daysSinceLastCache = getTradingDaysBetween(lastCachedDate, today);

    if (daysSinceLastCache <= 3) {
      result.set(symbol, cached);
      continue;
    }

    // Gap - fetch from Stooq and merge
    const gapStartDate = new Date(lastCachedDate);
    gapStartDate.setDate(gapStartDate.getDate() - 5);
    const gapStartStr = gapStartDate.toISOString().split('T')[0]!;
    console.log(`  🔄 [Stooq] Updating ${symbol} (last: ${lastCachedDate})...`);
    try {
      const newBars = await fetchStooqEodSeries(symbol, gapStartStr, today);
      const merged = mergeBars(cached, newBars);
      saveCachedBars(symbol, merged);
      result.set(symbol, merged);
      console.log(`    ✓ Merged ${newBars.length} new bars, total: ${merged.length}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`    ⚠️  Failed to update ${symbol}, using cache: ${reason}`);
      result.set(symbol, cached);
    }
  }

  return result;
}

export interface StooqWithFallbackResult {
  result: Map<string, EodBar[]>;
  stooqOk: string[];
  fallback: string[];
}

/**
 * Stooq-first with Marketstack fallback for pilot decks.
 * Tries Stooq for each symbol; on failure (timeout/no data/parse), falls back to Marketstack.
 *
 * @param symbols Array of provider symbols (e.g. GLTR, GDX)
 * @returns Result with bars map and summary (stooqOk, fallback)
 */
export async function ensureHistoryStooqWithFallback(
  symbols: string[]
): Promise<StooqWithFallbackResult> {
  const stooqOk: string[] = [];
  const fallback: string[] = [];
  const result = new Map<string, EodBar[]>();
  const today = new Date().toISOString().split('T')[0]!;
  const cacheDays = parseInt(process.env.MARKETSTACK_CACHE_DAYS || '2300', 10);

  for (const symbol of symbols) {
    const cached = loadCachedBars(symbol);

    if (!cached || cached.length === 0) {
      // Backfill: try Stooq first
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - cacheDays);
      const startDateStr = startDate.toISOString().split('T')[0]!;
      console.log(`  📥 [Stooq] Backfilling ${symbol} (${cacheDays} days)...`);
      try {
        const bars = await fetchStooqEodSeries(symbol, startDateStr, today);
        saveCachedBars(symbol, bars);
        result.set(symbol, bars);
        stooqOk.push(symbol);
        console.log(`    ✓ Cached ${bars.length} bars`);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(`    ⚠️  Stooq failed for ${symbol}, falling back to Marketstack: ${reason}`);
        fallback.push(symbol);
      }
      continue;
    }

    // Cache exists - check if update needed
    const lastCachedDate = cached[cached.length - 1]!.date;
    const daysSinceLastCache = getTradingDaysBetween(lastCachedDate, today);

    if (daysSinceLastCache <= 3) {
      result.set(symbol, cached);
      stooqOk.push(symbol);
      continue;
    }

    // Gap - try Stooq, fallback to Marketstack on failure
    const gapStartDate = new Date(lastCachedDate);
    gapStartDate.setDate(gapStartDate.getDate() - 5);
    const gapStartStr = gapStartDate.toISOString().split('T')[0]!;
    console.log(`  🔄 [Stooq] Updating ${symbol} (last: ${lastCachedDate})...`);
    try {
      const newBars = await fetchStooqEodSeries(symbol, gapStartStr, today);
      const merged = mergeBars(cached, newBars);
      saveCachedBars(symbol, merged);
      result.set(symbol, merged);
      stooqOk.push(symbol);
      console.log(`    ✓ Merged ${newBars.length} new bars, total: ${merged.length}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`    ⚠️  Stooq failed for ${symbol}, falling back to Marketstack: ${reason}`);
      fallback.push(symbol);
    }
  }

  // Fallback: fetch failed symbols via Marketstack
  if (fallback.length > 0) {
    console.log(`\n  📥 [Marketstack fallback] Fetching ${fallback.length} symbol(s): ${fallback.join(', ')}`);
    const msResult = await ensureHistoryBatch(fallback);
    for (const [sym, bars] of msResult) {
      result.set(sym, bars);
    }
    // Symbols Marketstack couldn't fetch stay missing from result (same as ensureHistoryBatch)
  }

  // Summary log
  console.log(
    `\n  📊 Stooq OK: ${stooqOk.length} | Stooq failed → Marketstack fallback: ${fallback.length}${fallback.length > 0 ? ` (${fallback.join(', ')})` : ''}`
  );

  return { result, stooqOk, fallback };
}
