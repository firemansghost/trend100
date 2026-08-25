import { describe, expect, it } from 'vitest';
import { sanitizeCachedEodBars, selectUsableEodClose } from './eodClose';

describe('selectUsableEodClose', () => {
  it('prefers a positive finite adjusted_close', () => {
    expect(selectUsableEodClose({ adjusted_close: 101, close: 100 })).toBe(101);
  });

  it('falls back to raw close when adjusted_close is 0', () => {
    expect(selectUsableEodClose({ adjusted_close: 0, close: 100 })).toBe(100);
  });

  it('falls back to raw close when adjusted_close is null', () => {
    expect(selectUsableEodClose({ adjusted_close: null, close: 100 })).toBe(100);
  });

  it('falls back to raw close when adjusted_close is NaN/invalid', () => {
    expect(selectUsableEodClose({ adjusted_close: Number.NaN, close: 100 })).toBe(100);
    expect(selectUsableEodClose({ adjusted_close: 'nope', close: 100 })).toBe(100);
  });

  it('is unusable when both adjusted and raw are 0', () => {
    expect(selectUsableEodClose({ adjusted_close: 0, close: 0 })).toBeNull();
  });

  it('is unusable when both are negative', () => {
    expect(selectUsableEodClose({ adjusted_close: -1, close: -1 })).toBeNull();
  });

  it('is unusable for Infinity', () => {
    expect(selectUsableEodClose({ adjusted_close: Number.POSITIVE_INFINITY, close: Number.POSITIVE_INFINITY })).toBeNull();
    expect(selectUsableEodClose({ adjusted_close: Number.NEGATIVE_INFINITY, close: 100 })).toBe(100);
  });
});

describe('sanitizeCachedEodBars', () => {
  it('keeps valid neighbors while dropping zero, negative, and non-finite closes', () => {
    const input = [
      { date: '2026-06-03', close: 10 },
      { date: '2026-06-04', close: 0 },
      { date: '2026-06-05', close: 11 },
      { date: '2026-06-06', close: -2 },
      { date: '2026-06-09', close: Number.NaN },
      { date: '2026-06-10', close: Number.POSITIVE_INFINITY },
      { date: '2026-06-11', close: 12 },
    ];
    const { bars, droppedDates } = sanitizeCachedEodBars(input);
    expect(bars.map((b) => b.date)).toEqual(['2026-06-03', '2026-06-05', '2026-06-11']);
    expect(droppedDates).toEqual(['2026-06-04', '2026-06-06', '2026-06-09', '2026-06-10']);
  });
});
