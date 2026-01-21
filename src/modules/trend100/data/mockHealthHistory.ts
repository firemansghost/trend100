/**
 * Mock health history generator
 * 
 * Generates deterministic health history data for chart visualization.
 * Uses a seeded PRNG for stable values across reloads.
 */

import type { TrendHealthHistoryPoint } from '../types';

/**
 * Simple seeded PRNG for deterministic values
 */
class SeededPRNG {
  private seed: number;

  constructor(seed: string) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    this.seed = Math.abs(hash) || 1;
  }

  next(): number {
    // Linear congruential generator
    this.seed = (this.seed * 1664525 + 1013904223) % 2 ** 32;
    return this.seed / 2 ** 32;
  }
}

/**
 * Derives regime label from greenPct using standard thresholds
 */
function getRegimeLabel(greenPct: number): 'RISK_ON' | 'TRANSITION' | 'RISK_OFF' {
  if (greenPct >= 70) {
    return 'RISK_ON';
  } else if (greenPct >= 45) {
    return 'TRANSITION';
  } else {
    return 'RISK_OFF';
  }
}

/**
 * Generates mock health history with smooth, deterministic values
 * 
 * @param options Optional configuration
 * @returns Array of health history points (730 days = ~2 years)
 */
export function buildMockHealthHistory(
  options?: { days?: number; deckId?: string; seed?: string }
): TrendHealthHistoryPoint[] {
  const days = options?.days ?? 730; // Default to 2 years
  // Use provided seed, or seed with deckId, or default
  const seed = options?.seed
    ? options.seed
    : options?.deckId
      ? `TREND100_${options.deckId}`
      : 'TREND100';
  const prng = new SeededPRNG(seed);
  const history: TrendHealthHistoryPoint[] = [];

  // Start with a base greenPct around 50-60%
  let greenPct = 55 + prng.next() * 10; // 55-65%
  let trend = 0; // Current trend direction (-1 to 1)

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];

    // Gentle drift with waves
    const wave = Math.sin((days - i) / 100) * 8; // Long wave
    const shortWave = Math.sin((days - i) / 30) * 3; // Short wave
    const noise = (prng.next() - 0.5) * 2; // Small random noise

    // Update trend occasionally
    if (prng.next() < 0.05) {
      trend = (prng.next() - 0.5) * 0.5; // Small trend changes
    }

    // Apply waves, trend, and noise
    greenPct += trend * 0.1 + wave * 0.01 + shortWave * 0.02 + noise * 0.5;

    // Keep within bounds [5, 95]
    greenPct = Math.max(5, Math.min(95, greenPct));

    // Calculate complementary percentages (rough approximation)
    const remaining = 100 - greenPct;
    const yellowPct = Math.round((remaining * 0.4) * 10) / 10;
    const redPct = Math.round((remaining * 0.6) * 10) / 10;

    history.push({
      date: dateStr,
      greenPct: Math.round(greenPct * 10) / 10,
      yellowPct,
      redPct,
      regimeLabel: getRegimeLabel(greenPct),
    });
  }

  return history;
}
