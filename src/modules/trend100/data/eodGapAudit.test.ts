import { describe, expect, it } from 'vitest';
import {
  addUtcCalendarDays,
  auditSymbolGaps,
  existingDatesPreserved,
  evaluateStagedPostMerge,
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

  it('requires existing dates to survive a merge', () => {
    expect(existingDatesPreserved(['a', 'b'], ['a', 'b', 'c'])).toBe(true);
    expect(existingDatesPreserved(['a', 'b'], ['a', 'c'])).toBe(false);
  });
});

const REF10 = [
  '2026-02-18',
  '2026-02-19',
  '2026-02-20',
  '2026-02-21',
  '2026-02-24',
  '2026-02-25',
  '2026-02-26',
  '2026-02-27',
  '2026-02-28',
  '2026-03-03',
];

function preOnlyStart(symbol = 'AAA') {
  const existing = [REF10[0]!];
  return {
    existing,
    pre: auditSymbolGaps({
      symbol,
      referenceDates: REF10,
      presentDates: existing,
      firstCachedDate: existing[0]!,
      lastCachedDate: existing[0]!,
      windowStart: REF10[0]!,
      windowEnd: REF10[9]!,
    }),
  };
}

describe('evaluateStagedPostMerge', () => {
  it('accepts a fill that leaves one isolated missing session', () => {
    const { existing, pre } = preOnlyStart();
    expect(pre.longestMissingRun).toBeGreaterThanOrEqual(5);
    const isolated = REF10[4]!;
    const fetched = REF10.filter((d) => d !== isolated).map((date) => ({
      date,
      close: 10,
    }));
    const v = evaluateStagedPostMerge({
      symbol: 'AAA',
      referenceDates: REF10,
      windowStart: REF10[0]!,
      windowEnd: REF10[9]!,
      existingDates: existing,
      fetchedBars: fetched,
      truncated: false,
      firstCachedDate: existing[0]!,
      lastCachedDate: existing[0]!,
      pre,
    });
    expect(v.resolvable).toBe(true);
    expect(v.classification).toBe('RESOLVED');
    expect(v.post.longestMissingRun).toBe(1);
  });

  it('accepts remaining four consecutive missing sessions', () => {
    const { existing, pre } = preOnlyStart();
    const fetched = REF10.slice(0, 6).map((date) => ({ date, close: 10 }));
    const v = evaluateStagedPostMerge({
      symbol: 'AAA',
      referenceDates: REF10,
      windowStart: REF10[0]!,
      windowEnd: REF10[9]!,
      existingDates: existing,
      fetchedBars: fetched,
      truncated: false,
      firstCachedDate: existing[0]!,
      lastCachedDate: existing[0]!,
      pre,
    });
    expect(v.post.longestMissingRun).toBe(4);
    expect(v.resolvable).toBe(true);
  });

  it('classifies remaining five consecutive missing sessions as PROVIDER_LIMITED', () => {
    const { existing, pre } = preOnlyStart();
    const fetched = REF10.slice(0, 5).map((date) => ({ date, close: 10 }));
    const v = evaluateStagedPostMerge({
      symbol: 'AAA',
      referenceDates: REF10,
      windowStart: REF10[0]!,
      windowEnd: REF10[9]!,
      existingDates: existing,
      fetchedBars: fetched,
      truncated: false,
      firstCachedDate: existing[0]!,
      lastCachedDate: existing[0]!,
      pre,
    });
    expect(v.post.longestMissingRun).toBe(5);
    expect(v.classification).toBe('PROVIDER_LIMITED');
    expect(v.mergeable).toBe(true);
    expect(v.resolvable).toBe(false);
  });

  it('rejects a fetch that does not improve the original long gap', () => {
    const { existing, pre } = preOnlyStart();
    const v = evaluateStagedPostMerge({
      symbol: 'AAA',
      referenceDates: REF10,
      windowStart: REF10[0]!,
      windowEnd: REF10[9]!,
      existingDates: existing,
      fetchedBars: [{ date: existing[0]!, close: 10 }],
      truncated: false,
      firstCachedDate: existing[0]!,
      lastCachedDate: existing[0]!,
      pre,
    });
    expect(v.resolvable).toBe(false);
  });

  it('does not count invalid zero closes as coverage', () => {
    const { existing, pre } = preOnlyStart();
    const fetched = REF10.map((date, i) => ({
      date,
      close: i === 4 ? 0 : 10,
    }));
    const v = evaluateStagedPostMerge({
      symbol: 'AAA',
      referenceDates: REF10,
      windowStart: REF10[0]!,
      windowEnd: REF10[9]!,
      existingDates: existing,
      fetchedBars: fetched,
      truncated: false,
      firstCachedDate: existing[0]!,
      lastCachedDate: existing[0]!,
      pre,
    });
    expect(v.post.missingDates).toContain(REF10[4]);
    expect(v.resolvable).toBe(true);
    expect(v.post.longestMissingRun).toBe(1);
  });

  it('preserves existing valid dates in the simulated merge', () => {
    const existing = [REF10[0]!, REF10[9]!];
    const pre = auditSymbolGaps({
      symbol: 'AAA',
      referenceDates: REF10,
      presentDates: existing,
      firstCachedDate: existing[0]!,
      lastCachedDate: existing[1]!,
      windowStart: REF10[0]!,
      windowEnd: REF10[9]!,
    });
    const fetched = REF10.slice(1, 9).map((date) => ({ date, close: 10 }));
    const v = evaluateStagedPostMerge({
      symbol: 'AAA',
      referenceDates: REF10,
      windowStart: REF10[0]!,
      windowEnd: REF10[9]!,
      existingDates: existing,
      fetchedBars: fetched,
      truncated: false,
      firstCachedDate: existing[0]!,
      lastCachedDate: existing[1]!,
      pre,
    });
    expect(v.resolvable).toBe(true);
    expect(v.post.presentSessions).toBe(REF10.length);
  });

  it('accepts a remaining isolated June-4-like miss after merge', () => {
    const { existing, pre } = preOnlyStart('GLD');
    const june4Like = REF10[4]!;
    const fetched = REF10.filter((d) => d !== june4Like).map((date) => ({
      date,
      close: 180,
    }));
    const v = evaluateStagedPostMerge({
      symbol: 'GLD',
      referenceDates: REF10,
      windowStart: REF10[0]!,
      windowEnd: REF10[9]!,
      existingDates: existing,
      fetchedBars: fetched,
      truncated: false,
      firstCachedDate: existing[0]!,
      lastCachedDate: existing[0]!,
      pre,
    });
    expect(v.resolvable).toBe(true);
    expect(v.classification).toBe('RESOLVED');
    expect(v.post.missingDates).toEqual([june4Like]);
  });
});

