import { describe, expect, it } from 'vitest';
import { logReturnsOnQualifiedDates } from './shockCalendar';
import {
  duplicateBarDates,
  incompleteQualifiedDates,
  longWindowCloseDateRange,
  missingOrInvalidCloses,
  nullReturnSlotsInLongWindow,
  shouldLogEligibilityRow,
  windowCountsForSymbol,
  type EligibilityRow,
} from './shockEligibilityDiag';

describe('longWindowCloseDateRange', () => {
  it('requires 61 close dates for 60 returns at the latest index', () => {
    const dates = Array.from({ length: 65 }, (_, i) => `d${String(i).padStart(2, '0')}`);
    const idx = 64;
    const range = longWindowCloseDateRange(dates, idx, 60);
    expect(range.returnDates).toHaveLength(60);
    expect(range.closeDates).toHaveLength(61);
    expect(range.priorCloseDate).toBe(dates[idx - 60]);
    expect(range.closeDates[0]).toBe(dates[idx - 60]);
    expect(range.closeDates[60]).toBe(dates[idx]);
  });
});

describe('windowCountsForSymbol', () => {
  it('marks a symbol ineligible when one return in the long window is null', () => {
    const rets: (number | null)[] = Array.from({ length: 65 }, (_, i) => (i === 0 ? null : 0.01));
    rets[40] = null;
    const c = windowCountsForSymbol(rets, 64, 20, 60);
    expect(c.shortCount).toBe(20);
    expect(c.longCount).toBe(59);
    expect(c.eligible).toBe(false);
  });
});

describe('nullReturnSlotsInLongWindow', () => {
  it('attributes a null return to a missing previous qualified close', () => {
    const dates = ['A', 'B', 'C'];
    const closes = new Map([
      ['A', 10],
      ['C', 11],
    ]);
    const rets = logReturnsOnQualifiedDates(dates, closes);
    const slots = nullReturnSlotsInLongWindow(dates, rets, closes, 2, 2);
    expect(rets[2]).toBeNull();
    expect(slots.some((s) => s.currentDate === 'C' && s.previousDate === 'B' && !s.previousClosePresent)).toBe(
      true
    );
  });
});

describe('incompleteQualifiedDates', () => {
  it('lists qualified dates since 2026-01-01 that are missing some of the 12 names', () => {
    const universe = ['SPY', 'XLB', 'XLC'];
    const symbolsWithCloseByDate = new Map<string, Set<string>>([
      ['2025-12-31', new Set(universe)],
      ['2026-06-04', new Set(['SPY', 'XLB'])],
    ]);
    const rows = incompleteQualifiedDates(
      ['2025-12-31', '2026-06-04'],
      symbolsWithCloseByDate,
      universe,
      '2026-01-01'
    );
    expect(rows).toEqual([
      { date: '2026-06-04', nCloses: 2, missingSymbols: ['XLC'] },
    ]);
  });
});

describe('shouldLogEligibilityRow', () => {
  const mk = (over: Partial<EligibilityRow>): EligibilityRow => ({
    date: '2026-08-01',
    idx: 1,
    nCloses: 12,
    shortEligibleCount: 12,
    longEligibleCount: 12,
    validSymbolsCount: 12,
    excluded: [],
    shockRawNull: false,
    ...over,
  });

  it('logs rows with validSymbols < 8, null shockRaw, and the latest 10', () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      mk({ date: `d${i}`, idx: i, validSymbolsCount: 12, shockRawNull: false })
    );
    rows[0] = mk({ date: 'd0', idx: 0, validSymbolsCount: 7, excluded: ['A'] });
    rows[1] = mk({ date: 'd1', idx: 1, validSymbolsCount: 10, shockRawNull: true });
    expect(shouldLogEligibilityRow(rows[0]!, rows, 8)).toBe(true);
    expect(shouldLogEligibilityRow(rows[1]!, rows, 8)).toBe(true);
    expect(shouldLogEligibilityRow(rows[2]!, rows, 8)).toBe(false);
    expect(shouldLogEligibilityRow(rows[14]!, rows, 8)).toBe(true);
  });
});

describe('missingOrInvalidCloses / duplicateBarDates', () => {
  it('flags missing, non-positive, and duplicate dates', () => {
    const dates = ['a', 'b', 'c'];
    const closes = new Map([
      ['a', 1],
      ['c', 0],
    ]);
    expect(missingOrInvalidCloses(dates, closes)).toEqual({
      missing: ['b'],
      invalid: [{ date: 'c', close: 0 }],
    });
    expect(duplicateBarDates(['a', 'b', 'a'])).toEqual(['a']);
  });
});
