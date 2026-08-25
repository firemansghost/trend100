import {
  DEFAULT_EOD_GAP_AUDIT_START,
  DEFAULT_LONG_GAP_MIN_SESSIONS,
  type MissingRange,
  type SymbolGapReport,
} from './eodGapAudit';

export const PROVIDER_GAP_RESIDUALS_FILENAME = '.provider-gap-residuals-v1.meta';

export type ProviderGapResidual = {
  symbol: string;
  ranges: MissingRange[];
  preLongestMissingRun: number;
  postLongestMissingRun: number;
  preMissingSessions: number;
  postMissingSessions: number;
  observedByLiveRepair: boolean;
};

export type ProviderGapResidualsFile = {
  version: 1;
  generatedAt: string;
  provider: 'marketstack';
  auditStart: string;
  auditEnd?: string;
  reference: string;
  longGapMinSessions: number;
  githubRunId?: string;
  residuals: ProviderGapResidual[];
};

function isYmd(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseRange(raw: unknown): MissingRange | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isYmd(r.start) || !isYmd(r.end)) return null;
  const sessions = r.sessions;
  if (typeof sessions !== 'number' || !Number.isFinite(sessions) || sessions < 1) return null;
  return { start: r.start, end: r.end, sessions };
}

function parseResidual(raw: unknown): ProviderGapResidual | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.symbol !== 'string' || r.symbol.length === 0) return null;
  if (!Array.isArray(r.ranges) || r.ranges.length === 0) return null;
  const ranges: MissingRange[] = [];
  for (const item of r.ranges) {
    const range = parseRange(item);
    if (!range) return null;
    ranges.push(range);
  }
  const nums = [
    r.preLongestMissingRun,
    r.postLongestMissingRun,
    r.preMissingSessions,
    r.postMissingSessions,
  ];
  if (nums.some((n) => typeof n !== 'number' || !Number.isFinite(n) || n < 0)) return null;
  if (r.observedByLiveRepair !== true) return null;
  return {
    symbol: r.symbol,
    ranges,
    preLongestMissingRun: r.preLongestMissingRun as number,
    postLongestMissingRun: r.postLongestMissingRun as number,
    preMissingSessions: r.preMissingSessions as number,
    postMissingSessions: r.postMissingSessions as number,
    observedByLiveRepair: true,
  };
}