function makeSessions(count: number, start = '2026-02-18'): string[] {
  const dates: string[] = [];
  let d = start;
  for (let i = 0; i < count; i++) {
    dates.push(d);
    d = addUtcCalendarDays(d, 1);
  }
  return dates;
}

describe('evaluateStagedPostMerge 105-session hole', () => {
  const REF = makeSessions(106);
  const existing = [REF[0]!];
  const pre = auditSymbolGaps({
    symbol: 'HOLE',
    referenceDates: REF,
    presentDates: existing,
    firstCachedDate: existing[0]!,
    lastCachedDate: existing[0]!,
    windowStart: REF[0]!,
    windowEnd: REF[REF.length - 1]!,
  });

  it('A: fill leaving longest 1 is RESOLVED', () => {
    expect(pre.longestMissingRun).toBe(105);
    const isolated = REF[40]!;
    const fetched = REF.filter((d) => d !== isolated).map((date) => ({ date, close: 10 }));
    const v = evaluateStagedPostMerge({
      symbol: 'HOLE',
      referenceDates: REF,
      windowStart: REF[0]!,
      windowEnd: REF[REF.length - 1]!,
      existingDates: existing,
      fetchedBars: fetched,
      truncated: false,
      firstCachedDate: existing[0]!,
      lastCachedDate: existing[0]!,
      pre,
    });
    expect(v.post.longestMissingRun).toBe(1);
    expect(v.classification).toBe('RESOLVED');
    expect(v.mergeable).toBe(true);
  });

  it('B: fill leaving longest 10 is PROVIDER_LIMITED', () => {
    const residual = new Set(REF.slice(40, 50));
    const fetched = REF.filter((d) => !residual.has(d)).map((date) => ({ date, close: 10 }));
    const v = evaluateStagedPostMerge({
      symbol: 'HOLE',
      referenceDates: REF,
      windowStart: REF[0]!,
      windowEnd: REF[REF.length - 1]!,
      existingDates: existing,
      fetchedBars: fetched,
      truncated: false,
      firstCachedDate: existing[0]!,
      lastCachedDate: existing[0]!,
      pre,
    });
    expect(v.post.longestMissingRun).toBe(10);
    expect(v.post.missingSessions).toBeLessThan(pre.missingSessions);
    expect(v.classification).toBe('PROVIDER_LIMITED');
    expect(v.mergeable).toBe(true);
  });

  it('D: partial fetch preserves neighboring existing dates', () => {
    const neighbors = [REF[0]!, REF[REF.length - 1]!];
    const preN = auditSymbolGaps({
      symbol: 'HOLE',
      referenceDates: REF,
      presentDates: neighbors,
      firstCachedDate: neighbors[0]!,
      lastCachedDate: neighbors[1]!,
      windowStart: REF[0]!,
      windowEnd: REF[REF.length - 1]!,
    });
    const residual = new Set(REF.slice(40, 50));
    const fetched = REF.filter((d) => !residual.has(d) && d !== neighbors[1]).map((date) => ({
      date,
      close: 10,
    }));
    const v = evaluateStagedPostMerge({
      symbol: 'HOLE',
      referenceDates: REF,
      windowStart: REF[0]!,
      windowEnd: REF[REF.length - 1]!,
      existingDates: neighbors,
      fetchedBars: fetched,
      truncated: false,
      firstCachedDate: neighbors[0]!,
      lastCachedDate: neighbors[1]!,
      pre: preN,
    });
    expect(v.mergeable).toBe(true);
    expect(v.post.presentSessions).toBe(REF.length - 10);
  });

  it('C: unchanged 105-session hole is UNRESOLVED', () => {
    const v = evaluateStagedPostMerge({
      symbol: 'HOLE',
      referenceDates: REF,
      windowStart: REF[0]!,
      windowEnd: REF[REF.length - 1]!,
      existingDates: existing,
      fetchedBars: [{ date: existing[0]!, close: 10 }],
      truncated: false,
      firstCachedDate: existing[0]!,
      lastCachedDate: existing[0]!,
      pre,
    });
    expect(v.post.longestMissingRun).toBe(105);
    expect(v.classification).toBe('UNRESOLVED');
    expect(v.mergeable).toBe(false);
  });
});
