/**
 * Get health history API
 * 
 * Returns health history data for chart visualization.
 * Currently uses mock data. In production, this will fetch from
 * a history store (database, file, or API).
 */

import type { TrendHealthHistoryPoint } from '../types';
import { buildMockHealthHistory } from './mockHealthHistory';

/**
 * Returns health history data.
 * 
 * Currently uses mock data. In production, this will fetch from
 * a history store.
 * 
 * @returns Array of health history points (730 days by default)
 */
export function getHealthHistory(): TrendHealthHistoryPoint[] {
  return buildMockHealthHistory();
}
