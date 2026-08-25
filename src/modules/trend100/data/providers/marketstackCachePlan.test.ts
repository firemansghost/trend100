import { describe, expect, it } from 'vitest';
import {
  addCalendarDaysUtc,
  planCachedSymbolUpdate,
  RECENT_CACHE_MAX_TRADING_DAYS,
  STALE_GAP_FILL_OVERLAP_CALENDAR_DAYS,
} from './marketstackCachePlan';

const TODAY = '2026-08-25';

describe('planCachedSymbolUpdate', () => {
  it('routes a cache 1 trading day behind to latest/batch update', () => {
    const plan = planCachedSymbolUpdate({
      lastCachedDate: '2026-08-24',
      todayUtc: TODAY,
    });
    expect(plan.kind).toBe('latest');
    expect(plan.daysSinceLastCache).toBeLessThanOrEqual(RECENT_CACHE_MAX_TRADING_DAYS);
    expect(plan.gapFillStartDate).toBeUndefined();
  });

  it('routes a cache 2–3 trading days behind to existing recent (latest) behavior', () => {
    const twoToThree = planCachedSymbolUpdate({
      lastCachedDate: '2026-08-21',
      todayUtc: TODAY,
    });
    expect(twoToThree.daysSinceLastCache).toBeGreaterThanOrEqual(2);
    expect(twoToThree.daysSinceLastCache).toBeLessThanOrEqual(3);
    expect(twoToThree.kind).toBe('latest');
  });

  it('routes a materially stale cache to historical gap-fill, not latest-only', () => {
    const plan = planCachedSymbolUpdate({
      lastCachedDate: '2026-03-13',
      todayUtc: TODAY,
    });
    expect(plan.kind).toBe('stale-gap-fill');
    expect(plan.daysSinceLastCache).toBeGreaterThan(RECENT_CACHE_MAX_TRADING_DAYS);
    expect(plan.gapFillEndDate).toBe(TODAY);
    expect(plan.gapFillStartDate).toBe(
      addCalendarDaysUtc('2026-03-13', -STALE_GAP_FILL_OVERLAP_CALENDAR_DAYS)
    );
  });

  it('does not put a stale symbol on the latest/batch path', () => {
    const stale = planCachedSymbolUpdate({
      lastCachedDate: '2026-03-13',
      todayUtc: TODAY,
    });
    const recent = planCachedSymbolUpdate({
      lastCachedDate: '2026-08-24',
      todayUtc: TODAY,
    });
    expect(stale.kind).toBe('stale-gap-fill');
    expect(recent.kind).toBe('latest');
  });

  it('overlaps stale gap-fill start with the old last date by the intended buffer', () => {
    const lastCachedDate = '2026-01-22';
    const plan = planCachedSymbolUpdate({ lastCachedDate, todayUtc: TODAY });
    expect(plan.kind).toBe('stale-gap-fill');
    expect(plan.gapFillStartDate).toBe('2026-01-17');
    expect(plan.gapFillStartDate! < lastCachedDate).toBe(true);
  });
});
