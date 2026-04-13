/**
 * Update turbulence gates artifact from Stooq (SPX + VIX EOD closes)
 *
 * Fetches SPX and VIX daily closes from Stooq CSV, computes SPX 50-day MA and
 * gate booleans, writes public/turbulence.gates.json for Turbulence Model (PR26).
 *
 * Replaces FRED to eliminate 0–1 day lag — gates now align with ShockZ timing.
 *
 * Env:
 * - TURBULENCE_GATES_START (optional; default "2019-10-01")
 * - TURBULENCE_STOOQ_SPX_SYMBOL (optional; default "^spx")
 * - TURBULENCE_STOOQ_VIX_SYMBOL (optional; default "vi.c" = S&P 500 VIX Cash)
 *   If set, tried first; on failure, fallback list is used. CI pins vi.c for stability.
 * - TURBULENCE_GATES_FALLBACK_MAX_STALENESS_DAYS (optional; default "60")
 *   When Stooq fetch fails, existing public/turbulence.gates.json may be kept if structurally
 *   valid and last date is at most this many calendar days old.
 */

import './load-env';

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const STOOQ_BASE = 'https://stooq.com/q/d/l/';

const FETCH_TIMEOUT_MS = 28000;
const RETRY_DELAYS_MS = [1000, 2000, 4000];

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

interface TurbulenceGatePoint {
  date: string;
  spx: number | null;
  spx50dma: number | null;
  spxAbove50dma: boolean | null;
  vix: number | null;
  vixBelow25: boolean | null;
}

function toYyyyMmDd(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

/** Stooq sometimes returns an API-key / captcha HTML page instead of CSV (no Date/Close header). */
function isLikelyStooqAuthOrBlockPage(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.includes('get_apikey')) return true;
  if (t.includes('get your api')) return true;
  if (t.includes('captcha')) return true;
  const head = t.slice(0, 1200);
  if (head.includes('<!doctype html') || head.includes('<html')) return true;
  return false;
}

async function fetchStooqCsv(
  symbol: string,
  start: string,
  end: string
): Promise<Map<string, number>> {
  const d1 = toYyyyMmDd(start);
  const d2 = toYyyyMmDd(end);
  const url = `${STOOQ_BASE}?s=${encodeURIComponent(symbol)}&d1=${d1}&d2=${d2}&i=d`;

  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(`Stooq fetch failed for ${symbol}: ${res.status} ${res.statusText}\nURL: ${url}`);
  }

  const text = await res.text();
  const trimmed = text.trim();

  if (isLikelyStooqAuthOrBlockPage(trimmed)) {
    throw new Error(
      `STOOQ_AUTH_BLOCKED: Stooq returned an auth/API or HTML block page instead of CSV for symbol "${symbol}". URL: ${url}`
    );
  }

  if (!trimmed || trimmed === 'No data.' || trimmed.toLowerCase().includes('no data')) {
    throw new Error(
      `Stooq returned no data for symbol "${symbol}". URL used: ${url}\n` +
        'Hint: The symbol may be wrong. Try ^spx, ^gspc for SPX; ^vix for VIX.'
    );
  }

  const lines = trimmed.split('\n').filter((l) => l.trim());
  if (lines.length < 2) {
    throw new Error(
      `Stooq CSV has no data rows for symbol "${symbol}". URL used: ${url}\n` +
        'Hint: Check the symbol and date range.'
    );
  }

  const header = lines[0]!.toLowerCase();
  const closeIdx = header.split(',').findIndex((c) => c.trim() === 'close');
  const dateIdx = header.split(',').findIndex((c) => c.trim() === 'date');

  if (closeIdx < 0 || dateIdx < 0) {
    if (isLikelyStooqAuthOrBlockPage(trimmed)) {
      throw new Error(
        `STOOQ_AUTH_BLOCKED: Stooq response had no CSV Date/Close header (likely auth/block page) for symbol "${symbol}". URL: ${url}`
      );
    }
    throw new Error(`Stooq CSV missing Date or Close column. URL: ${url}`);
  }

  const map = new Map<string, number>();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(',');
    const date = cols[dateIdx]?.trim();
    const closeStr = cols[closeIdx]?.trim();
    if (!date || !closeStr) continue;
    const close = parseFloat(closeStr);
    if (Number.isFinite(close)) map.set(date, close);
  }

  if (map.size === 0) {
    throw new Error(
      `Stooq CSV parsed 0 valid rows for symbol "${symbol}". URL used: ${url}\n` +
        'Hint: The symbol may be incorrect for this exchange.'
    );
  }

  return map;
}

const VIX_FALLBACK_SYMBOLS = ['vi.c', '^vix', '^VIX', 'vi.f'];

