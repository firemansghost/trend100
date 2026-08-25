/**
 * Manual bounded Marketstack repair for long internal EOD gaps.
 * Phase A: fetch/validate in memory. Phase B: merge RESOLVED + PROVIDER_LIMITED.
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
  type RepairClassification,
  type StagedPostMergeVerdict,
  type SymbolGapReport,
} from '../src/modules/trend100/data/eodGapAudit';
import {
  buildProviderGapResidualsFile,
  pruneFilledResiduals,
  residualFromLiveStaged,
  upsertResiduals,
} from '../src/modules/trend100/data/eodProviderGapResiduals';
import { evaluateRepairQuotaGuard } from '../src/modules/trend100/data/eodGapRepairGuard';
import { fetchEodSeriesRange, mergeFetchedBarsIntoCache } from './marketstack-cache';
import {
  countEodJsonFiles,
  loadProviderGapResiduals,
  loadUsableCachedBars,
  printInternalGapAudit,
  runInternalGapAudit,
  saveProviderGapResiduals,
} from './eodInternalGapAuditLib';

const DEFAULT_RESULT_JSON = '/tmp/eod-gap-repair-result.json';
const PROVIDER_GAP_RESIDUALS_NOTE = '.provider-gap-residuals-v1.meta';

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

type ClassifiedRow = {
  symbol: string;
  classification: RepairClassification;
  bars?: EodBar[];
  verdict?: StagedPostMergeVerdict;
  pre: SymbolGapReport;
  reason: string;
};

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
      resolved: [],
      providerLimited: [],
      unresolved: [],
      actualTickerUnits: 0,
      postRepairLongGapSymbols: [],
      postRepairUnverifiedLongGapSymbols: [],
    });
    setGithubOutput({ merged: 'false' });
    console.log('No long-gap candidates. Nothing to fetch.');
    return;
  }

  const classified: ClassifiedRow[] = [];
  let actualTickerUnits = 0;

  console.log('\n--- Phase A: fetch / simulated post-merge classify (no cache writes) ---');
  for (const symbol of candidates) {
    const report = pre.reports.find((r) => r.symbol === symbol)!;
    const window = fetchWindowForMissingRanges(report.missingRanges);
    if (!window) {
      classified.push({
        symbol,
        classification: 'UNRESOLVED',
        pre: report,
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
        classified.push({
          symbol,
          classification: 'UNRESOLVED',
          pre: report,
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
      classified.push({
        symbol,
        classification: verdict.classification,
        bars: verdict.mergeable ? sanitized.bars : undefined,
        verdict,
        pre: report,
        reason: verdict.reason,
      });
      const mark = verdict.mergeable ? '✓' : '❌';
      console.log(
        `  ${mark} ${symbol}: ${verdict.classification} requests=${fetched.requestCount} ` +
          `fetched=${sanitized.bars.length} (${verdict.reason})`
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      classified.push({
        symbol,
        classification: 'UNRESOLVED',
        pre: report,
        reason,
      });
      console.error(`  ❌ ${symbol}: ${reason}`);
    }
  }

  const resolved = classified.filter((r) => r.classification === 'RESOLVED');
  const providerLimited = classified.filter((r) => r.classification === 'PROVIDER_LIMITED');
  const unresolved = classified.filter((r) => r.classification === 'UNRESOLVED');
  const mergeable = [...resolved, ...providerLimited];

  console.log(`actualTickerUnits: ${actualTickerUnits}`);
  console.log('\n=== RESOLVED ===');
  console.log(`count: ${resolved.length}`);
  console.log(`symbols: ${resolved.map((r) => r.symbol).join(', ') || '(none)'}`);
  console.log('\n=== PROVIDER_LIMITED ===');
  console.log(`count: ${providerLimited.length}`);
  for (const row of providerLimited) {
    console.log(
      `${row.symbol} preLongest=${row.pre.longestMissingRun} ` +
        `postSimulatedLongest=${row.verdict?.post.longestMissingRun ?? 'n/a'} ` +
        `preMissing=${row.pre.missingSessions} ` +
        `postMissing=${row.verdict?.post.missingSessions ?? 'n/a'} ` +
        `remainingRanges=${formatRanges(row.verdict?.post)}`
    );
  }
  console.log('\n=== UNRESOLVED ===');
  console.log(`count: ${unresolved.length}`);
  for (const row of unresolved) {
    console.log(
      `${row.symbol} preLongest=${row.pre.longestMissingRun} ` +
        `postSimulatedLongest=${row.verdict?.post.longestMissingRun ?? row.pre.longestMissingRun} ` +
        `remainingRanges=${formatRanges(row.verdict?.post ?? row.pre)} reason=${row.reason}`
    );
  }

  if (mergeable.length === 0) {
    writeResult(cli.resultJson, {
      candidates,
      resolved: [],
      providerLimited: [],
      unresolved: unresolved.map((r) => r.symbol),
      actualTickerUnits,
      postRepairLongGapSymbols: candidates,
      postRepairUnverifiedLongGapSymbols: candidates,
    });
    setGithubOutput({ merged: 'false' });
    throw new Error('Phase A produced 0 mergeable candidates. No cache files were written.');
  }

  console.log('\n--- Phase B: merge RESOLVED + PROVIDER_LIMITED (no UNRESOLVED writes) ---');
  for (const row of mergeable) {
    const bars = row.bars;
    if (!bars) throw new Error(`Missing staged bars for ${row.symbol}`);
    const stats = mergeFetchedBarsIntoCache(row.symbol, bars);
    console.log(
      `  ✓ ${row.symbol} [${row.classification}]: cache ${stats.oldCount} → ${stats.newCount} ` +
        `added=${stats.datesAdded} replaced=${stats.datesReplaced}`
    );
  }

  const filesAfter = countEodJsonFiles();
  if (filesAfter !== filesBefore) {
    throw new Error(
      `EOD json file count changed (${filesBefore} → ${filesAfter}). Refusing to treat repair as successful.`
    );
  }

  const existingMeta = loadProviderGapResiduals();
  const liveResiduals = providerLimited
    .filter((row) => row.verdict)
    .map((row) => residualFromLiveStaged({ symbol: row.symbol, pre: row.pre, post: row.verdict!.post }));

  console.log('\n--- Post-repair audit ---');
  let post = runInternalGapAudit({ start: cli.start, longGapMin: DEFAULT_LONG_GAP_MIN_SESSIONS });

  const mergedMismatch: string[] = [];
  for (const row of mergeable) {
    const actual = post.reports.find((r) => r.symbol === row.symbol);
    const staged = row.verdict?.post;
    if (!actual || !staged) {
      mergedMismatch.push(`${row.symbol}: missing post-repair report`);
      continue;
    }
    if (actual.longestMissingRun > staged.longestMissingRun) {
      mergedMismatch.push(
        `${row.symbol}: longestMissingRun regressed ${staged.longestMissingRun} -> ${actual.longestMissingRun}`
      );
    }
    if (actual.missingSessions > staged.missingSessions) {
      mergedMismatch.push(
        `${row.symbol}: missingSessions regressed ${staged.missingSessions} -> ${actual.missingSessions}`
      );
    }
    if (row.classification === 'RESOLVED' && actual.longestMissingRun >= DEFAULT_LONG_GAP_MIN_SESSIONS) {
      mergedMismatch.push(`${row.symbol}: expected RESOLVED but longestMissingRun=${actual.longestMissingRun}`);
    }
  }
  if (mergedMismatch.length > 0) {
    throw new Error(`Merged symbols did not match staged expectation: ${mergedMismatch.join('; ')}`);
  }

  const pruned = pruneFilledResiduals(
    upsertResiduals(existingMeta?.residuals ?? [], liveResiduals),
    post.reports
  );
  saveProviderGapResiduals(
    buildProviderGapResidualsFile({
      auditStart: pre.start,
      auditEnd: pre.end,
      reference: pre.spySymbol,
      githubRunId: process.env.GITHUB_RUN_ID,
      residuals: pruned,
    })
  );
  console.log(
    `Updated ${PROVIDER_GAP_RESIDUALS_NOTE} with ${pruned.length} live provider residual(s).`
  );

  post = runInternalGapAudit({ start: cli.start, longGapMin: DEFAULT_LONG_GAP_MIN_SESSIONS });
  printInternalGapAudit(post);

  const spy = post.reports.find((r) => r.symbol === 'SPY');
  if (!spy?.lastCachedDate) {
    throw new Error('SPY missing after repair');
  }
  console.log(`SPY last=${spy.lastCachedDate} (post-repair)`);

  writeResult(cli.resultJson, {
    candidates,
    resolved: resolved.map((r) => r.symbol),
    providerLimited: providerLimited.map((r) => r.symbol),
    unresolved: unresolved.map((r) => r.symbol),
    actualTickerUnits,
    postRepairLongGapSymbols: post.summary.projectedRepairSymbols,
    postRepairUnverifiedLongGapSymbols: post.summary.unverifiedLongGapSymbols,
  });
  setGithubOutput({
    merged: 'true',
    remaining_long_gaps: String(post.summary.symbolsWithLongGap),
    remaining_unverified: String(post.summary.symbolsWithUnverifiedLongGap),
  });

  console.log('\n=== Internal-gap repair merge complete ===');
  console.log('Validated real provider bars were written for RESOLVED and PROVIDER_LIMITED symbols.');
  console.log('UNRESOLVED files were not modified. No synthetic bars were invented.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
