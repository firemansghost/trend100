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
};

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
  minSessions = DEFAULT_LONG_GAP_MIN_SESSIONS
): GapAuditSummary {
  const projectedRepairSymbols = selectLongGapCandidates(reports, minSessions);
  return {
    symbolsAudited: reports.length,
    symbolsComplete: reports.filter((r) => r.missingSessions === 0).length,
    symbolsWithMissingSessions: reports.filter((r) => r.missingSessions > 0).length,
    symbolsWithLongGap: projectedRepairSymbols.length,
    maxLongestMissingRun: reports.reduce((m, r) => Math.max(m, r.longestMissingRun), 0),
    projectedRepairSymbols,
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

export function fetchedCoversMissingSessions(
  fetchedDates: readonly string[],
  missingDates: readonly string[]
): boolean {
  const got = new Set(fetchedDates);
  return missingDates.every((d) => got.has(d));
}
