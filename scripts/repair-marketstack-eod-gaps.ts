/**
 * Manual bounded Marketstack repair for long internal EOD gaps.
 * Transactional: fetch/validate all candidates in memory, then merge.
 * Does not call Stooq. Does not print API keys.
 *
 * Usage: pnpm exec tsx scripts/repair-marketstack-eod-gaps.ts [--start 2026-02-18]
 */
import './load-env';

import type { EodBar } from '../src/modules/trend100/data/providers/marketstack';
import { isUsableEodClose, sanitizeCachedEodBars } from '../src/modules/trend100/data/providers/eodClose';
import {
  DEFAULT_EOD_GAP_AUDIT_START,
  DEFAULT_LONG_GAP_MIN_SESSIONS,
  existingDatesPreserved,
  fetchedCoversMissingSessions,
  fetchWindowForMissingRanges,
  usableBarDates,
} from '../src/modules/trend100/data/eodGapAudit';
import { fetchEodSeriesRange, mergeFetchedBarsIntoCache } from './marketstack-cache';
import {
  countEodJsonFiles,
  loadUsableCachedBars,
  printInternalGapAudit,
  runInternalGapAudit,
} from './eodInternalGapAuditLib';

function parseStart(argv: string[]): string {
  const i = argv.indexOf('--start');
  if (i >= 0 && argv[i + 1]) return argv[i + 1]!;
  return DEFAULT_EOD_GAP_AUDIT_START;
}

function validateStagedFetch(args: {
  symbol: string;
  missingDates: string[];
  existingDates: string[];
  fetched: EodBar[];
  truncated: boolean;
}): string | null {
  if (args.truncated) return 'fetch truncated';
  const sanitized = sanitizeCachedEodBars(args.fetched);
  if (sanitized.droppedDates.length > 0) {
    return `invalid closes on ${sanitized.droppedDates.join(',')}`;
  }
  if (sanitized.bars.length === 0) return 'empty fetch';
  if (sanitized.bars.some((b) => !isUsableEodClose(b.close))) return 'non-positive close survived sanitize';
  const fetchedDates = usableBarDates(sanitized.bars);
  if (!fetchedCoversMissingSessions(fetchedDates, args.missingDates)) {
    const still = args.missingDates.filter((d) => !fetchedDates.includes(d));
    return `fetched bars do not cover missing sessions: ${still.slice(0, 8).join(', ')}${still.length > 8 ? '…' : ''}`;
  }
  const mergedDates = [...new Set([...args.existingDates, ...fetchedDates])].sort((a, b) =>
    a.localeCompare(b)
  );
  if (!existingDatesPreserved(args.existingDates, mergedDates)) {
    return 'merge would drop neighboring history';
  }
  return null;
}

async function main(): Promise<void> {
  if (!process.env.MARKETSTACK_API_KEY) {
    throw new Error('MARKETSTACK_API_KEY is not set');
  }
  if (process.env.MARKETSTACK_OFFLINE === '1') {
    throw new Error('Refusing repair while MARKETSTACK_OFFLINE=1');
  }

  const start = parseStart(process.argv.slice(2).filter((a) => a !== '--'));
  const filesBefore = countEodJsonFiles();
  const pre = runInternalGapAudit({ start, longGapMin: DEFAULT_LONG_GAP_MIN_SESSIONS });
  printInternalGapAudit(pre);

  const candidates = pre.summary.projectedRepairSymbols;
  console.log('\n=== Repair candidates (before provider calls) ===');
  console.log(`candidate symbol count: ${candidates.length}`);
  console.log(`projected ticker units: ${candidates.length}`);
  console.log(`candidate symbols: ${candidates.join(', ') || '(none)'}`);
  console.log(`repair audit window: ${pre.start} → ${pre.end}`);

  if (candidates.length === 0) {
    console.log('No long-gap candidates. Nothing to fetch.');
    return;
  }

  const failures: string[] = [];
  const staged = new Map<string, EodBar[]>();
  let totalRequests = 0;

  console.log('\n--- Phase 1: fetch / validate (no cache writes) ---');
  for (const symbol of candidates) {
    const report = pre.reports.find((r) => r.symbol === symbol)!;
    const window = fetchWindowForMissingRanges(report.missingRanges);
    if (!window) {
      failures.push(`${symbol}: no missing ranges`);
      continue;
    }
    const fetchStart = window.start;
    const fetchEnd = window.end;
    console.log(`Fetch ${symbol} ${fetchStart} → ${fetchEnd}...`);
    try {
      const fetched = await fetchEodSeriesRange(symbol, fetchStart, fetchEnd);
      totalRequests += fetched.requestCount;
      const existingDates = loadUsableCachedBars(symbol).map((b) => b.date);
      const err = validateStagedFetch({
        symbol,
        missingDates: report.missingDates,
        existingDates,
        fetched: fetched.bars,
        truncated: fetched.truncated,
      });
      if (err) {
        failures.push(`${symbol}: ${err}`);
        console.error(`  ❌ ${symbol}: ${err}`);
        continue;
      }
      staged.set(symbol, fetched.bars);
      console.log(
        `  ✓ ${symbol}: requests=${fetched.requestCount} fetched=${fetched.bars.length} (staged)`
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      failures.push(`${symbol}: ${reason}`);
      console.error(`  ❌ ${symbol}: ${reason}`);
    }
  }

  console.log(`Marketstack EOD series requests (ticker-units): ${totalRequests}`);
  if (failures.length > 0 || staged.size !== candidates.length) {
    throw new Error(
      `Internal-gap repair incomplete: ${failures.length} failure(s). ` +
        `No cache files were written. ${failures.join('; ')}`
    );
  }

  console.log('\n--- Phase 2: merge into existing caches ---');
  for (const symbol of candidates) {
    const bars = staged.get(symbol)!;
    const stats = mergeFetchedBarsIntoCache(symbol, bars);
    console.log(
      `  ✓ ${symbol}: cache ${stats.oldCount} → ${stats.newCount} ` +
        `added=${stats.datesAdded} replaced=${stats.datesReplaced}`
    );
  }

  const filesAfter = countEodJsonFiles();
  if (filesAfter !== filesBefore) {
    throw new Error(
      `EOD json file count changed (${filesBefore} → ${filesAfter}). Refusing to treat repair as successful.`
    );
  }

  console.log('\n--- Post-repair audit ---');
  const post = runInternalGapAudit({ start, longGapMin: DEFAULT_LONG_GAP_MIN_SESSIONS });
  printInternalGapAudit(post);
  const remaining = post.summary.projectedRepairSymbols;
  if (remaining.length > 0) {
    const detail = remaining.map((s) => {
      const r = post.reports.find((x) => x.symbol === s);
      return `${s} longest=${r?.longestMissingRun} ranges=${r?.missingRanges.map((g) => `${g.start}..${g.end}`).join(',')}`;
    });
    throw new Error(
      `Post-repair long gaps remain (Marketstack did not fill them). Not faking coverage: ${detail.join('; ')}`
    );
  }

  const spy = post.reports.find((r) => r.symbol === 'SPY');
  console.log(`SPY last=${spy?.lastCachedDate ?? 'n/a'} (post-repair)`);
  console.log('\n=== Internal-gap repair commit complete ===');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
