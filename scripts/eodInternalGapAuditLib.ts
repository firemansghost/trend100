/**
 * Offline EOD internal-gap audit I/O. No provider calls.
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { getAllDeckIds, getDeck } from '../src/modules/trend100/data/decks';
import {
  auditSymbolGaps,
  DEFAULT_EOD_GAP_AUDIT_START,
  DEFAULT_LONG_GAP_MIN_SESSIONS,
  summarizeGapReports,
  type SymbolGapReport,
  type UsableBar,
} from '../src/modules/trend100/data/eodGapAudit';
import { sanitizeCachedEodBars } from '../src/modules/trend100/data/providers/eodClose';
import type { EodBar } from '../src/modules/trend100/data/providers/marketstack';

export const EOD_CACHE_DIR = join(process.cwd(), 'data', 'marketstack', 'eod');

export function providerSymbolsByDeck(): Map<string, string[]> {
  const byDeck = new Map<string, string[]>();
  for (const deckId of getAllDeckIds()) {
    const deck = getDeck(deckId);
    const symbols = [
      ...new Set(deck.universe.map((item) => item.providerTicker ?? item.ticker)),
    ].sort((a, b) => a.localeCompare(b));
    byDeck.set(deckId, symbols);
  }
  return byDeck;
}

export function allProviderSymbols(): string[] {
  const set = new Set<string>();
  for (const symbols of providerSymbolsByDeck().values()) {
    for (const s of symbols) set.add(s);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function eodCacheFileName(symbol: string): string {
  return `${symbol.replace(/\./g, '_')}.json`;
}

export function loadUsableCachedBars(symbol: string): UsableBar[] {
  const filePath = join(EOD_CACHE_DIR, eodCacheFileName(symbol));
  if (!existsSync(filePath)) return [];
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as EodBar[];
    if (!Array.isArray(raw)) return [];
    const { bars } = sanitizeCachedEodBars(raw);
    return bars
      .filter((b) => typeof b.date === 'string' && b.date.length >= 10)
      .map((b) => ({ date: b.date.slice(0, 10), close: b.close }));
  } catch {
    return [];
  }
}

export function countEodJsonFiles(): number {
  if (!existsSync(EOD_CACHE_DIR)) return 0;
  return readdirSync(EOD_CACHE_DIR).filter((n) => n.endsWith('.json') && !n.startsWith('.')).length;
}

export function runInternalGapAudit(args?: {
  start?: string;
  longGapMin?: number;
  spySymbol?: string;
}): {
  start: string;
  end: string;
  spySymbol: string;
  referenceDates: string[];
  reports: SymbolGapReport[];
  summary: ReturnType<typeof summarizeGapReports>;
  longGapMin: number;
} {
  const start = args?.start ?? DEFAULT_EOD_GAP_AUDIT_START;
  const longGapMin = args?.longGapMin ?? DEFAULT_LONG_GAP_MIN_SESSIONS;
  const spySymbol = args?.spySymbol ?? 'SPY';
  const spyBars = loadUsableCachedBars(spySymbol);
  const spyDates = spyBars.map((b) => b.date).sort((a, b) => a.localeCompare(b));
  const end = spyDates[spyDates.length - 1];
  if (!end) {
    throw new Error('SPY cache has no usable bars; cannot build reference calendar');
  }
  const referenceDates = spyDates.filter((d) => d >= start && d <= end);
  if (referenceDates.length === 0) {
    throw new Error(`SPY has no usable sessions in ${start} → ${end}`);
  }

  const reports: SymbolGapReport[] = [];
  for (const symbol of allProviderSymbols()) {
    const bars = loadUsableCachedBars(symbol);
    const dates = bars.map((b) => b.date);
    reports.push(
      auditSymbolGaps({
        symbol,
        referenceDates,
        presentDates: dates,
        firstCachedDate: dates[0] ?? null,
        lastCachedDate: dates[dates.length - 1] ?? null,
        windowStart: start,
        windowEnd: end,
      })
    );
  }

  return {
    start,
    end,
    spySymbol,
    referenceDates,
    reports,
    summary: summarizeGapReports(reports, longGapMin),
    longGapMin,
  };
}

export function printInternalGapAudit(result: ReturnType<typeof runInternalGapAudit>): void {
  const { start, end, spySymbol, referenceDates, reports, summary, longGapMin } = result;
  console.log('=== EOD INTERNAL GAP AUDIT ===');
  console.log(`Reference: ${spySymbol}`);
  console.log(`start: ${start}`);
  console.log(`end: ${end}`);
  console.log(`referenceSessions: ${referenceDates.length}`);
  console.log(`longGapMinSessions: ${longGapMin}`);
  console.log(`eodJsonFiles: ${countEodJsonFiles()}`);

  const affected = reports.filter((r) => r.missingSessions > 0);
  console.log(`\n--- Affected symbols (${affected.length}) ---`);
  for (const r of affected) {
    const ranges = r.missingRanges.map((g) => `${g.start}..${g.end}(${g.sessions})`).join(', ');
    console.log(
      [
        r.symbol,
        `first=${r.firstCachedDate ?? 'n/a'}`,
        `last=${r.lastCachedDate ?? 'n/a'}`,
        `limitedStart=${r.limitedStart}`,
        `present/expected=${r.presentSessions}/${r.expectedSessions}`,
        `missing=${r.missingSessions}`,
        `coveragePct=${r.coveragePct}`,
        `longestMissingRun=${r.longestMissingRun}`,
        `missingRanges=${ranges || 'none'}`,
      ].join(' ')
    );
  }

  const byDeck = providerSymbolsByDeck();
  console.log('\n--- Long-gap candidates by deck ---');
  const candidates = new Set(summary.projectedRepairSymbols);
  for (const [deckId, symbols] of byDeck) {
    const hit = symbols.filter((s) => candidates.has(s));
    if (hit.length === 0) continue;
    console.log(`${deckId}: ${hit.join(', ')}`);
  }

  console.log('\n=== Summary ===');
  console.log(`symbolsAudited: ${summary.symbolsAudited}`);
  console.log(`symbolsComplete: ${summary.symbolsComplete}`);
  console.log(`symbolsWithMissingSessions: ${summary.symbolsWithMissingSessions}`);
  console.log(`symbolsWithLongGap: ${summary.symbolsWithLongGap}`);
  console.log(`maxLongestMissingRun: ${summary.maxLongestMissingRun}`);
  console.log(`projectedRepairSymbols: ${summary.projectedRepairSymbols.length}`);
  console.log(
    `projectedRepairSymbolsList: ${summary.projectedRepairSymbols.join(', ') || '(none)'}`
  );
  console.log(`projectedMarketstackTickerUnits: ${summary.projectedRepairSymbols.length}`);
}
