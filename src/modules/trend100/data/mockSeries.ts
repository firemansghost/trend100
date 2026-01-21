/**
 * Mock daily price series generator
 * 
 * Generates deterministic daily price series for chart visualization.
 * Uses seeded PRNG for stable values across reloads.
 */

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
 * Get trading days (skip weekends) between start and end dates
 */
function getTradingDays(startDate: Date, endDate: Date): Date[] {
  const days: Date[] = [];
  const current = new Date(startDate);
  
  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    // Skip weekends (Saturday = 6, Sunday = 0)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      days.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }
  
  return days;
}

export interface MockDailyBar {
  date: string; // YYYY-MM-DD
  close: number;
}

export interface BuildMockDailySeriesOptions {
  ticker: string;
  deckId?: string;
  asOfDate: string; // YYYY-MM-DD
  days?: number; // Number of trading days (default ~420 = ~2 years)
  targetPrice?: number; // Target price for the last day (default: derived from seed)
}

/**
 * Builds a deterministic mock daily price series
 * 
 * Generates a smooth-ish path with drift + noise, ending at approximately targetPrice.
 */
export function buildMockDailySeries(
  options: BuildMockDailySeriesOptions
): MockDailyBar[] {
  const { ticker, deckId, asOfDate, days = 420, targetPrice } = options;
  
  // Seed PRNG with ticker + deckId + asOfDate for deterministic series
  const seed = `${ticker}_${deckId ?? 'default'}_${asOfDate}`;
  const prng = new SeededPRNG(seed);
  
  // Calculate start date (days trading days before asOfDate)
  const endDate = new Date(asOfDate);
  const tradingDays = getTradingDays(
    new Date(endDate.getTime() - days * 2 * 24 * 60 * 60 * 1000), // Rough estimate
    endDate
  );
  
  // Take the last 'days' trading days
  const selectedDays = tradingDays.slice(-days);
  if (selectedDays.length === 0) {
    return [];
  }
  
  // Determine target price (use provided or derive from seed)
  const finalPrice = targetPrice ?? (25 + prng.next() * 475); // 25-500 range
  
  // Generate price path backwards from target
  const prices: number[] = [];
  let currentPrice = finalPrice;
  
  // Start from the end and work backwards
  for (let i = selectedDays.length - 1; i >= 0; i--) {
    prices.unshift(currentPrice);
    
    // Generate next price (backwards)
    // Small drift + noise
    const drift = (prng.next() - 0.5) * 0.02; // -1% to +1% drift
    const noise = (prng.next() - 0.5) * 0.03; // -1.5% to +1.5% noise
    const volatility = prng.next() < 0.1 ? 0.05 : 0; // Occasional volatility spike
    
    const change = drift + noise + volatility;
    currentPrice = currentPrice / (1 + change); // Work backwards
  }
  
  // Normalize so last price equals targetPrice exactly
  const lastPrice = prices[prices.length - 1]!;
  const scale = finalPrice / lastPrice;
  const normalizedPrices = prices.map((p) => p * scale);
  
  // Build bars
  return selectedDays.map((date, i) => ({
    date: date.toISOString().split('T')[0]!,
    close: Math.round(normalizedPrices[i]! * 100) / 100,
  }));
}
