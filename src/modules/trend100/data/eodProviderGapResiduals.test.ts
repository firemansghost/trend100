import { describe, expect, it } from 'vitest';
import { auditSymbolGaps, type SymbolGapReport } from './eodGapAudit';
import {
  classifyReportAgainstResiduals,
  parseProviderGapResiduals,
  parseProviderGapResidualsJson,
  pruneFilledResiduals,
  residualExceptionCoversGap,
  residualFromLiveStaged,
  type ProviderGapResidual,
} from './eodProviderGapResiduals';

const REF = [
  '2026-05-20',
  '2026-05-21',
  '2026-05-22',
  '2026-05-26',
  '2026-05-27',
  '2026-05-28',
  '2026-05-29',
  '2026-06-01',
  '2026-06-02',
  '2026-06-03',
  '2026-06-04',
  '2026-06-05',
  '2026-06-08',
  '2026-06-09',
];

function reportWithHole(symbol: string, missing: string[]): SymbolGapReport {
  const present = REF.filter((d) => !missing.includes(d));
  return auditSymbolGaps({
    symbol,
    referenceDates: REF,
    presentDates: present,
    firstCachedDate: REF[0]!,
    lastCachedDate: REF[REF.length - 1]!,
    windowStart: REF[0]!,
    windowEnd: REF[REF.length - 1]!,
  });
}

const residual10: ProviderGapResidual = {
  symbol: 'AAA',
  ranges: [{ start: '2026-05-26', end: '2026-06-08', sessions: 10 }],
  preLongestMissingRun: 105,
  postLongestMissingRun: 10,
  preMissingSessions: 105,
  postMissingSessions: 10,
  observedByLiveRepair: true,
};

const file = {
  version: 1 as const,
  generatedAt: '2026-08-25T00:00:00.000Z',
  provider: 'marketstack' as const,
  auditStart: '2026-02-18',
  auditEnd: '2026-08-24',
  reference: 'SPY',
  longGapMinSessions: 5,
  residuals: [residual10],
};

const hole10 = [
  '2026-05-26',
  '2026-05-27',
  '2026-05-28',
  '2026-05-29',
  '2026-06-01',
  '2026-06-02',
  '2026-06-03',
  '2026-06-04',
  '2026-06-05',
  '2026-06-08',
];

describe('provider residual metadata', () => {
  it('F: exact residual matches as provider limited', () => {
    const report = reportWithHole('AAA', hole10);
    expect(report.longestMissingRun).toBe(10);
    expect(
      classifyReportAgainstResiduals({
        report,
        residuals: file,
        auditStart: '2026-02-18',
        auditEnd: '2026-08-24',
      })
    ).toBe('provider_limited');
  });

  it('G: narrower residual than recorded remains provider limited', () => {
    const report = reportWithHole('AAA', hole10.slice(1, 9));
    expect(report.longestMissingRun).toBeGreaterThanOrEqual(5);
    expect(report.missingSessions).toBeLessThan(10);
    expect(
      residualExceptionCoversGap({
        report,
        recorded: residual10,
        auditStart: '2026-02-18',
        auditEnd: '2026-08-24',
        fileAuditStart: '2026-02-18',
        fileAuditEnd: '2026-08-24',
      })
    ).toBe(true);
  });

  it('H: residual that grows beyond recorded range is unverified', () => {
    const grown = [...hole10, '2026-06-09'];
    const report = reportWithHole('AAA', grown);
    expect(
      classifyReportAgainstResiduals({
        report,
        residuals: file,
        auditStart: '2026-02-18',
        auditEnd: '2026-08-24',
      })
    ).toBe('unverified');
  });

  it('I: different symbol is unverified', () => {
    const report = reportWithHole('BBB', hole10);
    expect(
      classifyReportAgainstResiduals({
        report,
        residuals: file,
        auditStart: '2026-02-18',
        auditEnd: '2026-08-24',
      })
    ).toBe('unverified');
  });

  it('J: metadata absent is unverified', () => {
    const report = reportWithHole('AAA', hole10);
    expect(
      classifyReportAgainstResiduals({
        report,
        residuals: null,
        auditStart: '2026-02-18',
        auditEnd: '2026-08-24',
      })
    ).toBe('unverified');
  });

  it('K: filled gap no longer needs the exception', () => {
    const report = reportWithHole('AAA', ['2026-06-04']);
    expect(report.longestMissingRun).toBe(1);
    expect(
      classifyReportAgainstResiduals({
        report,
        residuals: file,
        auditStart: '2026-02-18',
        auditEnd: '2026-08-24',
      })
    ).toBe('none');
    expect(pruneFilledResiduals(file.residuals, [report])).toEqual([]);
  });

  it('L: malformed metadata is ignored (unverified)', () => {
    expect(parseProviderGapResidualsJson('{not json')).toBeNull();
    expect(parseProviderGapResiduals({ version: 2, residuals: [] })).toBeNull();
    const report = reportWithHole('AAA', hole10);
    expect(
      classifyReportAgainstResiduals({
        report,
        residuals: parseProviderGapResidualsJson('{not json'),
        auditStart: '2026-02-18',
        auditEnd: '2026-08-24',
      })
    ).toBe('unverified');
  });

  it('builds a live residual from staged post-merge reports', () => {
    const pre = reportWithHole('AAA', REF.slice(1));
    const post = reportWithHole('AAA', hole10);
    const live = residualFromLiveStaged({ symbol: 'AAA', pre, post });
    expect(live.observedByLiveRepair).toBe(true);
    expect(live.postLongestMissingRun).toBe(10);
    expect(live.ranges[0]?.start).toBe('2026-05-26');
  });
});

