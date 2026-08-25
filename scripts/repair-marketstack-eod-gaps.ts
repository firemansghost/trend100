/**
 * Manual bounded Marketstack repair for long internal EOD gaps.
 * Phase A: fetch/validate in memory. Phase B: merge resolvable only.
 * Does not call Stooq. Does not print API keys.
 *
 * Usage: pnpm exec tsx scripts/repair-marketstack-eod-gaps.ts -- --start 2026-02-18
 */
import './load-env';

import { appendFileSync, writeFileSync } from 'fs';
import type { EodBar } from '../src/modules/trend100/data/providers/marketstack';
import { isUsableEodClose, sanitizeCachedEodBars } from '../src/modules/trend100/data/providers/eodClose';
import {
  DEFAULT_EOD_GAP_AUDIT_START,
  DEFAULT_LONG_GAP_MIN_SESSIONS,
  evaluateStagedPostMerge,
  fetchWindowForMissingRanges,
  type SymbolGapReport,
} from '../src/modules/trend100/data/eodGapAudit';
import { evaluateRepairQuotaGuard } from '../src/modules/trend100/data/eodGapRepairGuard';
import { fetchEodSeriesRange, mergeFetchedBarsIntoCache } from './marketstack-cache';
import {
  countEodJsonFiles,
  loadUsableCachedBars,
  printInternalGapAudit,
  runInternalGapAudit,
} from './eodInternalGapAuditLib';

const DEFAULT_RESULT_JSON = '/tmp/eod-gap-repair-result.json';

type Cli = {
  start: string;
  confirmRepair: string;
  maxTickerUnitsRaw: string;
  resultJson: string;
};

function argValue(argv: string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  return undefined;
}

function parseCli(argv: string[]): Cli {
  const a = argv.filter((x) => x !== '--');
  return {
    start: argValue(a, '--start') ?? DEFAULT_EOD_GAP_AUDIT_START,
    confirmRepair: argValue(a, '--confirm-repair') ?? process.env.CONFIRM_REPAIR ?? '',
    maxTickerUnitsRaw: argValue(a, '--max-ticker-units') ?? process.env.MAX_TICKER_UNITS ?? '0',
    resultJson: argValue(a, '--result-json') ?? process.env.EOD_GAP_REPAIR_RESULT_JSON ?? DEFAULT_RESULT_JSON,
  };
}

function setGithubOutput(values: Record<string, string>): void {
  const dest = process.env.GITHUB_OUTPUT;
  if (!dest) return;
  appendFileSync(
    dest,
    Object.entries(values)
      .map(([k, v]) => `${k}=${v}\n`)
      .join('')
  );
}

function writeResult(path: string, payload: unknown): void {
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  console.log(`Wrote repair result JSON: ${path}`);
}

function formatRanges(report: SymbolGapReport | undefined): string {
  if (!report) return 'n/a';
  return report.missingRanges.map((g) => `${g.start}..${g.end}(${g.sessions})`).join(',') || 'none';
}

