import { isUsableEodClose } from './providers/eodClose';

export const DEFAULT_EOD_GAP_AUDIT_START = '2026-02-18';
export const DEFAULT_LONG_GAP_MIN_SESSIONS = 5;
export const DEFAULT_FETCH_OVERLAP_CALENDAR_DAYS = 7;

export type UsableBar = { date: string; close: number };

export type MissingRange = { start: string; end: string; sessions: number };

export type SymbolGapReport = {
  symbol: string;
  firstCachedDate: string | null;
  lastCachedDate: string | null;
  limitedStart: boolean;
  expectedSessions: number;
  presentSessions: number;
  missingSessions: number;
  coveragePct: number;
  longestMissingRun: number;
  firstMissingDate: string | null;
  lastMissingDate: string | null;
  missingRanges: MissingRange[];
  missingDates: string[];
};

export type GapAuditSummary = {
  symbolsAudited: number;
  symbolsComplete: number;
  symbolsWithMissingSessions: number;
  symbolsWithLongGap: number;
  maxLongestMissingRun: number;
  projectedRepairSymbols: string[];
  symbolsWithProviderLimitedLongGap: number;
  symbolsWithUnverifiedLongGap: number;
  providerLimitedSymbols: string[];
  unverifiedLongGapSymbols: string[];
};

export type RepairClassification = 'RESOLVED' | 'PROVIDER_LIMITED' | 'UNRESOLVED';

export function usableBarDates(bars: readonly UsableBar[]): string[] {
  const dates = new Set<string>();
  for (const bar of bars) {
    if (typeof bar.date === 'string' && bar.date.length >= 10 && isUsableEodClose(bar.close)) {
      dates.add(bar.date.slice(0, 10));
    }
  }
  return [...dates].sort((a, b) => a.localeCompare(b));
}

export function addUtcCalendarDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Walk a reference session calendar and collect missing runs for a symbol.
 * `present` is usable close dates. Expected sessions start at max(windowStart, firstCached)
 * when the symbol appears after the audit start (limited-start).
 */
export function auditSymbolGaps(args: {
  symbol: string;
  referenceDates: readonly string[];
  presentDates: readonly string[];
  firstCachedDate: string | null;
  lastCachedDate: string | null;
  windowStart: string;
  windowEnd: string;
}): SymbolGapReport {
  const present = new Set(args.presentDates);
  const effectiveStart =
    args.firstCachedDate && args.firstCachedDate > args.windowStart
      ? args.firstCachedDate
      : args.windowStart;
  const limitedStart = Boolean(
    args.firstCachedDate && args.firstCachedDate > args.windowStart
  );

  const expected = args.referenceDates.filter(
    (d) => d >= effectiveStart && d <= args.windowEnd
  );
  const missingDates: string[] = [];
  const missingRanges: MissingRange[] = [];
  let runStart: string | null = null;
  let runLen = 0;
  let longest = 0;

  const flush = (endDate: string) => {
    if (!runStart || runLen === 0) return;
    missingRanges.push({ start: runStart, end: endDate, sessions: runLen });
    if (runLen > longest) longest = runLen;
    runStart = null;
    runLen = 0;
  };

  for (const d of expected) {
    if (!present.has(d)) {
      missingDates.push(d);
      if (!runStart) runStart = d;
      runLen += 1;
    } else if (runStart) {
      const prevMissing = missingDates[missingDates.length - 1]!;
      flush(prevMissing);
    }
  }
  if (runStart) {
    flush(missingDates[missingDates.length - 1]!);
  }

  const presentSessions = expected.filter((d) => present.has(d)).length;
  const missingSessions = missingDates.length;
  const coveragePct =
    expected.length === 0 ? 100 : Math.round((1000 * presentSessions) / expected.length) / 10;

  return {
    symbol: args.symbol,
    firstCachedDate: args.firstCachedDate,
    lastCachedDate: args.lastCachedDate,
    limitedStart,
    expectedSessions: expected.length,
    presentSessions,
    missingSessions,
    coveragePct,
    longestMissingRun: longest,
    firstMissingDate: missingDates[0] ?? null,
    lastMissingDate: missingDates[missingDates.length - 1] ?? null,
    missingRanges,
    missingDates,
  };
}

export function isLongGapCandidate(
  report: Pick<SymbolGapReport, 'longestMissingRun'>,
  minSessions = DEFAULT_LONG_GAP_MIN_SESSIONS
): boolean {
  return report.longestMissingRun >= minSessions;
}

export function selectLongGapCandidates(
  reports: readonly SymbolGapReport[],
  minSessions = DEFAULT_LONG_GAP_MIN_SESSIONS
): string[] {
  return reports
    .filter((r) => isLongGapCandidate(r, minSessions))
    .map((r) => r.symbol)
    .sort((a, b) => a.localeCompare(b));
}

