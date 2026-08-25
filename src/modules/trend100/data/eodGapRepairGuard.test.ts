import { describe, expect, it } from 'vitest';
import { evaluateRepairQuotaGuard } from './eodGapRepairGuard';

describe('evaluateRepairQuotaGuard', () => {
  it('allows audit-only (repair false) without confirmation', () => {
    expect(
      evaluateRepairQuotaGuard({
        repair: false,
        confirmRepair: '',
        maxTickerUnitsRaw: '0',
        candidateCount: 147,
      })
    ).toEqual({ ok: true, maxTickerUnits: 0 });
  });

  it('rejects repair true with blank confirmation', () => {
    const r = evaluateRepairQuotaGuard({
      repair: true,
      confirmRepair: '',
      maxTickerUnitsRaw: '147',
      candidateCount: 147,
    });
    expect(r.ok).toBe(false);
  });

  it('rejects repair true with wrong confirmation', () => {
    const r = evaluateRepairQuotaGuard({
      repair: true,
      confirmRepair: 'repair',
      maxTickerUnitsRaw: '147',
      candidateCount: 147,
    });
    expect(r.ok).toBe(false);
  });

  it('rejects when candidate count exceeds max ticker units', () => {
    const r = evaluateRepairQuotaGuard({
      repair: true,
      confirmRepair: 'REPAIR',
      maxTickerUnitsRaw: '146',
      candidateCount: 147,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/exceeds max_ticker_units 146/);
  });

  it('allows repair true with REPAIR and candidateCount <= max', () => {
    expect(
      evaluateRepairQuotaGuard({
        repair: true,
        confirmRepair: 'REPAIR',
        maxTickerUnitsRaw: '147',
        candidateCount: 147,
      })
    ).toEqual({ ok: true, maxTickerUnits: 147 });
  });

  it('rejects an invalid max ticker units value', () => {
    const r = evaluateRepairQuotaGuard({
      repair: true,
      confirmRepair: 'REPAIR',
      maxTickerUnitsRaw: 'nope',
      candidateCount: 1,
    });
    expect(r.ok).toBe(false);
  });
});