async function main(): Promise<void> {
  if (!process.env.MARKETSTACK_API_KEY) {
    throw new Error('MARKETSTACK_API_KEY is not set');
  }
  if (process.env.MARKETSTACK_OFFLINE === '1') {
    throw new Error('Refusing repair while MARKETSTACK_OFFLINE=1');
  }

  const cli = parseCli(process.argv.slice(2));
  const filesBefore = countEodJsonFiles();
  const pre = runInternalGapAudit({ start: cli.start, longGapMin: DEFAULT_LONG_GAP_MIN_SESSIONS });
  printInternalGapAudit(pre);

  const candidates = pre.summary.projectedRepairSymbols;
  const projectedTickerUnits = candidates.length;
  console.log('\n=== Repair quota (before provider calls) ===');
  console.log(`candidateCount: ${candidates.length}`);
  console.log(`maxTickerUnits: ${cli.maxTickerUnitsRaw}`);
  console.log(`projectedTickerUnits: ${projectedTickerUnits}`);
  console.log(`candidateSymbols: ${candidates.join(', ') || '(none)'}`);
  console.log(`repairRange: ${pre.start} → ${pre.end}`);

  const guard = evaluateRepairQuotaGuard({
    repair: true,
    confirmRepair: cli.confirmRepair,
    maxTickerUnitsRaw: cli.maxTickerUnitsRaw,
    candidateCount: candidates.length,
  });
  if (!guard.ok) {
    setGithubOutput({ merged: 'false' });
    throw new Error(guard.reason);
  }

  if (candidates.length === 0) {
    writeResult(cli.resultJson, {
      candidates: [],
      resolvable: [],
      unresolved: [],
      actualTickerUnits: 0,
      postRepairLongGapSymbols: [],
    });
    setGithubOutput({ merged: 'false' });
    console.log('No long-gap candidates. Nothing to fetch.');
    return;
  }

  type UnresolvedRow = {
    symbol: string;
    preLongest: number;
    postLongest: number;
    remainingRanges: string;
    reason: string;
  };
  const unresolved: UnresolvedRow[] = [];
  const staged = new Map<string, EodBar[]>();
  let actualTickerUnits = 0;

  console.log('\n--- Phase A: fetch / simulated post-merge validate (no cache writes) ---');
  for (const symbol of candidates) {
    const report = pre.reports.find((r) => r.symbol === symbol)!;
    const window = fetchWindowForMissingRanges(report.missingRanges);
    if (!window) {
      unresolved.push({
        symbol,
        preLongest: report.longestMissingRun,
        postLongest: report.longestMissingRun,
        remainingRanges: formatRanges(report),
        reason: 'no missing ranges',
      });
      continue;
    }
    console.log(`Fetch ${symbol} ${window.start} → ${window.end}...`);
    try {
      const fetched = await fetchEodSeriesRange(symbol, window.start, window.end);
      actualTickerUnits += fetched.requestCount;
      const existing = loadUsableCachedBars(symbol);
      const existingDates = existing.map((b) => b.date);
      const sanitized = sanitizeCachedEodBars(fetched.bars);
      if (sanitized.bars.some((b) => !isUsableEodClose(b.close))) {
        unresolved.push({
          symbol,
          preLongest: report.longestMissingRun,
          postLongest: report.longestMissingRun,
          remainingRanges: formatRanges(report),
          reason: 'non-positive close survived sanitize',
        });
        console.error(`  ❌ ${symbol}: non-positive close survived sanitize`);
        continue;
      }
      const verdict = evaluateStagedPostMerge({
        symbol,
        referenceDates: pre.referenceDates,
        windowStart: pre.start,
        windowEnd: pre.end,
        existingDates,
        fetchedBars: sanitized.bars,
        truncated: fetched.truncated,
        firstCachedDate: existingDates[0] ?? null,
        lastCachedDate: existingDates[existingDates.length - 1] ?? null,
        pre: report,
      });
      if (!verdict.resolvable) {
        unresolved.push({
          symbol,
          preLongest: report.longestMissingRun,
          postLongest: verdict.post.longestMissingRun,
          remainingRanges: formatRanges(verdict.post),
          reason: verdict.reason,
        });
        console.error(`  ❌ ${symbol}: ${verdict.reason}`);
        continue;
      }
      staged.set(symbol, sanitized.bars);
      console.log(
        `  ✓ ${symbol}: requests=${fetched.requestCount} fetched=${sanitized.bars.length} ` +
          `(staged, ${verdict.reason})`
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      unresolved.push({
        symbol,
        preLongest: report.longestMissingRun,
        postLongest: report.longestMissingRun,
        remainingRanges: formatRanges(report),
        reason,
      });
      console.error(`  ❌ ${symbol}: ${reason}`);
    }
  }

  const resolvable = [...staged.keys()].sort((a, b) => a.localeCompare(b));
  console.log(`actualTickerUnits: ${actualTickerUnits}`);
  console.log('\n=== RESOLVABLE ===');
  console.log(`count: ${resolvable.length}`);
  console.log(`symbols: ${resolvable.join(', ') || '(none)'}`);
  console.log('\n=== UNRESOLVED ===');
  console.log(`count: ${unresolved.length}`);
  for (const row of unresolved) {
    console.log(
      `${row.symbol} preLongest=${row.preLongest} postSimulatedLongest=${row.postLongest} ` +
        `remainingRanges=${row.remainingRanges} reason=${row.reason}`
    );
  }

  if (resolvable.length === 0) {
    writeResult(cli.resultJson, {
      candidates,
      resolvable,
      unresolved,
      actualTickerUnits,
      postRepairLongGapSymbols: candidates,
    });
    setGithubOutput({ merged: 'false' });
    throw new Error(
      'Phase A produced 0 resolvable candidates. No cache files were written.'
    );
  }

  console.log('\n--- Phase B: merge resolvable candidates only ---');
  for (const symbol of resolvable) {
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
  const post = runInternalGapAudit({ start: cli.start, longGapMin: DEFAULT_LONG_GAP_MIN_SESSIONS });
  printInternalGapAudit(post);

  const stillLong = new Set(post.summary.projectedRepairSymbols);
  const mergedStillLong = resolvable.filter((s) => stillLong.has(s));
  if (mergedStillLong.length > 0) {
    throw new Error(
      `Merged symbols still have >=5-session gaps (refusing save): ${mergedStillLong.join(', ')}`
    );
  }

  const spy = post.reports.find((r) => r.symbol === 'SPY');
  if (!spy?.lastCachedDate) {
    throw new Error('SPY missing after repair');
  }
  console.log(`SPY last=${spy.lastCachedDate} (post-repair)`);

  writeResult(cli.resultJson, {
    candidates,
    resolvable,
    unresolved,
    actualTickerUnits,
    postRepairLongGapSymbols: post.summary.projectedRepairSymbols,
  });
  setGithubOutput({
    merged: 'true',
    remaining_long_gaps: String(post.summary.symbolsWithLongGap),
  });

  console.log('\n=== Internal-gap repair merge complete ===');
  console.log(
    'Validated resolvable files were written. Remaining long-gap symbols were not modified.'
  );
  if (post.summary.symbolsWithLongGap > 0) {
    console.log(
      `Note: ${post.summary.symbolsWithLongGap} long-gap symbol(s) remain. Completeness gate should fail the workflow after cache save.`
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
