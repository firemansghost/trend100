/**
 * Marketstack EOD cache management
 * 
 * Handles file-based caching of EOD bars to avoid refetching full history.
 */

import './load-env';

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { join } from 'path';
import type { EodBar } from '../src/modules/trend100/data/providers/marketstack';
import { fetchEodSeries, fetchEodLatestBatch } from '../src/modules/trend100/data/providers/marketstack';
import {
  MARKETSTACK_EOD_PAGE_LIMIT,
  approximateTradingDaysBetween,
  planCachedSymbolUpdate,
} from '../src/modules/trend100/data/providers/marketstackCachePlan';
import { fetchStooqEodSeries, isForceFallback } from './stooq-eod';

const CACHE_DIR = join(process.cwd(), 'data', 'marketstack', 'eod');
const META_DIR = join(CACHE_DIR, '.meta');
const EARLIEST_META_DIR = join(process.cwd(), 'data', 'marketstack', 'meta');
const EARLIEST_FILE = join(EARLIEST_META_DIR, 'earliest.json');

/**
 * Earliest-available floor per symbol (committed; reduces repeated Marketstack extend attempts).
 * When Marketstack returns 0 bars for an extension request, we record the floor and skip future attempts.
 */
function loadEarliestFloors(): Record<string, string> {
  if (!existsSync(EARLIEST_FILE)) {
    return {};
  }
  try {
    const content = readFileSync(EARLIEST_FILE, 'utf-8').replace(/\r\n/g, '\n').trim();
    const data = JSON.parse(content) as Record<string, string>;
    return typeof data === 'object' && data !== null ? data : {};
  } catch {
    return {};
  }
}

function getEarliestFloor(symbol: string): string | null {
  const floors = loadEarliestFloors();
  const key = symbol.toUpperCase();
  return floors[key] ?? null;
}

function saveEarliestFloor(symbol: string, date: string): void {
  if (!existsSync(EARLIEST_META_DIR)) {
    mkdirSync(EARLIEST_META_DIR, { recursive: true });
  }
  const floors = loadEarliestFloors();
  floors[symbol.toUpperCase()] = date;
  const tmpPath = join(EARLIEST_META_DIR, 'earliest.json.tmp');
  writeFileSync(tmpPath, JSON.stringify(floors, null, 2) + '\n', 'utf-8');
  renameSync(tmpPath, EARLIEST_FILE);
}

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

export interface CacheMergeStats {
  oldCount: number;
  newCount: number;
  firstDate: string | null;
  lastDate: string | null;
  datesAdded: number;
  datesReplaced: number;
}

/** Merge fetched bars into on-disk cache. Never deletes the file. */
export function mergeFetchedBarsIntoCache(symbol: string, fetched: EodBar[]): CacheMergeStats {
  const existing = loadCachedBars(symbol) ?? [];
  const existingDates = new Set(existing.map((b) => b.date));
  let datesAdded = 0;
  let datesReplaced = 0;
  for (const bar of fetched) {
    if (existingDates.has(bar.date)) datesReplaced += 1;
    else datesAdded += 1;
  }
  const merged = mergeBars(existing, fetched);
  saveCachedBars(symbol, merged);
  return {
    oldCount: existing.length,
    newCount: merged.length,
    firstDate: merged[0]?.date ?? null,
    lastDate: merged[merged.length - 1]?.date ?? null,
    datesAdded,
    datesReplaced,
  };
}

/**
 * Get number of trading days between two dates (approximate)
 */
function getTradingDaysBetween(startDate: string, endDate: string): number {
  return approximateTradingDaysBetween(startDate, endDate);
}

export interface EodRangeFetchResult {
  bars: EodBar[];
  requestCount: number;
  truncated: boolean;
}

/**
 * Fetch EOD bars for [startDate, endDate] with pagination when a page hits the provider limit.
 * Marketstack returns the newest bars first when truncated; walk backward until the start is covered.
 */
