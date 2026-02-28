/**
 * Stooq EOD fetcher for deck cache generation
 *
 * Fetches daily OHLCV from Stooq CSV API. Used as pilot provider for selected decks
 * (e.g. METALS_MINING) when EOD_STOOQ_DECKS is set, to reduce Marketstack API usage.
 *
 * Symbol mapping: US tickers use .us suffix (e.g. GLTR → gltr.us).
 * Underscores become dots (e.g. BRK_B → brk.b.us).
 */

import type { EodBar } from '../src/modules/trend100/data/providers/marketstack';

const STOOQ_BASE = 'https://stooq.com/q/d/l/';
const FETCH_TIMEOUT_MS = 28000;
const RETRY_DELAYS_MS = [1000, 2000, 4000];

/** Override map for symbols that need non-default Stooq mapping (ticker -> stooq symbol) */
const STOOQ_SYMBOL_OVERRIDES: Record<string, string> = {
  // METALS_MINING tickers use default .us mapping; add overrides here if needed
};

/**
 * Map provider ticker to Stooq symbol.
 * Default: ticker.toLowerCase() + ".us"
 * Underscores: BRK_B → brk.b.us
 */
export function toStooqSymbol(ticker: string): string {
  const override = STOOQ_SYMBOL_OVERRIDES[ticker];
  if (override) return override;
  const base = ticker.toLowerCase().replace(/_/g, '.');
  return `${base}.us`;
}

function toYyyyMmDd(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

async function fetchWithRetry(url: string): Promise<Response> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (res.status >= 500 && res.status < 600) {
        lastErr = new Error(`HTTP ${res.status} ${res.statusText}`);
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
          continue;
        }
        throw lastErr;
      }
      return res;
    } catch (err) {
      clearTimeout(timeout);
      lastErr = err instanceof Error ? err : new Error(String(err));
      const isRetryable =
        lastErr.message.includes('fetch failed') ||
        lastErr.message.includes('abort') ||
        lastErr.message.includes('timeout') ||
        lastErr.message.includes('UND_ERR_CONNECT_TIMEOUT') ||
        lastErr.message.includes('ECONNRESET') ||
        lastErr.message.includes('ETIMEDOUT');
      if (!isRetryable || attempt >= 2) throw lastErr;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
  throw lastErr ?? new Error('fetchWithRetry failed');
}

/**
 * Fetch EOD bars from Stooq for a given symbol and date range.
 *
 * @param providerSymbol Provider symbol (e.g. GLTR, GDX)
 * @param startDate YYYY-MM-DD
 * @param endDate YYYY-MM-DD
 * @returns EodBar[] sorted ascending by date
 */
export async function fetchStooqEodSeries(
  providerSymbol: string,
  startDate: string,
  endDate: string
): Promise<EodBar[]> {
  const stooqSymbol = toStooqSymbol(providerSymbol);
  const d1 = toYyyyMmDd(startDate);
  const d2 = toYyyyMmDd(endDate);
  const url = `${STOOQ_BASE}?s=${encodeURIComponent(stooqSymbol)}&d1=${d1}&d2=${d2}&i=d`;

  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(
      `Stooq fetch failed for ${providerSymbol} (${stooqSymbol}): ${res.status} ${res.statusText}\nURL: ${url}`
    );
  }

  const text = await res.text();
  const trimmed = text.trim();

  if (!trimmed || trimmed === 'No data.' || trimmed.toLowerCase().includes('no data')) {
    throw new Error(
      `Stooq returned no data for symbol "${providerSymbol}" (${stooqSymbol}). URL used: ${url}\n` +
        'Hint: Check symbol mapping. US tickers use .us suffix (e.g. gltr.us).'
    );
  }

  const lines = trimmed.split('\n').filter((l) => l.trim());
  if (lines.length < 2) {
    throw new Error(
      `Stooq CSV has no data rows for symbol "${providerSymbol}" (${stooqSymbol}). URL used: ${url}`
    );
  }

  const header = lines[0]!.toLowerCase();
  const dateIdx = header.indexOf('date');
  const closeIdx = header.indexOf('close');
  if (dateIdx < 0 || closeIdx < 0) {
    throw new Error(
      `Stooq CSV missing Date or Close column for ${providerSymbol}. URL: ${url}\nHeader: ${lines[0]}`
    );
  }

  const bars: EodBar[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i]!.split(',');
    const date = parts[dateIdx]?.trim();
    const closeStr = parts[closeIdx]?.trim();
    if (!date || !closeStr) continue;
    const close = parseFloat(closeStr);
    if (!Number.isFinite(close)) continue;
    bars.push({ date, close });
  }

  return bars.sort((a, b) => a.date.localeCompare(b.date));
}
