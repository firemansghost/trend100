/**
 * Health score computation engine
 * 
 * Computes market health summary from ticker statuses.
 * Pure function - no side effects.
 */

import type { TrendStatus } from '../types';

export interface HealthScoreInput {
  statuses: TrendStatus[];
}

export interface HealthScoreOutput {
  greenPct: number;
  yellowPct: number;
  redPct: number;
  regimeLabel: 'RISK_ON' | 'TRANSITION' | 'RISK_OFF';
}

/**
 * Computes health summary from ticker statuses.
 * 
 * Strategy: UNKNOWN statuses are excluded from denominator.
 * Percentages are rounded to 1 decimal place and sum to ~100.
 * 
 * Regime thresholds:
 * - RISK_ON: greenPct >= 70
 * - TRANSITION: greenPct >= 45 and < 70
 * - RISK_OFF: greenPct < 45
 */
export function computeHealthScore(input: HealthScoreInput): HealthScoreOutput {
  const { statuses } = input;

  // Count statuses (excluding UNKNOWN)
  const knownStatuses = statuses.filter((s) => s !== 'UNKNOWN');
  const total = knownStatuses.length;

  if (total === 0) {
    // Edge case: all UNKNOWN
    return {
      greenPct: 0,
      yellowPct: 0,
      redPct: 0,
      regimeLabel: 'RISK_OFF',
    };
  }

  const greenCount = knownStatuses.filter((s) => s === 'GREEN').length;
  const yellowCount = knownStatuses.filter((s) => s === 'YELLOW').length;
  const redCount = knownStatuses.filter((s) => s === 'RED').length;

  // Calculate percentages (rounded to 1 decimal)
  const greenPct = Math.round((greenCount / total) * 1000) / 10;
  const yellowPct = Math.round((yellowCount / total) * 1000) / 10;
  const redPct = Math.round((redCount / total) * 1000) / 10;

  // Determine regime label
  let regimeLabel: 'RISK_ON' | 'TRANSITION' | 'RISK_OFF';
  if (greenPct >= 70) {
    regimeLabel = 'RISK_ON';
  } else if (greenPct >= 45) {
    regimeLabel = 'TRANSITION';
  } else {
    regimeLabel = 'RISK_OFF';
  }

  return {
    greenPct,
    yellowPct,
    redPct,
    regimeLabel,
  };
}
