import { describe, expect, it } from 'vitest';
import type { TrendStatus } from '../types';
import { computeHealthScore } from './healthScore';

function statuses(...items: TrendStatus[]): TrendStatus[] {
  return items;
}

describe('computeHealthScore', () => {
  it('returns RISK_OFF with zero percentages when all statuses are UNKNOWN', () => {
    expect(computeHealthScore({ statuses: statuses('UNKNOWN', 'UNKNOWN') })).toEqual({
      greenPct: 0,
      yellowPct: 0,
      redPct: 0,
      regimeLabel: 'RISK_OFF',
    });
  });

  it('excludes UNKNOWN from the denominator', () => {
    expect(computeHealthScore({ statuses: statuses('GREEN', 'UNKNOWN') })).toEqual({
      greenPct: 100,
      yellowPct: 0,
      redPct: 0,
      regimeLabel: 'RISK_ON',
    });
  });

  it('labels RISK_ON at greenPct >= 70', () => {
    const sevenGreen = statuses(
      'GREEN',
      'GREEN',
      'GREEN',
      'GREEN',
      'GREEN',
      'GREEN',
      'GREEN',
      'RED',
      'RED',
      'RED'
    );
    expect(computeHealthScore({ statuses: sevenGreen })).toMatchObject({
      greenPct: 70,
      regimeLabel: 'RISK_ON',
    });
  });

  it('labels TRANSITION at greenPct >= 45 and < 70', () => {
    const fiveGreen = statuses(
      'GREEN',
      'GREEN',
      'GREEN',
      'GREEN',
      'GREEN',
      'RED',
      'RED',
      'RED',
      'RED',
      'RED'
    );
    expect(computeHealthScore({ statuses: fiveGreen })).toMatchObject({
      greenPct: 50,
      regimeLabel: 'TRANSITION',
    });
  });

  it('labels RISK_OFF when greenPct < 45', () => {
    const fourGreen = statuses(
      'GREEN',
      'GREEN',
      'GREEN',
      'GREEN',
      'RED',
      'RED',
      'RED',
      'RED',
      'RED',
      'RED'
    );
    expect(computeHealthScore({ statuses: fourGreen })).toMatchObject({
      greenPct: 40,
      regimeLabel: 'RISK_OFF',
    });
  });

  it('rounds percentages to one decimal place', () => {
    const result = computeHealthScore({
      statuses: statuses('GREEN', 'YELLOW', 'RED'),
    });
    expect(result.greenPct).toBe(33.3);
    expect(result.yellowPct).toBe(33.3);
    expect(result.redPct).toBe(33.3);
  });
});
