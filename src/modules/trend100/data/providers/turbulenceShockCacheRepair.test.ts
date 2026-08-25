import { describe, expect, it } from 'vitest';
import {
  TURBULENCE_SHOCK_CACHE_REPAIR_SYMBOL_COUNT,
  canCommitTurbulenceShockCacheRepair,
  describeFetchedEodCoverage,
} from './turbulenceShockCacheRepair';

const twelve = Array.from({ length: 12 }, (_, i) => `S${i}`);

describe('canCommitTurbulenceShockCacheRepair', () => {
  it('does not allow commit when one staged symbol failed', () => {
    const staged = twelve.slice(0, 11);
    const allowed = canCommitTurbulenceShockCacheRepair({
      expectedSymbolCount: TURBULENCE_SHOCK_CACHE_REPAIR_SYMBOL_COUNT,
      stagedSymbols: staged,
      failures: ['S11'],
    });
    expect(allowed).toBe(false);
  });

  it('allows commit only when all 12 staged successfully with no failures', () => {
    const allowed = canCommitTurbulenceShockCacheRepair({
      expectedSymbolCount: TURBULENCE_SHOCK_CACHE_REPAIR_SYMBOL_COUNT,
      stagedSymbols: twelve,
      failures: [],
    });
    expect(allowed).toBe(true);
  });

  it('does not allow commit when a failure is recorded even if 12 bars were staged', () => {
    const allowed = canCommitTurbulenceShockCacheRepair({
      expectedSymbolCount: TURBULENCE_SHOCK_CACHE_REPAIR_SYMBOL_COUNT,
      stagedSymbols: twelve,
      failures: ['S0'],
    });
    expect(allowed).toBe(false);
  });
});

describe('describeFetchedEodCoverage', () => {
  it('counts dates present on every symbol and missing cells in the last 60 SPY dates', () => {
    const spy = Array.from({ length: 60 }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`);
    spy[22] = '2026-01-23';
    const others = spy.filter((d) => d !== '2026-01-23');
    const staged = [
      { symbol: 'SPY', dates: spy },
      ...Array.from({ length: 11 }, (_, i) => ({ symbol: `X${i}`, dates: others })),
    ];
    const report = describeFetchedEodCoverage(staged);
    expect(report.datesInAllSymbols).toBe(59);
    expect(report.spyWindowSessions).toBe(60);
    expect(report.spyWindowMissingCells).toBe(11);
    expect(report.latestDateInAllSymbols).toBe(spy[spy.length - 1]);
  });
});
