/**
 * Health history sanitization utilities
 * 
 * Removes weekend dates and partial-schema points from health history arrays.
 */

import type { TrendHealthHistoryPoint } from '../src/modules/trend100/types';

/**
 * Check if a date string (YYYY-MM-DD) falls on a weekend (Saturday or Sunday)
 * Uses UTC day of week (0=Sunday, 6=Saturday)
 */
export function isWeekend(dateStr: string): boolean {
  const date = new Date(dateStr + 'T00:00:00Z'); // Parse as UTC
  const dayOfWeek = date.getUTCDay();
  return dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
}

/**
 * Check if a health history point has the full required schema
 * 
 * Requires ALL of:
 * - date (string)
 * - regimeLabel (string)
 * - greenPct, yellowPct, redPct (number, must be finite)
 * - pctAboveUpperBand, medianDistanceAboveUpperBandPct, stretch200MedianPct, heatScore (number, must be finite)
 * - knownCount, unknownCount, totalTickers (number, must be finite)
 * - diffusionPct, diffusionCount, diffusionTotalCompared (number, must be finite)
 */
export function hasFullHealthSchema(point: TrendHealthHistoryPoint): boolean {
  // Check date is a string
  if (typeof point.date !== 'string' || !point.date) {
    return false;
  }

  // Check regimeLabel is a string
  if (typeof point.regimeLabel !== 'string' || !point.regimeLabel) {
    return false;
  }

  // Check percentage fields are numbers (must be finite, not null/undefined)
  if (typeof point.greenPct !== 'number' || !Number.isFinite(point.greenPct)) {
    return false;
  }
  if (typeof point.yellowPct !== 'number' || !Number.isFinite(point.yellowPct)) {
    return false;
  }
  if (typeof point.redPct !== 'number' || !Number.isFinite(point.redPct)) {
    return false;
  }

  // Check overextension metric fields are numbers (must be finite)
  if (typeof point.pctAboveUpperBand !== 'number' || !Number.isFinite(point.pctAboveUpperBand)) {
    return false;
  }
  if (typeof point.medianDistanceAboveUpperBandPct !== 'number' || !Number.isFinite(point.medianDistanceAboveUpperBandPct)) {
    return false;
  }
  if (typeof point.stretch200MedianPct !== 'number' || !Number.isFinite(point.stretch200MedianPct)) {
    return false;
  }
  if (typeof point.heatScore !== 'number' || !Number.isFinite(point.heatScore)) {
    return false;
  }

  // Check count fields are numbers (must be finite)
  if (typeof point.knownCount !== 'number' || !Number.isFinite(point.knownCount)) {
    return false;
  }
  if (typeof point.unknownCount !== 'number' || !Number.isFinite(point.unknownCount)) {
    return false;
  }
  if (typeof point.totalTickers !== 'number' || !Number.isFinite(point.totalTickers)) {
    return false;
  }

  // Check diffusion fields are numbers (must be finite)
  if (typeof point.diffusionPct !== 'number' || !Number.isFinite(point.diffusionPct)) {
    return false;
  }
  if (typeof point.diffusionCount !== 'number' || !Number.isFinite(point.diffusionCount)) {
    return false;
  }
  if (typeof point.diffusionTotalCompared !== 'number' || !Number.isFinite(point.diffusionTotalCompared)) {
    return false;
  }

  return true;
}

/**
 * Sanitize health history array by removing weekend dates and partial-schema points
 * 
 * @param history Raw health history array
 * @returns Sanitized history array (sorted by date, deduped)
 */
export function sanitizeHealthHistory(history: TrendHealthHistoryPoint[]): {
  sanitized: TrendHealthHistoryPoint[];
  removedWeekend: number;
  removedPartial: number;
} {
  let removedWeekend = 0;
  let removedPartial = 0;

  const sanitized = history.filter((point) => {
    // Remove weekend points
    if (isWeekend(point.date)) {
      removedWeekend++;
      return false;
    }

    // Remove partial-schema points
    if (!hasFullHealthSchema(point)) {
      removedPartial++;
      return false;
    }

    return true;
  });

  // Sort by date ascending
  sanitized.sort((a, b) => a.date.localeCompare(b.date));

  // Dedupe by date (keep last occurrence if duplicates)
  const deduped: TrendHealthHistoryPoint[] = [];
  const seenDates = new Set<string>();
  for (let i = sanitized.length - 1; i >= 0; i--) {
    const point = sanitized[i]!;
    if (!seenDates.has(point.date)) {
      seenDates.add(point.date);
      deduped.unshift(point);
    }
  }

  return {
    sanitized: deduped,
    removedWeekend,
    removedPartial,
  };
}
