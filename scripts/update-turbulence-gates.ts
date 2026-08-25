/**
 * Update turbulence gates artifact from Marketstack (SPX + VIX EOD closes)
 *
 * Fetches S&P 500 cash (GSPC.INDX) and CBOE VIX (VIX.INDX) daily closes via the
 * existing Marketstack provider, computes SPX 50-day MA and gate booleans, writes
 * public/turbulence.gates.json for Turbulence Model (PR26 schema).
 *
 * Env:
 * - TURBULENCE_GATES_START (optional; default "2019-10-01")
 * - TURBULENCE_MARKETSTACK_SPX_SYMBOL (optional; default "GSPC.INDX")
 * - TURBULENCE_MARKETSTACK_VIX_SYMBOL (optional; default "VIX.INDX")
 * - TURBULENCE_GATES_FALLBACK_MAX_STALENESS_DAYS (optional; default "60")
 *   When the Marketstack refresh fails, existing public/turbulence.gates.json may be kept
 *   if structurally valid and last date is at most this many calendar days old.
 *   Expired files are not kept. A failed refresh is never logged as success.
 */

import './load-env';

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fetchEodSeries, type EodBar } from '../src/modules/trend100/data/providers/marketstack';
import {
  buildTurbulenceGatePoints,
} from '../src/modules/trend100/engine/turbulenceGates';

const GATES_OUT_PATH = join(process.cwd(), 'public', 'turbulence.gates.json');
/** Min rows for existing file to count as structurally usable fallback. */
const GATES_FALLBACK_MIN_POINTS = 200;
/** Calendar months per Marketstack chunk so each request stays well under the 1000-bar default. */
const CHUNK_MONTHS = 12;
const CHUNK_GAP_MS = 300;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function redactSecrets(message: string): string {
  return message.replace(/access_key=[^&\s'"]+/gi, 'access_key=REDACTED');
}

function parseYyyyMmDdUtc(dateStr: string): Date {
  if (!DATE_RE.test(dateStr)) {
    throw new Error(`Invalid date (expected YYYY-MM-DD): ${dateStr}`);
  }
  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(5, 7));
  const day = Number(dateStr.slice(8, 10));
  return new Date(Date.UTC(year, month - 1, day));
}

function formatYyyyMmDdUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addUtcMonths(dateStr: string, months: number): string {
  const d = parseYyyyMmDdUtc(dateStr);
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()));
  return formatYyyyMmDdUtc(out);
}

function minDate(a: string, b: string): string {
  return a <= b ? a : b;
}

/** Non-overlapping ~12-month calendar chunks covering [start, end] inclusive. */
function dateChunks(start: string, end: string): Array<{ from: string; to: string }> {
  if (start > end) {
    throw new Error(`Invalid gates date range: start ${start} is after end ${end}`);
  }
  const chunks: Array<{ from: string; to: string }> = [];
  let cursor = start;
  while (cursor <= end) {
    const rawTo = addUtcMonths(cursor, CHUNK_MONTHS);
    // Exclusive next-chunk start minus 1 day: use day before next period start.
    const nextStart = rawTo;
    const toDate = parseYyyyMmDdUtc(nextStart);
    toDate.setUTCDate(toDate.getUTCDate() - 1);
    const chunkTo = minDate(formatYyyyMmDdUtc(toDate), end);
    if (chunkTo < cursor) {
      chunks.push({ from: cursor, to: end });
      break;
    }
    chunks.push({ from: cursor, to: chunkTo });
    const following = parseYyyyMmDdUtc(chunkTo);
    following.setUTCDate(following.getUTCDate() + 1);
    cursor = formatYyyyMmDdUtc(following);
  }
  return chunks;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch a full date range via existing fetchEodSeries, chunked so history from
 * TURBULENCE_GATES_START is not silently truncated at the provider's 1000-bar default.
 */
async function fetchIndexClosesChunked(
  symbol: string,
  start: string,
  end: string
): Promise<Map<string, number>> {
  const chunks = dateChunks(start, end);
  const byDate = new Map<string, number>();

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const bars: EodBar[] = await fetchEodSeries(symbol, {
      startDate: chunk.from,
      endDate: chunk.to,
      limit: 1000,
    });

    if (bars.length >= 1000) {
      throw new Error(
        `Marketstack returned ${bars.length} bars for ${symbol} in ${chunk.from}..${chunk.to}; ` +
          'chunk may be truncated at the 1000-bar limit. Narrow CHUNK_MONTHS.'
      );
    }

    for (const bar of bars) {
      if (!DATE_RE.test(bar.date) || !Number.isFinite(bar.close)) continue;
      byDate.set(bar.date, bar.close);
    }

    if (i < chunks.length - 1) {
      await sleep(CHUNK_GAP_MS);
    }
  }

  if (byDate.size === 0) {
    throw new Error(`Marketstack returned 0 valid EOD closes for ${symbol} in ${start}..${end}`);
  }

  return byDate;
}

