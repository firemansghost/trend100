import { describe, expect, it } from 'vitest';
import {
  buildQualifiedShockCalendar,
  logReturnsOnQualifiedDates,
} from './shockCalendar';

const UNIVERSE = [
  'SPY',
  'XLB',
  'XLC',
  'XLE',
  'XLF',
  'XLI',
  'XLK',
  'XLP',
  'XLRE',
  'XLU',
  'XLV',
  'XLY',
];

function setOnDate(symbols: string[]): Set<string> {
  return new Set(symbols);
}

describe('buildQualifiedShockCalendar', () => {
  it('includes a normal date with all 12 symbols', () => {
    const dates = ['2026-08-21'];
    const symbolsWithCloseByDate = new Map([['2026-08-21', setOnDate(UNIVERSE)]]);
    const cal = buildQualifiedShockCalendar({
      unionDates: dates,
      symbolsWithCloseByDate,
      recentUniverse: UNIVERSE,
      minAssetsTarget: 8,
    });
    expect(cal.qualifiedDates).toEqual(['2026-08-21']);
    expect(cal.discarded).toEqual([]);
  });

  it('includes a date with SPY plus exactly 8 recent-universe symbols', () => {
    const eight = UNIVERSE.slice(0, 8); // includes SPY
    const cal = buildQualifiedShockCalendar({
      unionDates: ['2026-08-21'],
      symbolsWithCloseByDate: new Map([['2026-08-21', setOnDate(eight)]]),
      recentUniverse: UNIVERSE,
      minAssetsTarget: 8,
    });
    expect(cal.qualifiedDates).toEqual(['2026-08-21']);
  });

  it('excludes a date with SPY plus fewer than 8 symbols', () => {
    const seven = UNIVERSE.slice(0, 7);
    const cal = buildQualifiedShockCalendar({
      unionDates: ['2026-06-06'],
      symbolsWithCloseByDate: new Map([['2026-06-06', setOnDate(seven)]]),
      recentUniverse: UNIVERSE,
      minAssetsTarget: 8,
    });
    expect(cal.qualifiedDates).toEqual([]);
    expect(cal.discarded[0]).toMatchObject({
      date: '2026-06-06',
      spyHadClose: true,
      symbolCount: 7,
    });
  });

  it('excludes a one-symbol extra (union-only) date even if that symbol is SPY-adjacent', () => {
    const cal = buildQualifiedShockCalendar({
      unionDates: ['2026-08-21', '2026-08-22', '2026-08-24'],
      symbolsWithCloseByDate: new Map([
        ['2026-08-21', setOnDate(UNIVERSE)],
        ['2026-08-22', setOnDate(['XLB'])],
        ['2026-08-24', setOnDate(UNIVERSE)],
      ]),
      recentUniverse: UNIVERSE,
      minAssetsTarget: 8,
    });
    expect(cal.qualifiedDates).toEqual(['2026-08-21', '2026-08-24']);
    expect(cal.discarded.map((d) => d.date)).toEqual(['2026-08-22']);
    expect(cal.discarded[0]?.spyHadClose).toBe(false);
    expect(cal.discarded[0]?.symbolCount).toBe(1);
  });

  it('excludes a date with 8 names but no SPY close', () => {
    const noSpy = UNIVERSE.filter((s) => s !== 'SPY').slice(0, 8);
    const cal = buildQualifiedShockCalendar({
      unionDates: ['2026-08-22'],
      symbolsWithCloseByDate: new Map([['2026-08-22', setOnDate(noSpy)]]),
      recentUniverse: UNIVERSE,
      minAssetsTarget: 8,
    });
    expect(cal.qualifiedDates).toEqual([]);
    expect(cal.discarded[0]?.spyHadClose).toBe(false);
  });
});

describe('logReturnsOnQualifiedDates', () => {
  it('does not break subsequent returns when a discarded extra date sits between qualified dates', () => {
    const qualified = ['2026-08-21', '2026-08-24'];
    const spyCloses = new Map([
      ['2026-08-21', 100],
      ['2026-08-22', 101], // union-only / discarded — must not be the previous date
      ['2026-08-24', 110],
    ]);
    const xlbCloses = new Map([
      ['2026-08-21', 50],
      ['2026-08-24', 55],
    ]);

    const spyRets = logReturnsOnQualifiedDates(qualified, spyCloses);
    const xlbRets = logReturnsOnQualifiedDates(qualified, xlbCloses);

    expect(spyRets[0]).toBeNull();
    expect(spyRets[1]).toBeCloseTo(Math.log(110 / 100));
    expect(xlbRets[1]).toBeCloseTo(Math.log(55 / 50));
    expect(xlbRets[1]).not.toBeNull();
  });
});
