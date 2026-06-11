import { describe, expect, it } from 'vitest';
import { calcEMA, calcSMA, resampleDailyToWeekly } from './movingAverages';

describe('calcSMA', () => {
  it('returns undefined for the first window-1 values then rolling averages', () => {
    expect(calcSMA([1, 2, 3, 4, 5], 3)).toEqual([undefined, undefined, 2, 3, 4]);
  });

  it('returns an empty array for empty input', () => {
    expect(calcSMA([], 3)).toEqual([]);
  });

  it('returns all undefined when window is zero', () => {
    expect(calcSMA([1, 2, 3], 0)).toEqual([undefined, undefined, undefined]);
  });

  it('returns all undefined when window is negative', () => {
    expect(calcSMA([10, 20], -1)).toEqual([undefined, undefined]);
  });
});

describe('calcEMA', () => {
  it('seeds the first output with the first input value', () => {
    const values = [10, 11, 12];
    const window = 3;
    const multiplier = 2 / (window + 1);
    const ema1 = (11 - 10) * multiplier + 10;
    const ema2 = (12 - ema1) * multiplier + ema1;
    expect(calcEMA(values, window)).toEqual([10, ema1, ema2]);
  });

  it('returns an empty array for empty input', () => {
    expect(calcEMA([], 3)).toEqual([]);
  });

  it('returns all undefined when window is zero', () => {
    expect(calcEMA([1, 2], 0)).toEqual([undefined, undefined]);
  });
});

describe('resampleDailyToWeekly', () => {
  it('returns an empty array for empty input', () => {
    expect(resampleDailyToWeekly([])).toEqual([]);
  });

  it('keeps a single bar as one weekly point', () => {
    expect(resampleDailyToWeekly([{ date: '2024-01-08', close: 100 }])).toEqual([
      { date: '2024-01-08', close: 100 },
    ]);
  });

  it('emits Friday closes for a Mon–Fri week', () => {
    const daily = [
      { date: '2024-01-08', close: 100 },
      { date: '2024-01-09', close: 101 },
      { date: '2024-01-10', close: 102 },
      { date: '2024-01-11', close: 103 },
      { date: '2024-01-12', close: 104 },
    ];
    expect(resampleDailyToWeekly(daily)).toEqual([{ date: '2024-01-12', close: 104 }]);
  });

  it('emits the last bar when the series ends before Friday', () => {
    const daily = [
      { date: '2024-01-08', close: 100 },
      { date: '2024-01-09', close: 101 },
      { date: '2024-01-10', close: 102 },
    ];
    expect(resampleDailyToWeekly(daily)).toEqual([{ date: '2024-01-10', close: 102 }]);
  });

  it('emits one weekly point per Mon–Fri block when the next bar rolls to a new week', () => {
    const week1 = ['2024-01-08', '2024-01-09', '2024-01-10', '2024-01-11', '2024-01-12'].map(
      (date, i) => ({ date, close: 100 + i })
    );
    const week2 = ['2024-01-15', '2024-01-16', '2024-01-17', '2024-01-18', '2024-01-19'].map(
      (date, i) => ({ date, close: 200 + i })
    );
    const daily = [...week1, ...week2];
    expect(resampleDailyToWeekly(daily)).toEqual([
      { date: '2024-01-12', close: 104 },
      { date: '2024-01-19', close: 204 },
    ]);
  });
});