function getFallbackMaxStalenessDays(): number {
  const raw = process.env.TURBULENCE_GATES_FALLBACK_MAX_STALENESS_DAYS;
  const n = raw != null && raw !== '' ? parseInt(raw, 10) : 60;
  return Number.isFinite(n) && n >= 1 ? n : 60;
}

function isGateRowShape(x: unknown): x is { date: string } {
  if (x === null || typeof x !== 'object') return false;
  const d = (x as { date?: unknown }).date;
  return typeof d === 'string' && DATE_RE.test(d);
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
  const spxSymbol = process.env.TURBULENCE_MARKETSTACK_SPX_SYMBOL?.trim() || 'GSPC.INDX';
  const vixSymbol = process.env.TURBULENCE_MARKETSTACK_VIX_SYMBOL?.trim() || 'VIX.INDX';

  try {
    console.log(
      `Fetching Marketstack ${spxSymbol} and ${vixSymbol} (${start} to ${end}) in ${CHUNK_MONTHS}-month chunks...`
    );

    const spxMap = await fetchIndexClosesChunked(spxSymbol, start, end);
    await sleep(CHUNK_GAP_MS);
    const vixMap = await fetchIndexClosesChunked(vixSymbol, start, end);

    console.log(`   ${spxSymbol} closes: ${spxMap.size}`);
    console.log(`   ${vixSymbol} closes: ${vixMap.size}`);

    const commonDates = [...spxMap.keys()]
      .filter((d) => vixMap.has(d))
      .sort();

    if (commonDates.length === 0) {
      throw new Error(
        `No common trading dates between ${spxSymbol} and ${vixSymbol} in ${start}..${end}`
      );
    }

    const spxOnly = [...spxMap.keys()].filter((d) => !vixMap.has(d)).length;
    const vixOnly = [...vixMap.keys()].filter((d) => !spxMap.has(d)).length;
    console.log(
      `   Common dates: ${commonDates.length} (${commonDates[0]} to ${commonDates[commonDates.length - 1]})` +
        (spxOnly || vixOnly ? `; omitted SPX-only=${spxOnly} VIX-only=${vixOnly}` : '')
    );

    const points = buildTurbulenceGatePoints(spxMap, vixMap);

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
    const msg = redactSecrets(err instanceof Error ? err.message : String(err));
    const fallback = getUsableExistingGatesForFallback();

    if (fallback) {
      console.warn('\n⚠️  WARNING: Turbulence gates were NOT refreshed this run.');
      console.warn(`   Marketstack fetch/processing failed: ${msg}`);
      console.warn(
        `   Continuing with existing public/turbulence.gates.json (${fallback.pointCount} points, last date ${fallback.lastDate}, ~${fallback.daysStale} calendar day(s) behind UTC today).`
      );
      console.warn(
        '   Consumers should treat gate series as potentially stale until a successful refresh.'
      );
      process.exit(0);
    }

    console.error(
      '\n❌ Marketstack gates refresh failed, and no usable existing public/turbulence.gates.json fallback was found ' +
        `(file missing, invalid, or older than TURBULENCE_GATES_FALLBACK_MAX_STALENESS_DAYS=${getFallbackMaxStalenessDays()}).`
    );
    throw new Error(msg);
  }
}

main().catch((err) => {
  console.error(redactSecrets(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
