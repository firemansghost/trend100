/**
 * Get health history API
 * 
 * Returns health history data for chart visualization.
 * Tries to load from public/health-history.json, falls back to mock data.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import type { TrendHealthHistoryPoint } from '../types';
import { buildMockHealthHistory } from './mockHealthHistory';

/**
 * Returns health history data.
 * 
 * Tries to load from public/health-history.json if available.
 * Falls back to mock data if file is missing or invalid.
 * 
 * @returns Array of health history points
 */
export function getHealthHistory(): TrendHealthHistoryPoint[] {
  try {
    // Try to read from public/health-history.json
    // In Next.js, public files are served from the public directory
    // For server-side, we read from the file system
    const filePath = join(process.cwd(), 'public', 'health-history.json');
    const fileContent = readFileSync(filePath, 'utf-8');
    const history = JSON.parse(fileContent) as TrendHealthHistoryPoint[];

    // Validate it's an array
    if (!Array.isArray(history)) {
      console.warn('health-history.json is not an array, using mock data');
      return buildMockHealthHistory();
    }

    // Validate entries have required fields
    const isValid = history.every(
      (point) =>
        typeof point.date === 'string' &&
        typeof point.greenPct === 'number' &&
        point.greenPct >= 0 &&
        point.greenPct <= 100
    );

    if (!isValid) {
      console.warn('health-history.json has invalid entries, using mock data');
      return buildMockHealthHistory();
    }

    // Sort by date ascending
    const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));

    return sorted;
  } catch (error) {
    // File doesn't exist or can't be read - use mock data
    console.warn('Could not load health-history.json, using mock data:', error);
    return buildMockHealthHistory();
  }
}
