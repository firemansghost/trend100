/**
 * Pure planning for Marketstack EOD cache updates.
 * No I/O and no provider calls — used by scripts/marketstack-cache.ts and unit tests.
 */

export const RECENT_CACHE_MAX_TRADING_DAYS = 3;
export const STALE_GAP_FILL_OVERLAP_CALENDAR_DAYS = 5;
export const MARKETSTACK_EOD_PAGE_LIMIT = 1000;

export type CachedSymbolUpdateKind = 'latest' | 'stale-gap-fill';

export interface CachedSymbolUpdatePlan {
  kind: CachedSymbolUpdateKind;
  daysSinceLastCache: number;
  /** Inclusive start for historical fetch; set only for stale-gap-fill. */
  gapFillStartDate?: string;
  /** Inclusive end (UTC today); set only for stale-gap-fill. */
  gapFillEndDate?: string;
}

/**
 * Approximate trading-day span (same 5/7 calendar heuristic as marketstack-cache).
 */
export function approximateTradingDaysBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.ceil(days * (5 / 7));
}

export function addCalendarDaysUtc(isoDate: string, deltaDays: number): string {
  const parts = isoDate.split('-').map((p) => parseInt(p, 10));
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (y == null || m == null || d == null || Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) {
    throw new Error(`Invalid ISO date: ${isoDate}`);
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

/**
 * Decide latest-batch vs historical gap-fill for a symbol that already has cache.
 */
export function planCachedSymbolUpdate(args: {
  lastCachedDate: string;
  todayUtc: string;
  recentMaxTradingDays?: number;
  overlapCalendarDays?: number;
}): CachedSymbolUpdatePlan {
  const recentMax = args.recentMaxTradingDays ?? RECENT_CACHE_MAX_TRADING_DAYS;
  const overlap = args.overlapCalendarDays ?? STALE_GAP_FILL_OVERLAP_CALENDAR_DAYS;
  const daysSinceLastCache = approximateTradingDaysBetween(args.lastCachedDate, args.todayUtc);

  if (daysSinceLastCache <= recentMax) {
    return { kind: 'latest', daysSinceLastCache };
  }

  return {
    kind: 'stale-gap-fill',
    daysSinceLastCache,
    gapFillStartDate: addCalendarDaysUtc(args.lastCachedDate, -overlap),
    gapFillEndDate: args.todayUtc,
  };
}