function reportOnCalendar(args: {
  symbol: string;
  referenceDates: string[];
  missing: string[];
  windowStart: string;
  windowEnd: string;
}): SymbolGapReport {
  const present = args.referenceDates.filter((d) => !args.missing.includes(d));
  return auditSymbolGaps({
    symbol: args.symbol,
    referenceDates: args.referenceDates,
    presentDates: present,
    firstCachedDate: args.referenceDates[0]!,
    lastCachedDate: args.referenceDates[args.referenceDates.length - 1]!,
    windowStart: args.windowStart,
    windowEnd: args.windowEnd,
  });
}

describe('provider residual durability vs advancing audit window', () => {
  it('1: later SPY auditEnd does not expire an unchanged historical residual', () => {
    const report = reportWithHole('AAA', hole10);
    expect(
      classifyReportAgainstResiduals({
        report,
        residuals: file,
        auditStart: '2026-02-18',
        auditEnd: '2026-08-25',
      })
    ).toBe('provider_limited');
  });

  it('2: later isolated <5-session miss does not invalidate provider evidence', () => {
    const calendar = [...REF, '2026-09-02', '2026-09-03', '2026-09-04'];
    const report = reportOnCalendar({
      symbol: 'AAA',
      referenceDates: calendar,
      missing: [...hole10, '2026-09-03'],
      windowStart: calendar[0]!,
      windowEnd: calendar[calendar.length - 1]!,
    });
    expect(report.longestMissingRun).toBe(10);
    expect(report.missingDates).toContain('2026-09-03');
    expect(
      classifyReportAgainstResiduals({
        report,
        residuals: file,
        auditStart: '2026-02-18',
        auditEnd: '2026-09-04',
      })
    ).toBe('provider_limited');
  });

  it('3: a new later >=5-session gap is unverified', () => {
    const later = ['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-14'];
    const calendar = [...REF, ...later];
    const report = reportOnCalendar({
      symbol: 'AAA',
      referenceDates: calendar,
      missing: [...hole10, ...later],
      windowStart: calendar[0]!,
      windowEnd: calendar[calendar.length - 1]!,
    });
    expect(report.longestMissingRun).toBe(10);
    expect(report.missingRanges.some((r) => r.start === '2026-09-08' && r.sessions >= 5)).toBe(true);
    expect(
      classifyReportAgainstResiduals({
        report,
        residuals: file,
        auditStart: '2026-02-18',
        auditEnd: '2026-09-14',
      })
    ).toBe('unverified');
  });

  it('4: earlier auditStart with no extra long gap stays provider limited', () => {
    const earlier = ['2026-01-05', '2026-01-06', '2026-01-07'];
    const calendar = [...earlier, ...REF];
    const report = reportOnCalendar({
      symbol: 'AAA',
      referenceDates: calendar,
      missing: hole10,
      windowStart: calendar[0]!,
      windowEnd: calendar[calendar.length - 1]!,
    });
    expect(
      classifyReportAgainstResiduals({
        report,
        residuals: file,
        auditStart: '2026-01-01',
        auditEnd: '2026-08-24',
      })
    ).toBe('provider_limited');
  });

  it('5: earlier audit window exposing a new >=5-session gap is unverified', () => {
    const earlierLong = [
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
      '2026-01-08',
      '2026-01-09',
    ];
    const calendar = [...earlierLong, ...REF];
    const report = reportOnCalendar({
      symbol: 'AAA',
      referenceDates: calendar,
      missing: [...earlierLong, ...hole10],
      windowStart: calendar[0]!,
      windowEnd: calendar[calendar.length - 1]!,
    });
    expect(report.missingRanges.some((r) => r.start === '2026-01-05' && r.sessions >= 5)).toBe(true);
    expect(
      classifyReportAgainstResiduals({
        report,
        residuals: file,
        auditStart: '2026-01-01',
        auditEnd: '2026-08-24',
      })
    ).toBe('unverified');
  });

  it('6: a current long gap must sit inside one recorded range, not the envelope between two', () => {
    const twoRanges: ProviderGapResidual = {
      ...residual10,
      ranges: [
        { start: '2026-05-26', end: '2026-06-01', sessions: 5 },
        { start: '2026-06-03', end: '2026-06-08', sessions: 4 },
      ],
      postLongestMissingRun: 5,
      postMissingSessions: 9,
    };
    const twoFile = { ...file, residuals: [twoRanges] };
    const contained = reportWithHole('AAA', [
      '2026-05-26',
      '2026-05-27',
      '2026-05-28',
      '2026-05-29',
      '2026-06-01',
    ]);
    expect(contained.longestMissingRun).toBe(5);
    expect(
      classifyReportAgainstResiduals({
        report: contained,
        residuals: twoFile,
        auditStart: '2026-02-18',
        auditEnd: '2026-08-25',
      })
    ).toBe('provider_limited');

    const spanning = reportWithHole('AAA', [
      '2026-05-29',
      '2026-06-01',
      '2026-06-02',
      '2026-06-03',
      '2026-06-04',
    ]);
    expect(spanning.longestMissingRun).toBeGreaterThanOrEqual(5);
    expect(
      classifyReportAgainstResiduals({
        report: spanning,
        residuals: twoFile,
        auditStart: '2026-02-18',
        auditEnd: '2026-08-25',
      })
    ).toBe('unverified');
  });
});
