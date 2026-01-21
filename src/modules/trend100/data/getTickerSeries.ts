/**
 * Get ticker price series with moving averages
 * 
 * Combines daily price series with computed moving averages and bands.
 */

import type { TrendDeckId } from '../types';
import { buildMockDailySeries } from './mockSeries';
import { calcSMA, calcEMA, resampleDailyToWeekly } from '../engine/movingAverages';
import { getLatestSnapshot } from './getLatestSnapshot';

export interface TickerSeriesPoint {
  date: string;
  price?: number;
  sma200?: number;
  sma50w?: number;
  ema50w?: number;
  upperBand?: number;
  lowerBand?: number;
}

export interface TickerSeries {
  points: TickerSeriesPoint[];
  latest: {
    price?: number;
    sma200?: number;
    sma50w?: number;
    ema50w?: number;
    upperBand?: number;
    lowerBand?: number;
  };
}

export interface GetTickerSeriesParams {
  ticker: string;
  deckId: TrendDeckId;
  asOfDate: string; // YYYY-MM-DD
}

/**
 * Get ticker series with moving averages and bands
 * 
 * Steps:
 * 1. Generate mock daily series
 * 2. Compute 200d SMA on daily closes
 * 3. Resample to weekly (Friday close)
 * 4. Compute 50w SMA and EMA on weekly closes
 * 5. Align weekly MAs back to daily dates (forward-fill)
 * 6. Compute upper/lower bands from aligned weekly MAs
 */
export function getTickerSeries(
  params: GetTickerSeriesParams
): TickerSeries {
  const { ticker, deckId, asOfDate } = params;
  
  // Get snapshot to extract target price
  const snapshot = getLatestSnapshot(deckId);
  const tickerSnapshot = snapshot.tickers.find((t) => t.ticker === ticker);
  const targetPrice = tickerSnapshot?.price;
  
  // Generate daily series (~420 trading days = ~2 years)
  const dailyBars = buildMockDailySeries({
    ticker,
    deckId,
    asOfDate,
    days: 420,
    targetPrice,
  });
  
  if (dailyBars.length === 0) {
    return { points: [], latest: {} };
  }
  
  // Extract daily closes
  const dailyCloses = dailyBars.map((bar) => bar.close);
  
  // Compute 200d SMA on daily closes
  const sma200Daily = calcSMA(dailyCloses, 200);
  
  // Resample to weekly (Friday close)
  const weeklyBars = resampleDailyToWeekly(dailyBars);
  const weeklyCloses = weeklyBars.map((bar) => bar.close);
  
  // Compute 50w SMA and EMA on weekly closes
  const sma50wWeekly = calcSMA(weeklyCloses, 50);
  const ema50wWeekly = calcEMA(weeklyCloses, 50);
  
  // Create a map of weekly date -> MA values
  const weeklyMAMap = new Map<string, { sma50w?: number; ema50w?: number }>();
  for (let i = 0; i < weeklyBars.length; i++) {
    const bar = weeklyBars[i]!;
    weeklyMAMap.set(bar.date, {
      sma50w: sma50wWeekly[i],
      ema50w: ema50wWeekly[i],
    });
  }
  
  // Align weekly MAs to daily dates (forward-fill)
  // For each daily date, use the most recent weekly MA value available
  const alignedSMA50w: (number | undefined)[] = [];
  const alignedEMA50w: (number | undefined)[] = [];
  
  let lastSMA50w: number | undefined;
  let lastEMA50w: number | undefined;
  
  for (const dailyBar of dailyBars) {
    const weeklyMA = weeklyMAMap.get(dailyBar.date);
    if (weeklyMA?.sma50w !== undefined) {
      lastSMA50w = weeklyMA.sma50w;
    }
    if (weeklyMA?.ema50w !== undefined) {
      lastEMA50w = weeklyMA.ema50w;
    }
    alignedSMA50w.push(lastSMA50w);
    alignedEMA50w.push(lastEMA50w);
  }
  
  // Build chart points
  const points: TickerSeriesPoint[] = dailyBars.map((bar, i) => {
    const sma50w = alignedSMA50w[i];
    const ema50w = alignedEMA50w[i];
    const upperBand = sma50w !== undefined && ema50w !== undefined
      ? Math.max(sma50w, ema50w)
      : undefined;
    const lowerBand = sma50w !== undefined && ema50w !== undefined
      ? Math.min(sma50w, ema50w)
      : undefined;
    
    return {
      date: bar.date,
      price: bar.close,
      sma200: sma200Daily[i],
      sma50w,
      ema50w,
      upperBand,
      lowerBand,
    };
  });
  
  // Extract latest values
  const lastPoint = points[points.length - 1];
  const latest = {
    price: lastPoint?.price,
    sma200: lastPoint?.sma200,
    sma50w: lastPoint?.sma50w,
    ema50w: lastPoint?.ema50w,
    upperBand: lastPoint?.upperBand,
    lowerBand: lastPoint?.lowerBand,
  };
  
  return { points, latest };
}
