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
