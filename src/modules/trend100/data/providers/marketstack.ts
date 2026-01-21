/**
 * Marketstack provider adapter
 * 
 * Fetches EOD (End of Day) market data from Marketstack API.
 * Server-side use only - never expose API keys to browser.
 */

export interface EodBar {
  date: string; // YYYY-MM-DD
  close: number;
  adjusted_close?: number; // Use if available, otherwise fallback to close
}

export interface FetchEodSeriesOptions {
  startDate?: string; // YYYY-MM-DD
  limit?: number; // Max number of bars (default: 1000)
}

/**
 * Fetch EOD daily series from Marketstack
 * 
 * Uses adjusted_close if available, otherwise close.
 * Returns bars sorted ascending by date (oldest first).
 * 
 * @param symbol Stock symbol (e.g., "AAPL")
 * @param options Configuration options
 * @returns Array of EOD bars
 */
export async function fetchEodSeries(
  symbol: string,
  options: FetchEodSeriesOptions = {}
): Promise<EodBar[]> {
  const { startDate, limit = 1000 } = options;
  const apiKey = process.env.MARKETSTACK_API_KEY;

  if (!apiKey) {
    throw new Error('MARKETSTACK_API_KEY environment variable is not set');
  }

  // Build URL
  const params = new URLSearchParams({
    access_key: apiKey,
    symbols: symbol,
    limit: limit.toString(),
  });

  if (startDate) {
    params.append('date_from', startDate);
  }

  const url = `https://api.marketstack.com/v1/eod?${params.toString()}`;

  // Retry logic for 429/5xx errors
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Trend100/1.0',
        },
      });

      if (!response.ok) {
        if (response.status === 429 || response.status >= 500) {
          // Rate limit or server error - retry with exponential backoff
          if (attempt < maxRetries - 1) {
            const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        }
        throw new Error(
          `Marketstack API error: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      // Handle Marketstack response format
      if (!data.data || !Array.isArray(data.data)) {
        throw new Error('Invalid Marketstack response format');
      }

      // Transform to our format
      const bars: EodBar[] = data.data
        .map((bar: any) => {
          const close = bar.adjusted_close !== null && bar.adjusted_close !== undefined
            ? bar.adjusted_close
            : bar.close;

          return {
            date: bar.date.split('T')[0]!, // Extract YYYY-MM-DD from ISO string
            close: parseFloat(close),
            adjusted_close: bar.adjusted_close
              ? parseFloat(bar.adjusted_close)
              : undefined,
          };
        })
        .filter((bar: EodBar) => !isNaN(bar.close))
        .sort((a: EodBar, b: EodBar) => a.date.localeCompare(b.date)); // Ascending

      return bars;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Failed to fetch EOD series after retries');
}
