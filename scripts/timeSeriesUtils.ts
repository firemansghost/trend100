/**
 * Time series utilities for merge and retention
 * 
 * Helper functions for merging time series data and applying retention policies.
 */

/**
 * Merge time series points by date key, deduplicating and keeping latest
 * 
 * @param existing Existing points
 * @param newPoints New points to merge
 * @param dateKey Function to extract date from a point
 * @returns Merged and sorted array
 */
export function mergeTimeSeries<T>(
  existing: T[],
  newPoints: T[],
  dateKey: (point: T) => string
): T[] {
  const dateMap = new Map<string, T>();
  
  // Add existing points
  for (const point of existing) {
    const date = dateKey(point);
    dateMap.set(date, point);
  }
  
  // Add/update with new points (new points win on conflict)
  for (const point of newPoints) {
    const date = dateKey(point);
    dateMap.set(date, point);
  }
  
  // Convert back to array and sort by date ascending
  return Array.from(dateMap.values()).sort((a, b) => 
    dateKey(a).localeCompare(dateKey(b))
  );
}

/**
 * Trim time series to retention window
 * 
 * @param points Time series points
 * @param dateKey Function to extract date from a point
 * @param retentionDays Number of calendar days to retain
 * @returns Trimmed array (keeps most recent points)
 */
export function trimTimeSeries<T>(
  points: T[],
  dateKey: (point: T) => string,
  retentionDays: number
): T[] {
  if (points.length === 0) {
    return points;
  }

  // retentionDays <= 0 means "no trimming" (retain all points)
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    return points;
  }
  
  // Get latest date
  const latestDate = new Date(dateKey(points[points.length - 1]!));
  
  // Calculate cutoff date
  const cutoffDate = new Date(latestDate);
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0]!;
  
  // Filter to points on or after cutoff date
  return points.filter((point) => dateKey(point) >= cutoffDateStr);
}

/**
 * Merge and trim time series in one operation
 * 
 * @param existing Existing points
 * @param newPoints New points to merge
 * @param dateKey Function to extract date from a point
 * @param retentionDays Number of calendar days to retain
 * @returns Merged, sorted, and trimmed array
 */
export function mergeAndTrimTimeSeries<T>(
  existing: T[],
  newPoints: T[],
  dateKey: (point: T) => string,
  retentionDays: number
): T[] {
  const merged = mergeTimeSeries(existing, newPoints, dateKey);
  return trimTimeSeries(merged, dateKey, retentionDays);
}
