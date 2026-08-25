import { describe, expect, it } from 'vitest';
import {
  buildQualifiedShockCalendar,
  isShockCalendarClose,
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

  it('does not count zero-price ETFs as participants; next session returns skip that date', () => {
    const zeroNames = UNIVERSE.filter((s) => s !== 'SPY' && s !== 'XLB');
    const participantsByDate = new Map<string, Set<string>>();
    const closes = (n: number) => {
      const m = new Map<string, number>();
      for (const s of UNIVERSE) m.set(s, n);
      return m;
    };
    const june3 = closes(100);
    const june4 = new Map<string, number>([
      ['SPY', 100],
      ['XLB', 50],
      ...zeroNames.map((s) => [s, 0] as const),
    ]);
    const june5 = closes(110);

    for (const [date, cmap] of [
      ['2026-06-03', june3],
      ['2026-06-04', june4],
      ['2026-06-05', june5],
    ] as const) {
      const present = new Set<string>();
      for (const [sym, px] of cmap) {
        if (isShockCalendarClose(px)) present.add(sym);
      }
      participantsByDate.set(date, present);
    }

    expect(participantsByDate.get('2026-06-04')?.size).toBe(2);
    const cal = buildQualifiedShockCalendar({
      unionDates: ['2026-06-03', '2026-06-04', '2026-06-05'],
      symbolsWithCloseByDate: participantsByDate,
      recentUniverse: UNIVERSE,
      minAssetsTarget: 8,
    });
    expect(cal.qualifiedDates).toEqual(['2026-06-03', '2026-06-05']);
    expect(cal.discarded.map((d) => d.date)).toEqual(['2026-06-04']);

    const spyRets = logReturnsOnQualifiedDates(cal.qualifiedDates, new Map([
      ['2026-06-03', 100],
      ['2026-06-04', 100],
      ['2026-06-05', 110],
    ]));
    expect(spyRets[1]).toBeCloseTo(Math.log(110 / 100));
  });
});

describe('logReturnsOnQualifiedDates', () => {
  it('returns a finite log return for two positive closes', () => {
    const rets = logReturnsOnQualifiedDates(
      ['2026-06-03', '2026-06-05'],
      new Map([
        ['2026-06-03', 100],
        ['2026-06-05', 101],
      ])
    );
    expect(rets[1]).toBeCloseTo(Math.log(101 / 100));
    expect(Number.isFinite(rets[1]!)).toBe(true);
  });

  it('returns null when current close is 0', () => {
    const rets = logReturnsOnQualifiedDates(
      ['2026-06-03', '2026-06-04'],
      new Map([
        ['2026-06-03', 100],
        ['2026-06-04', 0],
      ])
    );
    expect(rets[1]).toBeNull();
  });

  it('returns null when previous close is 0', () => {
    const rets = logReturnsOnQualifiedDates(
      ['2026-06-04', '2026-06-05'],
      new Map([
        ['2026-06-04', 0],
        ['2026-06-05', 101],
      ])
    );
    expect(rets[1]).toBeNull();
  });

  it('returns null when a close is Infinity', () => {
    const rets = logReturnsOnQualifiedDates(
      ['2026-06-03', '2026-06-05'],
      new Map([
        ['2026-06-03', 100],
        ['2026-06-05', Number.POSITIVE_INFINITY],
      ])
    );
    expect(rets[1]).toBeNull();
  });

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
