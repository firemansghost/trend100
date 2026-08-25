import { describe, expect, it } from 'vitest';
import {
  auditSymbolGaps,
  existingDatesPreserved,
  fetchedCoversMissingSessions,
  fetchWindowForMissingRanges,
  isLongGapCandidate,
  selectLongGapCandidates,
  usableBarDates,
} from './eodGapAudit';

const WEEK = ['2026-02-23', '2026-02-24', '2026-02-25', '2026-02-26', '2026-02-27', '2026-03-02'];

describe('usableBarDates', () => {
  it('drops invalid zero closes', () => {
    expect(
      usableBarDates([
        { date: '2026-02-23', close: 10 },
        { date: '2026-02-24', close: 0 },
        { date: '2026-02-25', close: 11 },
      ])
    ).toEqual(['2026-02-23', '2026-02-25']);
  });
});

describe('auditSymbolGaps', () => {
  it('reports complete coverage when all reference dates are present', () => {
    const r = auditSymbolGaps({
      symbol: 'AAA',
      referenceDates: WEEK,
      presentDates: WEEK,
      firstCachedDate: '2020-01-02',
      lastCachedDate: '2026-03-02',
      windowStart: '2026-02-23',
      windowEnd: '2026-03-02',
    });
    expect(r.missingSessions).toBe(0);
    expect(r.longestMissingRun).toBe(0);
    expect(isLongGapCandidate(r)).toBe(false);
  });

  it('treats one isolated missing session as not a long-gap candidate', () => {
    const present = WEEK.filter((d) => d !== '2026-02-25');
    const r = auditSymbolGaps({
      symbol: 'BBB',
      referenceDates: WEEK,
      presentDates: present,
      firstCachedDate: '2020-01-02',
      lastCachedDate: '2026-03-02',
      windowStart: '2026-02-23',
      windowEnd: '2026-03-02',
    });
    expect(r.missingSessions).toBe(1);
    expect(r.longestMissingRun).toBe(1);
    expect(r.missingRanges).toEqual([{ start: '2026-02-25', end: '2026-02-25', sessions: 1 }]);
    expect(isLongGapCandidate(r)).toBe(false);
  });

  it('flags five consecutive missing sessions as a candidate', () => {
    const present = ['2026-03-02'];
    const r = auditSymbolGaps({
      symbol: 'CCC',
      referenceDates: WEEK,
      presentDates: present,
      firstCachedDate: '2020-01-02',
      lastCachedDate: '2026-03-02',
      windowStart: '2026-02-23',
      windowEnd: '2026-03-02',
    });
    expect(r.missingSessions).toBe(5);
    expect(r.longestMissingRun).toBe(5);
    expect(isLongGapCandidate(r)).toBe(true);
    expect(selectLongGapCandidates([r])).toEqual(['CCC']);
  });

  it('does not count weekend calendar days because they are not reference sessions', () => {
    const r = auditSymbolGaps({
      symbol: 'DDD',
      referenceDates: WEEK,
      presentDates: WEEK,
      firstCachedDate: '2020-01-02',
      lastCachedDate: '2026-03-02',
      windowStart: '2026-02-23',
      windowEnd: '2026-03-02',
    });
    expect(r.missingSessions).toBe(0);
  });

  it('counts an invalid zero close as missing when that date is absent from presentDates', () => {
    const r = auditSymbolGaps({
      symbol: 'EEE',
      referenceDates: WEEK,
      presentDates: usableBarDates([
        { date: '2026-02-23', close: 1 },
        { date: '2026-02-24', close: 0 },
        { date: '2026-02-25', close: 1 },
        { date: '2026-02-26', close: 1 },
        { date: '2026-02-27', close: 1 },
        { date: '2026-03-02', close: 1 },
      ]),
      firstCachedDate: '2020-01-02',
      lastCachedDate: '2026-03-02',
      windowStart: '2026-02-23',
      windowEnd: '2026-03-02',
    });
    expect(r.missingDates).toEqual(['2026-02-24']);
  });

  it('reports limited-start instead of expecting pre-inception sessions', () => {
    const r = auditSymbolGaps({
      symbol: 'FFF',
      referenceDates: WEEK,
      presentDates: ['2026-02-26', '2026-02-27', '2026-03-02'],
      firstCachedDate: '2026-02-26',
      lastCachedDate: '2026-03-02',
      windowStart: '2026-02-23',
      windowEnd: '2026-03-02',
    });
    expect(r.limitedStart).toBe(true);
    expect(r.expectedSessions).toBe(3);
    expect(r.missingSessions).toBe(0);
  });

  it('records multiple missing ranges and the longest run', () => {
    const present = ['2026-02-23', '2026-02-26', '2026-03-02'];
    const r = auditSymbolGaps({
      symbol: 'GGG',
      referenceDates: WEEK,
      presentDates: present,
      firstCachedDate: '2020-01-02',
      lastCachedDate: '2026-03-02',
      windowStart: '2026-02-23',
      windowEnd: '2026-03-02',
    });
    expect(r.missingRanges).toEqual([
      { start: '2026-02-24', end: '2026-02-25', sessions: 2 },
      { start: '2026-02-27', end: '2026-02-27', sessions: 1 },
    ]);
    expect(r.longestMissingRun).toBe(2);
  });
});

describe('repair window helpers', () => {
  it('expands fetch window around missing ranges', () => {
    expect(
      fetchWindowForMissingRanges([{ start: '2026-03-01', end: '2026-03-10', sessions: 8 }], 7)
    ).toEqual({ start: '2026-02-22', end: '2026-03-17' });
  });

  it('requires fetched dates to cover every missing session', () => {
    expect(fetchedCoversMissingSessions(['2026-02-24', '2026-02-25'], ['2026-02-24', '2026-02-25'])).toBe(
      true
    );
    expect(fetchedCoversMissingSessions(['2026-02-24'], ['2026-02-24', '2026-02-25'])).toBe(false);
  });

  it('requires existing dates to survive a merge', () => {
    expect(existingDatesPreserved(['a', 'b'], ['a', 'b', 'c'])).toBe(true);
    expect(existingDatesPreserved(['a', 'b'], ['a', 'c'])).toBe(false);
  });
});
