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
            // Check Retry-After header if present
            const retryAfter = response.headers.get('Retry-After');
            const delay = retryAfter
              ? parseInt(retryAfter, 10) * 1000
              : Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
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

/**
 * Fetch latest EOD bars for multiple symbols in a single request
 * 
 * Marketstack supports comma-separated symbols. This reduces API calls.
 * 
 * @param symbols Array of stock symbols (e.g., ["AAPL", "MSFT", "GOOGL"])
 * @returns Map of symbol -> latest EOD bar (or empty array if not found)
 */
export async function fetchEodLatestBatch(
  symbols: string[]
): Promise<Map<string, EodBar | null>> {
  const apiKey = process.env.MARKETSTACK_API_KEY;

  if (!apiKey) {
    throw new Error('MARKETSTACK_API_KEY environment variable is not set');
  }

  if (symbols.length === 0) {
    return new Map();
  }

  // Marketstack supports comma-separated symbols, but we'll chunk to keep URLs reasonable
  const BATCH_SIZE = 50;
  const result = new Map<string, EodBar | null>();

  // Process in batches
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE);
    const symbolsStr = batch.join(',');

    const params = new URLSearchParams({
      access_key: apiKey,
      symbols: symbolsStr,
      limit: '1', // Only need latest bar
    });

    const url = `https://api.marketstack.com/v1/eod/latest?${params.toString()}`;

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
            if (attempt < maxRetries - 1) {
              const retryAfter = response.headers.get('Retry-After');
              const delay = retryAfter
                ? parseInt(retryAfter, 10) * 1000
                : Math.pow(2, attempt) * 1000;
              await new Promise((resolve) => setTimeout(resolve, delay));
              continue;
            }
          }
          throw new Error(
            `Marketstack API error: ${response.status} ${response.statusText}`
          );
        }

        const data = await response.json();

        if (!data.data || !Array.isArray(data.data)) {
          throw new Error('Invalid Marketstack response format');
        }

        // Map results by symbol
        for (const bar of data.data) {
          const symbol = bar.symbol;
          const close = bar.adjusted_close !== null && bar.adjusted_close !== undefined
            ? bar.adjusted_close
            : bar.close;

          result.set(symbol, {
            date: bar.date.split('T')[0]!,
            close: parseFloat(close),
            adjusted_close: bar.adjusted_close
              ? parseFloat(bar.adjusted_close)
              : undefined,
          });
        }

        // Mark symbols not found as null
        for (const symbol of batch) {
          if (!result.has(symbol)) {
            result.set(symbol, null);
          }
        }

        break; // Success, exit retry loop
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    if (lastError && !result.size) {
      throw lastError;
    }

    // Rate limiting: 4 requests/sec = 250ms spacing
    if (i + BATCH_SIZE < symbols.length) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  return result;
}