async function fetchVixWithFallback(
  start: string,
  end: string
): Promise<{ map: Map<string, number>; symbolUsed: string }> {
  const envSymbol = process.env.TURBULENCE_STOOQ_VIX_SYMBOL?.trim();
  const toTry = envSymbol ? [envSymbol, ...VIX_FALLBACK_SYMBOLS.filter((s) => s !== envSymbol)] : VIX_FALLBACK_SYMBOLS;

  let lastError: Error | null = null;
  for (const symbol of toTry) {
    try {
      const map = await fetchStooqCsv(symbol, start, end);
      return { map, symbolUsed: symbol };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw new Error(
    `Stooq VIX: all symbols failed. Tried: ${toTry.join(', ')}. Last error: ${lastError?.message ?? 'unknown'}`
  );
}

function computeSpx50dma(
  dates: string[],
  spxByDate: Map<string, number>
): Map<string, number> {
  const result = new Map<string, number>();
  const sortedDates = [...dates].sort();
  const validSpx: { date: string; value: number }[] = [];

  for (const date of sortedDates) {
    const spx = spxByDate.get(date);
    if (spx !== undefined) validSpx.push({ date, value: spx });

    if (validSpx.length >= 50) {
      const window = validSpx.slice(-50);
      const avg = window.reduce((s, p) => s + p.value, 0) / 50;
      result.set(date, avg);
    }
  }
  return result;
}

const GATES_OUT_PATH = join(process.cwd(), 'public', 'turbulence.gates.json');
/** Min rows for existing file to count as structurally usable fallback. */
const GATES_FALLBACK_MIN_POINTS = 200;

function getFallbackMaxStalenessDays(): number {
  const raw = process.env.TURBULENCE_GATES_FALLBACK_MAX_STALENESS_DAYS;
  const n = raw != null && raw !== '' ? parseInt(raw, 10) : 60;
  return Number.isFinite(n) && n >= 1 ? n : 60;
}

function isGateRowShape(x: unknown): x is { date: string } {
  if (x === null || typeof x !== 'object') return false;
  const d = (x as { date?: unknown }).date;
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
}

/**
 * If public/turbulence.gates.json exists, parses as array of gate points with enough history.
 * Returns null if missing, invalid, or last date too stale for fallback (see env).
 */
function getUsableExistingGatesForFallback(): {
  lastDate: string;
  daysStale: number;
  pointCount: number;
} | null {
  if (!existsSync(GATES_OUT_PATH)) return null;
  try {
    const content = readFileSync(GATES_OUT_PATH, 'utf-8');
    const arr = JSON.parse(content) as unknown;
    if (!Array.isArray(arr) || arr.length < GATES_FALLBACK_MIN_POINTS) return null;
    if (!isGateRowShape(arr[0]) || !isGateRowShape(arr[arr.length - 1])) return null;
    const lastDate = arr[arr.length - 1]!.date as string;
    const today = new Date().toISOString().split('T')[0]!;
    const daysStale = Math.floor(
      (new Date(today).getTime() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    const maxStale = getFallbackMaxStalenessDays();
    if (daysStale > maxStale) return null;
    return { lastDate, daysStale, pointCount: arr.length };
  } catch {
    return null;
  }
}

async function main() {
  const start = process.env.TURBULENCE_GATES_START || '2019-10-01';
  const end = new Date().toISOString().split('T')[0]!;
  const spxSymbol = process.env.TURBULENCE_STOOQ_SPX_SYMBOL || '^spx';

  try {
    console.log(`Fetching Stooq ${spxSymbol} and VIX (${start} to ${end})...`);

    const [spxMap, vixResult] = await Promise.all([
      fetchStooqCsv(spxSymbol, start, end),
      fetchVixWithFallback(start, end),
    ]);

    const vixMap = vixResult.map;
    console.log(`   VIX symbol used: ${vixResult.symbolUsed}`);

    const allDates = new Set<string>([...spxMap.keys(), ...vixMap.keys()]);
    const dates = [...allDates].sort();

    const spx50dmaByDate = computeSpx50dma(dates, spxMap);

    const points: TurbulenceGatePoint[] = dates.map((date) => {
      const spx = spxMap.get(date) ?? null;
      const spx50dma = spx50dmaByDate.get(date) ?? null;
      const vix = vixMap.get(date) ?? null;

      const spxAbove50dma =
        spx !== null && spx50dma !== null ? spx > spx50dma : null;
      const vixBelow25 = vix !== null ? vix < 25 : null;

      return {
        date,
        spx,
        spx50dma,
        spxAbove50dma,
        vix,
        vixBelow25,
      };
    });

    writeFileSync(GATES_OUT_PATH, JSON.stringify(points, null, 2), 'utf-8');

    const last = points[points.length - 1];
    console.log(`\n✅ Wrote ${points.length} points to public/turbulence.gates.json`);
    console.log(`   Last date: ${last?.date ?? 'N/A'}`);
    if (last) {
      console.log(`   Last spx: ${last.spx ?? 'null'}`);
      console.log(`   Last spx50dma: ${last.spx50dma ?? 'null'}`);
      console.log(`   Last spxAbove50dma: ${last.spxAbove50dma ?? 'null'}`);
      console.log(`   Last vix: ${last.vix ?? 'null'}`);
      console.log(`   Last vixBelow25: ${last.vixBelow25 ?? 'null'}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const authBlocked = msg.includes('STOOQ_AUTH_BLOCKED');
    const fallback = getUsableExistingGatesForFallback();

    if (fallback) {
      console.warn('\n⚠️  WARNING: Turbulence gates were NOT refreshed this run.');
      if (authBlocked) {
        console.warn(
          '   Stooq blocked the CSV fetch (auth/API key or captcha/HTML page instead of market data).'
        );
      } else {
        console.warn(`   Fetch/processing failed: ${msg}`);
      }
      console.warn(
        `   Continuing with existing public/turbulence.gates.json (${fallback.pointCount} points, last date ${fallback.lastDate}, ~${fallback.daysStale} calendar day(s) behind UTC today).`
      );
      console.warn(
        '   Consumers should treat gate series as potentially stale until a successful refresh.'
      );
      process.exit(0);
    }

    if (authBlocked) {
      console.error(
        '\n❌ Stooq auth/block page prevented gates refresh, and no usable existing public/turbulence.gates.json fallback was found.'
      );
      console.error(
        `   Tune TURBULENCE_GATES_FALLBACK_MAX_STALENESS_DAYS (default ${getFallbackMaxStalenessDays()}) or ensure a valid committed/prefetched gates file.`
      );
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
