import { describe, expect, it } from 'vitest';
import { isPolicyImpossibleStaleUnknown } from './healthHistoryStaleUnknown';

describe('isPolicyImpossibleStaleUnknown', () => {
  it('flags UNKNOWN 5/5 MACRO FX as suspicious', () => {
    expect(
      isPolicyImpossibleStaleUnknown({
        regimeLabel: 'UNKNOWN',
        knownCount: 5,
        eligibleCount: 5,
        totalTickers: 5,
      })
    ).toBe(true);
  });

  it('flags UNKNOWN 3/3 commodities as suspicious', () => {
    expect(
      isPolicyImpossibleStaleUnknown({
        regimeLabel: 'UNKNOWN',
        knownCount: 3,
        eligibleCount: 3,
        totalTickers: 3,
      })
    ).toBe(true);
  });

  it('flags UNKNOWN 1/1 dollar as suspicious', () => {
    expect(
      isPolicyImpossibleStaleUnknown({
        regimeLabel: 'UNKNOWN',
        knownCount: 1,
        eligibleCount: 1,
        totalTickers: 1,
      })
    ).toBe(true);
  });

  it('does not flag UNKNOWN known=0/eligible=1 (lookback warmup)', () => {
    expect(
      isPolicyImpossibleStaleUnknown({
        regimeLabel: 'UNKNOWN',
        knownCount: 0,
        eligibleCount: 1,
        totalTickers: 1,
      })
    ).toBe(false);
  });

  it('does not flag UNKNOWN 1/2 crypto at minKnownPct 0.7', () => {
    expect(
      isPolicyImpossibleStaleUnknown({
        regimeLabel: 'UNKNOWN',
        knownCount: 1,
        eligibleCount: 2,
        totalTickers: 2,
      })
    ).toBe(false);
  });

  it('does not flag a valid point', () => {
    expect(
      isPolicyImpossibleStaleUnknown({
        regimeLabel: 'RISK_ON',
        knownCount: 5,
        eligibleCount: 5,
        totalTickers: 5,
      })
    ).toBe(false);
  });
});
