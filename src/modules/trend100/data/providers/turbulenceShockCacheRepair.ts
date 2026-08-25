/**
 * Pure helpers for the manual Turbulence/US_SECTORS cache repair.
 * No I/O and no provider calls.
 */

export const TURBULENCE_SHOCK_CACHE_REPAIR_SYMBOL_COUNT = 12;

export interface StagedRepairBars {
  symbol: string;
  dates: string[];
}

export function canCommitTurbulenceShockCacheRepair(args: {
  expectedSymbolCount: number;
  stagedSymbols: string[];
  failures: string[];
}): boolean {
  if (args.failures.length > 0) return false;
  if (args.stagedSymbols.length !== args.expectedSymbolCount) return false;
  if (new Set(args.stagedSymbols).size !== args.expectedSymbolCount) return false;
  return true;
}

export interface FetchedCoverageReport {
  bySymbol: Array<{ symbol: string; firstDate: string | null; lastDate: string | null; barCount: number }>;
  datesInAllSymbols: number;
  latestDateInAllSymbols: string | null;
  spyWindowSessions: number;
  spyWindowMissingCells: number;
}

/**
 * Cross-symbol coverage for in-memory repair fetches. Diagnostic only — never fails the repair.
 */
export function describeFetchedEodCoverage(
  staged: StagedRepairBars[],
  spySymbol = 'SPY',
  spyWindow = 60
): FetchedCoverageReport {
  const bySymbol = staged.map((s) => ({
    symbol: s.symbol,
    firstDate: s.dates[0] ?? null,
    lastDate: s.dates[s.dates.length - 1] ?? null,
    barCount: s.dates.length,
  }));

  const dateSets = staged.map((s) => new Set(s.dates));
  const allDates = new Set<string>();
  for (const s of staged) {
    for (const d of s.dates) allDates.add(d);
  }
  const datesInAll = [...allDates].filter((d) => dateSets.every((set) => set.has(d))).sort();

  const spy = staged.find((s) => s.symbol === spySymbol);
  const spyDates = spy?.dates ?? [];
  const window = spyDates.slice(-spyWindow);
  let missing = 0;
  for (const d of window) {
    for (const set of dateSets) {
      if (!set.has(d)) missing += 1;
    }
  }

  return {
    bySymbol,
    datesInAllSymbols: datesInAll.length,
    latestDateInAllSymbols: datesInAll[datesInAll.length - 1] ?? null,
    spyWindowSessions: window.length,
    spyWindowMissingCells: missing,
  };
}
