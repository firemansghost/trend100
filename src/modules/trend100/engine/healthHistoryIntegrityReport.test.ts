import { describe, expect, it } from 'vitest';
import { parseIntegrityReportCli, shouldFailIntegrityReport } from './healthHistoryIntegrityReport';

describe('shouldFailIntegrityReport', () => {
  it('succeeds when suspicious total is 0 even in strict mode', () => {
    expect(shouldFailIntegrityReport(0, true)).toBe(false);
    expect(shouldFailIntegrityReport(0, false)).toBe(false);
  });

  it('fails only in strict mode when suspicious total is > 0', () => {
    expect(shouldFailIntegrityReport(3, true)).toBe(true);
    expect(shouldFailIntegrityReport(3, false)).toBe(false);
  });

  it('parses --fail-on-suspicious', () => {
    expect(parseIntegrityReportCli([])).toEqual({ failOnSuspicious: false });
    expect(parseIntegrityReportCli(['--fail-on-suspicious'])).toEqual({ failOnSuspicious: true });
  });
});