/** Fail-safe: malformed top-level JSON yields null (treat as no exceptions). */
export function parseProviderGapResidualsJson(text: string): ProviderGapResidualsFile | null {
  try {
    return parseProviderGapResiduals(JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

export function parseProviderGapResiduals(raw: unknown): ProviderGapResidualsFile | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return null;
  if (o.provider !== 'marketstack') return null;
  if (!isYmd(o.auditStart)) return null;
  if (typeof o.reference !== 'string' || o.reference.length === 0) return null;
  if (typeof o.longGapMinSessions !== 'number' || o.longGapMinSessions < 1) return null;
  if (!Array.isArray(o.residuals)) return null;
  const residuals: ProviderGapResidual[] = [];
  for (const item of o.residuals) {
    const parsed = parseResidual(item);
    if (!parsed) continue;
    residuals.push(parsed);
  }
  const generatedAt = typeof o.generatedAt === 'string' ? o.generatedAt : '';
  const file: ProviderGapResidualsFile = {
    version: 1,
    generatedAt,
    provider: 'marketstack',
    auditStart: o.auditStart,
    reference: o.reference,
    longGapMinSessions: o.longGapMinSessions,
    residuals,
  };
  if (isYmd(o.auditEnd)) file.auditEnd = o.auditEnd;
  if (typeof o.githubRunId === 'string' && o.githubRunId.length > 0) file.githubRunId = o.githubRunId;
  return file;
}

export function residualEnvelope(ranges: readonly MissingRange[]): { start: string; end: string } | null {
  if (ranges.length === 0) return null;
  const starts = ranges.map((r) => r.start).sort((a, b) => a.localeCompare(b));
  const ends = ranges.map((r) => r.end).sort((a, b) => a.localeCompare(b));
  return { start: starts[0]!, end: ends[ends.length - 1]! };
}

/**
 * A live-recorded residual may cover a current long gap only if it is the same
 * symbol and the current hole is the same or strictly narrower (not expanded).
 */
export function residualExceptionCoversGap(args: {
  report: SymbolGapReport;
  recorded: ProviderGapResidual;
  auditStart: string;
  auditEnd: string;
  fileAuditStart: string;
  fileAuditEnd?: string;
  longGapMin?: number;
}): boolean {
  const min = args.longGapMin ?? DEFAULT_LONG_GAP_MIN_SESSIONS;
  const { report, recorded } = args;
  if (report.symbol !== recorded.symbol) return false;
  if (report.longestMissingRun < min) return false;
  if (!recorded.observedByLiveRepair) return false;
  const envelope = residualEnvelope(recorded.ranges);
  if (!envelope) return false;
  if (args.auditStart < args.fileAuditStart) return false;
  if (args.fileAuditEnd && args.auditEnd > args.fileAuditEnd) return false;
  if (!report.firstMissingDate || !report.lastMissingDate) return false;
  if (report.firstMissingDate < envelope.start) return false;
  if (report.lastMissingDate > envelope.end) return false;
  if (report.missingSessions > recorded.postMissingSessions) return false;
  if (report.longestMissingRun > recorded.postLongestMissingRun) return false;
  for (const range of report.missingRanges.filter((r) => r.sessions >= min)) {
    if (range.start < envelope.start || range.end > envelope.end) return false;
  }
  return true;
}

export function classifyReportAgainstResiduals(args: {
  report: SymbolGapReport;
  residuals: ProviderGapResidualsFile | null;
  auditStart: string;
  auditEnd: string;
  longGapMin?: number;
}): 'provider_limited' | 'unverified' | 'none' {
  const min = args.longGapMin ?? DEFAULT_LONG_GAP_MIN_SESSIONS;
  if (args.report.longestMissingRun < min) return 'none';
  if (!args.residuals) return 'unverified';
  const recorded = args.residuals.residuals.find((r) => r.symbol === args.report.symbol);
  if (!recorded) return 'unverified';
  const covered = residualExceptionCoversGap({
    report: args.report,
    recorded,
    auditStart: args.auditStart,
    auditEnd: args.auditEnd,
    fileAuditStart: args.residuals.auditStart,
    fileAuditEnd: args.residuals.auditEnd,
    longGapMin: min,
  });
  return covered ? 'provider_limited' : 'unverified';
}

export function residualFromLiveStaged(args: {
  symbol: string;
  pre: SymbolGapReport;
  post: SymbolGapReport;
}): ProviderGapResidual {
  const longRanges = args.post.missingRanges.filter(
    (r) => r.sessions >= DEFAULT_LONG_GAP_MIN_SESSIONS
  );
  return {
    symbol: args.symbol,
    ranges: longRanges.length > 0 ? longRanges : args.post.missingRanges,
    preLongestMissingRun: args.pre.longestMissingRun,
    postLongestMissingRun: args.post.longestMissingRun,
    preMissingSessions: args.pre.missingSessions,
    postMissingSessions: args.post.missingSessions,
    observedByLiveRepair: true,
  };
}

export function buildProviderGapResidualsFile(args: {
  generatedAt?: string;
  auditStart?: string;
  auditEnd?: string;
  reference?: string;
  longGapMinSessions?: number;
  githubRunId?: string;
  residuals: ProviderGapResidual[];
}): ProviderGapResidualsFile {
  const file: ProviderGapResidualsFile = {
    version: 1,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    provider: 'marketstack',
    auditStart: args.auditStart ?? DEFAULT_EOD_GAP_AUDIT_START,
    reference: args.reference ?? 'SPY',
    longGapMinSessions: args.longGapMinSessions ?? DEFAULT_LONG_GAP_MIN_SESSIONS,
    residuals: args.residuals,
  };
  if (args.auditEnd) file.auditEnd = args.auditEnd;
  if (args.githubRunId) file.githubRunId = args.githubRunId;
  return file;
}

/** Drop residuals whose symbol no longer has a long gap (provider later filled). */
export function pruneFilledResiduals(
  residuals: readonly ProviderGapResidual[],
  reports: readonly SymbolGapReport[],
  longGapMin = DEFAULT_LONG_GAP_MIN_SESSIONS
): ProviderGapResidual[] {
  const bySymbol = new Map(reports.map((r) => [r.symbol, r]));
  return residuals.filter((item) => {
    const report = bySymbol.get(item.symbol);
    if (!report) return false;
    return report.longestMissingRun >= longGapMin;
  });
}

export function upsertResiduals(
  existing: readonly ProviderGapResidual[],
  incoming: readonly ProviderGapResidual[]
): ProviderGapResidual[] {
  const map = new Map(existing.map((r) => [r.symbol, r]));
  for (const item of incoming) map.set(item.symbol, item);
  return [...map.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
}
