/**
 * Moving average calculations
 * 
 * Pure functions for computing SMA and EMA.
 */

/**
 * Calculate Simple Moving Average (SMA)
 * 
 * @param values Array of numeric values
 * @param window Window size (number of periods)
 * @returns Array of SMA values (same length as input, undefined for first window-1 values)
 */
export function calcSMA(values: number[], window: number): (number | undefined)[] {
  if (window <= 0 || values.length === 0) {
    return values.map(() => undefined);
  }

  const result: (number | undefined)[] = [];
  
  for (let i = 0; i < values.length; i++) {
    if (i < window - 1) {
      result.push(undefined);
    } else {
      const sum = values.slice(i - window + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / window);
    }
  }
  
  return result;
}

/**
 * Calculate Exponential Moving Average (EMA)
 * 
 * @param values Array of numeric values
 * @param window Window size (number of periods)
 * @returns Array of EMA values (same length as input, undefined for first value)
 */
export function calcEMA(values: number[], window: number): (number | undefined)[] {
  if (window <= 0 || values.length === 0) {
    return values.map(() => undefined);
  }

  const result: (number | undefined)[] = [];
  const multiplier = 2 / (window + 1);
  
  // First value is the first price
  if (values.length > 0) {
    result.push(values[0]);
  }
  
  // Calculate EMA for remaining values
  for (let i = 1; i < values.length; i++) {
    const prevEMA = result[i - 1]!;
    const currentPrice = values[i];
    const ema = (currentPrice - prevEMA) * multiplier + prevEMA;
    result.push(ema);
  }
  
  return result;
}

/**
 * Resample daily bars to weekly (Friday close, or last trading day of week)
 * 
 * @param dailyBars Array of { date: string; close: number }
 * @returns Array of weekly bars (Friday close, or last available day of week)
 */
export function resampleDailyToWeekly(
  dailyBars: Array<{ date: string; close: number }>
): Array<{ date: string; close: number }> {
  if (dailyBars.length === 0) {
    return [];
  }

  const weekly: Array<{ date: string; close: number }> = [];
  let currentWeekStart = 0;

  for (let i = 0; i < dailyBars.length; i++) {
    const bar = dailyBars[i]!;
    const date = new Date(bar.date);
    const dayOfWeek = date.getDay(); // 0 = Sunday, 5 = Friday

    // Check if this is the last day of the week (Friday) or last bar
    const isLastBar = i === dailyBars.length - 1;
    const isFriday = dayOfWeek === 5;
    const isNextWeek = i > 0 && i < dailyBars.length - 1
      ? new Date(dailyBars[i + 1]!.date).getDay() < dayOfWeek
      : false;

    if (isFriday || isLastBar || isNextWeek) {
      // Use this bar as the week's close
      weekly.push({ date: bar.date, close: bar.close });
      currentWeekStart = i + 1;
    }
  }

  return weekly;
}
