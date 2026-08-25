import { describe, expect, it } from 'vitest';
import { resolveHealthBackfillDates } from './healthBackfillDates';

describe('resolveHealthBackfillDates', () => {
  it('1: preserves EOD dates only', () => {
    expect(
      resolveHealthBackfillDates({
        eodDates: ['2026-02-18', '2026-02-19', '2026-02-20'],
        existingHistoryDates: [],
        startDate: '2026-02-18',
        endDate: '2026-02-20',
      })
    ).toEqual(['2026-02-18', '2026-02-19', '2026-02-20']);
  });

  it('2: includes an existing history date absent from EOD', () => {
    expect(
      resolveHealthBackfillDates({
        eodDates: ['2026-02-18', '2026-02-20'],
        existingHistoryDates: ['2026-02-19'],
        startDate: '2026-02-18',
        endDate: '2026-02-20',
      })
    ).toEqual(['2026-02-18', '2026-02-19', '2026-02-20']);
  });

  it('3: includes a stale existing UNKNOWN date absent from EOD', () => {
    const dates = resolveHealthBackfillDates({
      eodDates: ['2026-08-03', '2026-08-04'],
      existingHistoryDates: ['2026-08-03'],
      startDate: '2026-08-01',
      endDate: '2026-08-04',
    });
    expect(dates).toContain('2026-08-03');
  });

  it('4: dedupes a date present in both EOD and history', () => {
    expect(
      resolveHealthBackfillDates({
        eodDates: ['2026-02-18'],
        existingHistoryDates: ['2026-02-18'],
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      })
    ).toEqual(['2026-02-18']);
  });

  it('5: excludes a weekend existing date', () => {
    expect(
      resolveHealthBackfillDates({
        eodDates: ['2026-02-20'],
        existingHistoryDates: ['2026-02-21', '2026-02-22'],
        startDate: '2026-02-20',
        endDate: '2026-02-22',
      })
    ).toEqual(['2026-02-20']);
  });

  it('6: excludes dates before start and after end', () => {
    expect(
      resolveHealthBackfillDates({
        eodDates: ['2026-02-17', '2026-02-18', '2026-02-21'],
        existingHistoryDates: ['2026-02-16', '2026-02-19'],
        startDate: '2026-02-18',
        endDate: '2026-02-19',
      })
    ).toEqual(['2026-02-18', '2026-02-19']);
  });

  it('7: single-ticker intermittent EOD omissions remain repairable via history', () => {
    const eodDates = ['2026-03-02', '2026-03-04', '2026-03-06'];
    const existingHistoryDates = ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06'];
    expect(
      resolveHealthBackfillDates({
        eodDates,
        existingHistoryDates,
        startDate: '2026-03-02',
        endDate: '2026-03-06',
      })
    ).toEqual(existingHistoryDates);
  });

  it('8: includes existing history rows inside a crypto-like provider gap', () => {
    const eodDates = ['2026-05-22', '2026-06-09'];
    const inGapHistory = ['2026-05-26', '2026-05-27', '2026-06-01', '2026-06-08'];
    const dates = resolveHealthBackfillDates({
      eodDates,
      existingHistoryDates: inGapHistory,
      startDate: '2026-05-22',
      endDate: '2026-06-09',
    });
    for (const d of inGapHistory) {
      expect(dates).toContain(d);
    }
  });

  it('regression: 7 existing UNKNOWN dates omitted from variant EOD are all on the repair calendar', () => {
    const seven = [
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
      '2026-08-06',
      '2026-08-07',
      '2026-08-10',
      '2026-08-11',
    ];
    const eodDates = ['2026-07-31', '2026-08-12'];
    const oldRows = seven.map((date) => ({ date, regimeLabel: 'UNKNOWN' as const }));
    expect(oldRows).toHaveLength(7);
    expect(oldRows.every((r) => r.regimeLabel === 'UNKNOWN')).toBe(true);
    expect(seven.every((d) => !eodDates.includes(d))).toBe(true);
    const repair = resolveHealthBackfillDates({
      eodDates,
      existingHistoryDates: oldRows.map((r) => r.date),
      startDate: '2019-10-01',
      endDate: '2026-08-25',
    });
    for (const d of seven) {
      expect(repair).toContain(d);
    }
  });
});
