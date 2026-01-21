/**
 * Trend100 engine exports
 * 
 * Pure engine functions - no React, no DOM, no network.
 */

export { classifyTrend } from './classifyTrend';
export type { TrendInputs, TrendStatus as EngineTrendStatus } from './classifyTrend';
export { computeHealthScore } from './healthScore';
export type { HealthScoreInput, HealthScoreOutput } from './healthScore';
export { calcSMA, calcEMA, resampleDailyToWeekly } from './movingAverages';