export function summarizeGapReports(
  reports: readonly SymbolGapReport[],
  minSessions = DEFAULT_LONG_GAP_MIN_SESSIONS,
  residualLookup?: (report: SymbolGapReport) => 'provider_limited' | 'unverified' | 'none'
): GapAuditSummary {
  const projectedRepairSymbols = selectLongGapCandidates(reports, minSessions);
  const providerLimitedSymbols: string[] = [];
  const unverifiedLongGapSymbols: string[] = [];
  for (const symbol of projectedRepairSymbols) {
    const report = reports.find((r) => r.symbol === symbol)!;
    const kind = residualLookup ? residualLookup(report) : 'unverified';
    if (kind === 'provider_limited') providerLimitedSymbols.push(symbol);
    else unverifiedLongGapSymbols.push(symbol);
  }
  return {
    symbolsAudited: reports.length,
    symbolsComplete: reports.filter((r) => r.missingSessions === 0).length,
    symbolsWithMissingSessions: reports.filter((r) => r.missingSessions > 0).length,
    symbolsWithLongGap: projectedRepairSymbols.length,
    maxLongestMissingRun: reports.reduce((m, r) => Math.max(m, r.longestMissingRun), 0),
    projectedRepairSymbols,
    symbolsWithProviderLimitedLongGap: providerLimitedSymbols.length,
    symbolsWithUnverifiedLongGap: unverifiedLongGapSymbols.length,
    providerLimitedSymbols,
    unverifiedLongGapSymbols,
  };
}

export function fetchWindowForMissingRanges(
  ranges: readonly MissingRange[],
  overlapDays = DEFAULT_FETCH_OVERLAP_CALENDAR_DAYS
): { start: string; end: string } | null {
  if (ranges.length === 0) return null;
  const first = ranges[0]!.start;
  const last = ranges[ranges.length - 1]!.end;
  return {
    start: addUtcCalendarDays(first, -overlapDays),
    end: addUtcCalendarDays(last, overlapDays),
  };
}

/** Existing dates must all remain after a merge (neighbors preserved). */
export function existingDatesPreserved(
  existingDates: readonly string[],
  mergedDates: readonly string[]
): boolean {
  const merged = new Set(mergedDates);
  return existingDates.every((d) => merged.has(d));
}

export function fetchedOverlapsMissingSessions(
  fetchedDates: readonly string[],
  missingDates: readonly string[]
): boolean {
  const got = new Set(fetchedDates);
  return missingDates.some((d) => got.has(d));
}

export type StagedPostMergeVerdict = {
  classification: RepairClassification;
  resolvable: boolean;
  mergeable: boolean;
  reason: string;
  post: SymbolGapReport;
};

function verdict(
  classification: RepairClassification,
  reason: string,
  post: SymbolGapReport
): StagedPostMergeVerdict {
  return {
    classification,
    resolvable: classification === 'RESOLVED',
    mergeable: classification === 'RESOLVED' || classification === 'PROVIDER_LIMITED',
    reason,
    post,
  };
}

/**
 * Simulate merging fetched usable dates into existing cache and re-audit.
 * RESOLVED: post longestMissingRun < longGapMin.
 * PROVIDER_LIMITED: valid fetch that shrinks the hole but leaves longestMissingRun >= 5.
 * UNRESOLVED: empty/truncated/invalid/no overlap/no improvement.
 */
export function evaluateStagedPostMerge(args: {
  symbol: string;
  referenceDates: readonly string[];
  windowStart: string;
  windowEnd: string;
  existingDates: readonly string[];
  fetchedBars: readonly UsableBar[];
  truncated: boolean;
  firstCachedDate: string | null;
  lastCachedDate: string | null;
  pre: SymbolGapReport;
  longGapMin?: number;
}): StagedPostMergeVerdict {
  const longGapMin = args.longGapMin ?? DEFAULT_LONG_GAP_MIN_SESSIONS;
  const fail = (reason: string, post: SymbolGapReport) => verdict('UNRESOLVED', reason, post);

  const placeholderPost = args.pre;
  if (args.truncated) return fail('fetch truncated', placeholderPost);

  const fetchedDates = usableBarDates(args.fetchedBars);
  if (fetchedDates.length === 0) return fail('empty fetch after sanitize', placeholderPost);

  const mergedDates = [...new Set([...args.existingDates, ...fetchedDates])].sort((a, b) =>
    a.localeCompare(b)
  );
  if (!existingDatesPreserved(args.existingDates, mergedDates)) {
    return fail('merge would drop neighboring history', placeholderPost);
  }
  if (!fetchedOverlapsMissingSessions(fetchedDates, args.pre.missingDates)) {
    return fail('fetched data does not overlap the original long-gap window', placeholderPost);
  }

  const post = auditSymbolGaps({
    symbol: args.symbol,
    referenceDates: args.referenceDates,
    presentDates: mergedDates,
    firstCachedDate: args.firstCachedDate ?? mergedDates[0] ?? null,
    lastCachedDate: mergedDates[mergedDates.length - 1] ?? args.lastCachedDate,
    windowStart: args.windowStart,
    windowEnd: args.windowEnd,
  });

  const missingImproved = post.missingSessions < args.pre.missingSessions;
  const longestImproved = post.longestMissingRun < args.pre.longestMissingRun;
  const reason = `longestMissingRun ${args.pre.longestMissingRun} -> ${post.longestMissingRun}`;

  if (post.longestMissingRun < longGapMin) {
    if (!missingImproved && !longestImproved) {
      return fail('fetch does not improve original long gap', post);
    }
    return verdict('RESOLVED', reason, post);
  }

  if (missingImproved && longestImproved) {
    return verdict(
      'PROVIDER_LIMITED',
      `provider-limited residual ${reason} missing ${args.pre.missingSessions} -> ${post.missingSessions}`,
      post
    );
  }

  return fail('fetch does not improve original long gap', post);
}