export async function fetchEodSeriesRange(
  symbol: string,
  startDate: string,
  endDate: string
): Promise<EodRangeFetchResult> {
  const merged = new Map<string, EodBar>();
  let requestCount = 0;
  let rangeEnd = endDate;
  let truncated = false;
  const maxPages = 24;

  while (rangeEnd >= startDate && requestCount < maxPages) {
    requestCount += 1;
    const page = await fetchEodSeries(symbol, {
      startDate,
      endDate: rangeEnd,
      limit: MARKETSTACK_EOD_PAGE_LIMIT,
    });
    if (page.length === 0) {
      break;
    }
    for (const bar of page) {
      merged.set(bar.date, bar);
    }
    if (page.length < MARKETSTACK_EOD_PAGE_LIMIT) {
      truncated = false;
      break;
    }
    const oldest = page[0]!.date;
    if (oldest <= startDate) {
      truncated = false;
      break;
    }
    const prev = new Date(`${oldest}T00:00:00Z`);
    prev.setUTCDate(prev.getUTCDate() - 1);
    const nextEnd = prev.toISOString().slice(0, 10);
    if (nextEnd >= rangeEnd) {
      truncated = true;
      break;
    }
    rangeEnd = nextEnd;
    if (requestCount === maxPages) {
      truncated = true;
    }
  }

  const bars = Array.from(merged.values()).sort((a, b) => a.date.localeCompare(b.date));
  if (truncated) {
    console.warn(
      `    ⚠️  ${symbol}: historical range ${startDate}–${endDate} may be truncated after ${requestCount} request(s) (page hit ${MARKETSTACK_EOD_PAGE_LIMIT})`
    );
  }
  return { bars, requestCount, truncated };
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
  let cached = loadCachedBars(symbol);
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

      const knownFloor = getEarliestFloor(symbol);
      if (knownFloor && extendStartStr < knownFloor) {
        console.log(`    ℹ️  SKIP extend ${symbol}: known floor ${knownFloor}`);
      } else {
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
          saveEarliestFloor(symbol, earliestCachedDate);
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
    const plan = planCachedSymbolUpdate({ lastCachedDate, todayUtc: today });
    console.log(`  🔄 Filling gap for ${symbol} (gap: ${plan.daysSinceLastCache} trading days, ${plan.gapFillStartDate} → ${plan.gapFillEndDate})...`);
    try {
      const fetched = await fetchEodSeriesRange(symbol, plan.gapFillStartDate!, plan.gapFillEndDate!);
      if (fetched.truncated) {
        return {
          ok: false,
          symbol,
          reason: `historical gap-fill truncated for ${symbol} (${plan.gapFillStartDate}–${plan.gapFillEndDate})`,
        };
      }
      const merged = mergeBars(cached, fetched.bars);
      saveCachedBars(symbol, merged);
      console.log(
        `    ✓ Merged ${fetched.bars.length} fetched bars (${fetched.requestCount} request(s)), total: ${merged.length}`
      );
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
  const symbolsNeedingGapFill: string[] = [];
  const symbolsNeedingExtension: string[] = [];
  const forceExtend = process.env.MARKETSTACK_FORCE_EXTEND === '1';
  const todayUtc = new Date().toISOString().split('T')[0]!;

  const queueCachedForwardUpdate = (symbol: string, cached: EodBar[]) => {
    const lastDate = cached[cached.length - 1]!.date;
    const plan = planCachedSymbolUpdate({ lastCachedDate: lastDate, todayUtc });
    if (plan.kind === 'latest') {
      symbolsNeedingUpdate.push(symbol);
    } else {
      symbolsNeedingGapFill.push(symbol);
    }
  };

  for (const symbol of symbols) {
    const cached = loadCachedBars(symbol);
    if (!cached || cached.length === 0) {
      symbolsNeedingBackfill.push(symbol);
    } else {
      cachedMap.set(symbol, cached);
      
      // Check if cache needs extension (span < CACHE_DAYS)
      // Skip if marked as inception-limited (unless force extend)
      if (isInceptionLimited(symbol, forceExtend)) {
        queueCachedForwardUpdate(symbol, cached);
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
          queueCachedForwardUpdate(symbol, cached);
        }
      }
    }
  }
  
  // Extend caches that need it (respect budget)
  if (symbolsNeedingExtension.length > 0) {
    const symbolsToExtend = symbolsNeedingExtension.slice(0, extendMaxSymbols);
    console.log(`  📥 Extending cache for ${symbolsToExtend.length} symbol(s) (budget: ${extendMaxSymbols}, ${symbolsNeedingExtension.length} total need extension)...`);
    let extendSkippedFloor = 0;
    let extendFloorsUpdated = 0;

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

      const knownFloor = getEarliestFloor(symbol);
      if (knownFloor && extendStartStr < knownFloor) {
        console.log(`      ℹ️  SKIP extend ${symbol}: known floor ${knownFloor}`);
        extendSkippedFloor++;
        queueCachedForwardUpdate(symbol, cached);
        continue;
      }

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
          saveEarliestFloor(symbol, earliestCachedDate);
          extendFloorsUpdated++;
          console.log(`      ℹ️  ${symbol} cannot extend earlier than ${earliestCachedDate} (provider limit/inception)`);
          queueCachedForwardUpdate(symbol, cached);
        } else {
          // Successfully extended
          const merged = mergeBars(olderBars, cached);
          saveCachedBars(symbol, merged);
          
          // Reload and update cachedMap
          const extendedCache = loadCachedBars(symbol);
          if (extendedCache) {
            cachedMap.set(symbol, extendedCache);
            console.log(`      ✓ Extended: ${olderBars.length} older bars, total: ${extendedCache.length} bars`);
            queueCachedForwardUpdate(symbol, extendedCache);
          }
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(`      ⚠️  Failed to extend cache for ${symbol}: ${reason}`);
        // Continue with existing cache - not fatal
      }
    }
    
    if (extendSkippedFloor > 0 || extendFloorsUpdated > 0) {
      console.log(`    📊 Extend phase: ${extendSkippedFloor} skipped (known floor), ${extendFloorsUpdated} floor(s) updated`);
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
  
  // Historical gap-fill for stale caches (not latest-only batch)
  if (symbolsNeedingGapFill.length > 0) {
    console.log(`  📥 Historical gap-fill for ${symbolsNeedingGapFill.length} stale symbol(s) (not included in latest batch)...`);
    for (const symbol of symbolsNeedingGapFill) {
      const cached = cachedMap.get(symbol);
      if (!cached) {
        const historyResult = await ensureHistory(symbol);
        if (historyResult.ok && historyResult.bars) {
          result.set(symbol, historyResult.bars);
        } else {
          failures.push(symbol);
          console.warn(`  ⚠️  Skipping ${symbol}: ${historyResult.reason || 'unavailable'}`);
        }
        continue;
      }
      const lastDate = cached[cached.length - 1]!.date;
      const plan = planCachedSymbolUpdate({ lastCachedDate: lastDate, todayUtc });
      if (plan.kind !== 'stale-gap-fill' || !plan.gapFillStartDate || !plan.gapFillEndDate) {
        result.set(symbol, cached);
        continue;
      }
      console.log(
        `    Filling ${symbol} ${plan.gapFillStartDate} → ${plan.gapFillEndDate} (gap ≈ ${plan.daysSinceLastCache} trading days)...`
      );
      try {
        const fetched = await fetchEodSeriesRange(symbol, plan.gapFillStartDate, plan.gapFillEndDate);
        if (fetched.truncated) {
          failures.push(symbol);
          console.warn(
            `  ⚠️  Skipping ${symbol}: gap-fill truncated; existing cache left unchanged`
          );
          result.set(symbol, cached);
          continue;
        }
        const merged = mergeBars(cached, fetched.bars);
        saveCachedBars(symbol, merged);
        cachedMap.set(symbol, merged);
        result.set(symbol, merged);
        console.log(
          `      ✓ ${symbol}: fetched ${fetched.bars.length} bars in ${fetched.requestCount} request(s), cache ${cached.length} → ${merged.length}`
        );
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        failures.push(symbol);
        console.warn(`  ⚠️  Gap-fill failed for ${symbol}, existing cache left unchanged: ${reason}`);
        result.set(symbol, cached);
      }
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

    // Cache exists - always refresh last N days (Stooq is free; ensures daily freshness)
    const lastCachedDate = cached[cached.length - 1]!.date;
    const lookbackDays = parseInt(process.env.EOD_STOOQ_LOOKBACK_DAYS || '20', 10);
    const gapStartDate = new Date(lastCachedDate);
    gapStartDate.setDate(gapStartDate.getDate() - lookbackDays);
    const earliestCachedStr = cached[0]!.date;
    const gapStartStr =
      gapStartDate.toISOString().split('T')[0]! < earliestCachedStr
        ? earliestCachedStr
        : gapStartDate.toISOString().split('T')[0]!;
    console.log(`  🔄 [Stooq] Refreshing ${symbol} (last: ${lastCachedDate}, lookback: ${lookbackDays}d)...`);
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
  forcedFallback: string[];
  stooqFailedFallback: string[];
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
  const forcedFallback: string[] = [];
  const stooqFailedFallback: string[] = [];
  const result = new Map<string, EodBar[]>();
  const today = new Date().toISOString().split('T')[0]!;
  const cacheDays = parseInt(process.env.MARKETSTACK_CACHE_DAYS || '2300', 10);

  for (const symbol of symbols) {
    if (isForceFallback(symbol)) {
      console.log(`  Stooq forced fallback: ${symbol}`);
      forcedFallback.push(symbol);
      continue;
    }

    const cached = loadCachedBars(symbol);

    if (!cached || cached.length === 0) {
      // Backfill: try Stooq first
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - cacheDays);
      const startDateStr = startDate.toISOString().split('T')[0]!;
      console.log(`  📥 [Stooq] Backfilling ${symbol} (${cacheDays} days)...`);
      try {
        const bars = await fetchStooqEodSeries(symbol, startDateStr, today);
        if (bars.length === 0) {
          console.warn(`    ⚠️  Stooq returned 0 bars for ${symbol}, falling back to Marketstack`);
          stooqFailedFallback.push(symbol);
        } else {
          saveCachedBars(symbol, bars);
          result.set(symbol, bars);
          stooqOk.push(symbol);
          console.log(`    ✓ Cached ${bars.length} bars`);
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        const truncated = reason.length > 300 ? reason.slice(0, 297) + '...' : reason;
        console.warn(`    ⚠️  Stooq failed for ${symbol}, falling back to Marketstack: ${truncated}`);
        stooqFailedFallback.push(symbol);
      }
      continue;
    }

    // Cache exists - always refresh last N days (Stooq is free; ensures daily freshness)
    const lastCachedDate = cached[cached.length - 1]!.date;
    const lookbackDays = parseInt(process.env.EOD_STOOQ_LOOKBACK_DAYS || '20', 10);
    const gapStartDate = new Date(lastCachedDate);
    gapStartDate.setDate(gapStartDate.getDate() - lookbackDays);
    const earliestCachedStr = cached[0]!.date;
    const gapStartStr =
      gapStartDate.toISOString().split('T')[0]! < earliestCachedStr
        ? earliestCachedStr
        : gapStartDate.toISOString().split('T')[0]!;
    console.log(`  🔄 [Stooq] Refreshing ${symbol} (last: ${lastCachedDate}, lookback: ${lookbackDays}d)...`);
    try {
      const newBars = await fetchStooqEodSeries(symbol, gapStartStr, today);
      if (newBars.length === 0) {
        console.warn(`    ⚠️  Stooq returned 0 bars for ${symbol}, falling back to Marketstack`);
        stooqFailedFallback.push(symbol);
      } else {
        const merged = mergeBars(cached, newBars);
        saveCachedBars(symbol, merged);
        result.set(symbol, merged);
        stooqOk.push(symbol);
        console.log(`    ✓ Merged ${newBars.length} new bars, total: ${merged.length}`);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const truncated = reason.length > 300 ? reason.slice(0, 297) + '...' : reason;
      console.warn(`    ⚠️  Stooq failed for ${symbol}, falling back to Marketstack: ${truncated}`);
      stooqFailedFallback.push(symbol);
    }
  }

  const fallback = [...forcedFallback, ...stooqFailedFallback];

  // Stooq freshness summary
  const lastBySymbol = new Map<string, string>();
  for (const sym of stooqOk) {
    const bars = result.get(sym);
    if (bars && bars.length > 0) {
      lastBySymbol.set(sym, bars[bars.length - 1]!.date);
    }
  }
  if (lastBySymbol.size > 0) {
    const lastDates = [...lastBySymbol.values()];
    const minLast = lastDates.reduce((a, b) => (a < b ? a : b));
    const maxLast = lastDates.reduce((a, b) => (a > b ? a : b));
    console.log(
      `\n  📊 Stooq freshness: minLast=${minLast} maxLast=${maxLast} symbols=${lastBySymbol.size}`
    );
    const gapDays = getTradingDaysBetween(minLast, maxLast);
    if (gapDays > 1) {
      const lagging = [...lastBySymbol.entries()]
        .filter(([, d]) => d === minLast)
        .map(([s]) => s);
      const preview =
        lagging.length <= 10 ? lagging.join(', ') : lagging.slice(0, 10).join(', ') + ` +${lagging.length - 10} more`;
      console.warn(`  ⚠️  Stooq lag: ${gapDays} trading days between min/max. Lagging: ${preview}`);
    }
  }

  // Fallback: fetch failed symbols via Marketstack
  if (fallback.length > 0) {
    const listPreview = fallback.length <= 10 ? fallback.join(', ') : fallback.slice(0, 10).join(', ') + ` +${fallback.length - 10} more`;
    console.log(`\n  📥 [Marketstack fallback] Fetching ${fallback.length} symbol(s): ${listPreview}`);
    const msResult = await ensureHistoryBatch(fallback);
    for (const [sym, bars] of msResult) {
      result.set(sym, bars);
    }
    // Symbols Marketstack couldn't fetch stay missing from result (same as ensureHistoryBatch)
  }

  // Compact summary log
  const fallbackPreview =
    fallback.length <= 10
      ? fallback.join(', ')
      : fallback.slice(0, 10).join(', ') + ` +${fallback.length - 10} more`;
  console.log(
    `\n  📊 Stooq OK: ${stooqOk.length} | Forced fallback: ${forcedFallback.length} | Stooq failed → Marketstack fallback: ${stooqFailedFallback.length}${fallback.length > 0 ? ` (${fallbackPreview})` : ''}`
  );

  return { result, stooqOk, forcedFallback, stooqFailedFallback, fallback };
}
