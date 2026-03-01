/**
 * Stooq EOD fetcher for deck cache generation
 *
 * Fetches daily OHLCV from Stooq CSV API. Used as pilot provider for selected decks
 * (e.g. METALS_MINING, PLUMBING) when EOD_STOOQ_DECKS is set, to reduce Marketstack API usage.
 *
 * Symbol mapping: US tickers use .us suffix (e.g. GLTR → gltr.us).
 * Underscores become dots (e.g. BRK_B → brk.b.us).
 *
 * Env vars:
 * - EOD_STOOQ_FORCE_FALLBACK: comma-separated tickers to skip Stooq, use Marketstack only
 * - EOD_STOOQ_SYMBOL_OVERRIDES: TICKER=symbol or TICKER=s1|s2|s3 (multi-candidate)
 */

import './load-env';

import type { EodBar } from '../src/modules/trend100/data/providers/marketstack';

const STOOQ_BASE = 'https://stooq.com/q/d/l/';
const FETCH_TIMEOUT_MS = 28000;
const RETRY_DELAYS_MS = [1000, 2000, 4000];

function getDefaultStooqSymbol(ticker: string): string {
  const base = ticker.toLowerCase().replace(/_/g, '.');
  return `${base}.us`;
}

function parseForceFallback(): Set<string> {
  const raw = process.env.EOD_STOOQ_FORCE_FALLBACK ?? '';
  const set = new Set<string>();
  for (const t of raw.split(',')) {
    const trimmed = t.trim().toUpperCase();
    if (trimmed) set.add(trimmed);
  }
  return set;
}

function parseSymbolOverrides(): Map<string, string[]> {
  const raw = process.env.EOD_STOOQ_SYMBOL_OVERRIDES ?? '';
  const map = new Map<string, string[]>();
  for (const pair of raw.split(',')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const ticker = pair.slice(0, eq).trim().toUpperCase();
    const value = pair.slice(eq + 1).trim();
    if (!ticker || !value) continue;
    const candidates = value.split('|').map((s) => s.trim()).filter(Boolean);
    if (candidates.length > 0) map.set(ticker, candidates);
  }
  return map;
}

let _forceFallback: Set<string> | null = null;
let _symbolOverrides: Map<string, string[]> | null = null;

function getForceFallback(): Set<string> {
  if (_forceFallback === null) _forceFallback = parseForceFallback();
  return _forceFallback;
}

function getSymbolOverrides(): Map<string, string[]> {
  if (_symbolOverrides === null) _symbolOverrides = parseSymbolOverrides();
  return _symbolOverrides;
}

/**
 * Check if ticker is in EOD_STOOQ_FORCE_FALLBACK (skip Stooq, use Marketstack only).
 */
export function isForceFallback(ticker: string): boolean {
  return getForceFallback().has(ticker.toUpperCase());
}

/**
 * Get Stooq symbol candidates for a ticker (override or default).
 * Tries in order; first success wins when using fetchStooqEodSeries.
 */
export function getStooqSymbolCandidates(ticker: string): string[] {
  const overrides = getSymbolOverrides();
  const candidates = overrides.get(ticker.toUpperCase());
  if (candidates && candidates.length > 0) return candidates;
  return [getDefaultStooqSymbol(ticker)];
}

/**
 * Check if ticker has a symbol override (from EOD_STOOQ_SYMBOL_OVERRIDES).
 */
export function hasSymbolOverride(ticker: string): boolean {
  return getSymbolOverrides().has(ticker.toUpperCase());
}

/**
 * Map provider ticker to single Stooq symbol (first candidate).
 * For multi-candidate, use getStooqSymbolCandidates.
 */
export function toStooqSymbol(ticker: string): string {
  return getStooqSymbolCandidates(ticker)[0]!;
}

function toYyyyMmDd(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

/**
 * Build a diagnostic summary of a Stooq response for CI debugging.
 */
function summarizeResponse(res: Response, text: string): string {
  const contentType = res.headers.get('content-type') ?? '(none)';
  const contentLength = res.headers.get('content-length') ?? '(none)';
  const snippet = text
    .slice(0, 350)
    .replace(/\r?\n/g, ' ')
    .trim();
  return `status=${res.status} content-type=${contentType} content-length=${contentLength} body_preview="${snippet}"`;
}

function isNonCsvResponse(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  const first500 = trimmed.slice(0, 500).toLowerCase();
  return (
    first500.startsWith('<!doctype') ||
    first500.startsWith('<html') ||
    first500.includes('<title>')
  );
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

async function fetchStooqEodSeriesForSymbol(
  providerSymbol: string,
  stooqSymbol: string,
  startDate: string,
  endDate: string
): Promise<EodBar[]> {
  const d1 = toYyyyMmDd(startDate);
  const d2 = toYyyyMmDd(endDate);
  const url = `${STOOQ_BASE}?s=${encodeURIComponent(stooqSymbol)}&d1=${d1}&d2=${d2}&i=d`;

  const res = await fetchWithRetry(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Stooq fetch failed for ${providerSymbol} (${stooqSymbol}): ${res.status} ${res.statusText}. ${summarizeResponse(res, text)} URL: ${url}`
    );
  }

  const text = await res.text();
  const trimmed = text.trim();

  if (isNonCsvResponse(text)) {
    throw new Error(
      `Stooq returned non-CSV/HTML response for ${providerSymbol} (${stooqSymbol}). ${summarizeResponse(res, text)} URL: ${url}`
    );
  }

  if (!trimmed || trimmed === 'No data.' || trimmed.toLowerCase().includes('no data')) {
    throw new Error(
      `Stooq returned no data for symbol "${providerSymbol}" (${stooqSymbol}). ${summarizeResponse(res, text)} URL: ${url}`
    );
  }

  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    throw new Error(
      `Stooq CSV has no data rows for symbol "${providerSymbol}" (${stooqSymbol}). ${summarizeResponse(res, text)} URL: ${url}`
    );
  }

  const headerRow = lines[0]!.toLowerCase();
  const headerCols = headerRow.split(',').map((c) => c.trim());
  const dateIdx = headerCols.indexOf('date');
  const closeIdx = headerCols.indexOf('close');
  if (dateIdx < 0 || closeIdx < 0) {
    throw new Error(
      `Stooq CSV missing Date or Close column for ${providerSymbol}. ${summarizeResponse(res, text)} URL: ${url} Header: ${lines[0]}`
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

  if (bars.length === 0) {
    throw new Error(
      `Stooq parsed 0 bars for ${providerSymbol} (${stooqSymbol}). ${summarizeResponse(res, text)} URL: ${url}`
    );
  }

  return bars.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Fetch EOD bars from Stooq for a given symbol and date range.
 * Tries symbol candidates (override or default) in order; first success wins.
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
  const candidates = getStooqSymbolCandidates(providerSymbol);
  let lastError: Error | null = null;

  for (const stooqSymbol of candidates) {
    try {
      const bars = await fetchStooqEodSeriesForSymbol(
        providerSymbol,
        stooqSymbol,
        startDate,
        endDate
      );
      if (bars.length > 0) {
        const lastDate = bars[bars.length - 1]!.date;
        console.log(`    Stooq OK ${providerSymbol} symbol=${stooqSymbol} bars=${bars.length} last=${lastDate}`);
        if (hasSymbolOverride(providerSymbol)) {
          console.log(`    Stooq override: ${providerSymbol} -> ${stooqSymbol}`);
        }
        return bars;
      }
      lastError = new Error(`Stooq returned 0 bars for ${providerSymbol} (${stooqSymbol})`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error(`All Stooq candidates failed for ${providerSymbol}`);
}
