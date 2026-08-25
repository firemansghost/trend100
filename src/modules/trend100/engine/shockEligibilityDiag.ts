/**
 * Read-only eligibility diagnostics for Turbulence shock.
 * Does not change calendar, floor, windows, or shockRaw semantics.
 */

export interface WindowCounts {
  shortCount: number;
  longCount: number;
  eligible: boolean;
}

export function countNonNullReturns(
  rets: readonly (number | null)[],
  fromIdx: number,
  toIdx: number
): number {
  let n = 0;
  for (let k = fromIdx; k <= toIdx; k++) {
    const v = rets[k];
    if (v != null && !Number.isNaN(v)) n += 1;
  }
  return n;
}

export function windowCountsForSymbol(
  rets: readonly (number | null)[],
  idx: number,
  shortWindow: number,
  longWindow: number
): WindowCounts {
  const shortStart = idx - shortWindow + 1;
  const longStart = idx - longWindow + 1;
  const shortCount = countNonNullReturns(rets, shortStart, idx);
  const longCount = countNonNullReturns(rets, longStart, idx);
  return {
    shortCount,
    longCount,
    eligible: shortCount >= shortWindow && longCount >= longWindow,
  };
}

/** LONG_WINDOW returns at idx-W+1..idx need closes on W+1 qualified dates (idx-W .. idx). */
export function longWindowCloseDateRange(
  qualifiedDates: readonly string[],
  idx: number,
  longWindow: number
): { closeDates: string[]; returnDates: string[]; priorCloseDate: string | null } {
  const firstReturnIdx = idx - longWindow + 1;
  const priorCloseIdx = idx - longWindow;
  const returnDates = qualifiedDates.slice(Math.max(0, firstReturnIdx), idx + 1);
  const closeStart = Math.max(0, priorCloseIdx);
  const closeDates = qualifiedDates.slice(closeStart, idx + 1);
  return {
    closeDates,
    returnDates,
    priorCloseDate: priorCloseIdx >= 0 ? qualifiedDates[priorCloseIdx] ?? null : null,
  };
}

export interface NullReturnSlot {
  returnIdx: number;
  currentDate: string;
  previousDate: string;
  currentClosePresent: boolean;
  previousClosePresent: boolean;
  currentClose: number | null;
  previousClose: number | null;
}

export function nullReturnSlotsInLongWindow(
  qualifiedDates: readonly string[],
  rets: readonly (number | null)[],
  closeByDate: ReadonlyMap<string, number>,
  idx: number,
  longWindow: number
): NullReturnSlot[] {
  const slots: NullReturnSlot[] = [];
  const longStart = idx - longWindow + 1;
  for (let k = longStart; k <= idx; k++) {
    if (k <= 0) continue;
    const v = rets[k];
    if (v != null && !Number.isNaN(v)) continue;
    const currentDate = qualifiedDates[k]!;
    const previousDate = qualifiedDates[k - 1]!;
    const currentClose = closeByDate.get(currentDate);
    const previousClose = closeByDate.get(previousDate);
    slots.push({
      returnIdx: k,
      currentDate,
      previousDate,
      currentClosePresent: currentClose != null && Number.isFinite(currentClose),
      previousClosePresent: previousClose != null && Number.isFinite(previousClose),
      currentClose: currentClose ?? null,
      previousClose: previousClose ?? null,
    });
  }
  return slots;
}

export function missingOrInvalidCloses(
  dates: readonly string[],
  closeByDate: ReadonlyMap<string, number>
): { missing: string[]; invalid: Array<{ date: string; close: number }> } {
  const missing: string[] = [];
  const invalid: Array<{ date: string; close: number }> = [];
  for (const d of dates) {
    const c = closeByDate.get(d);
    if (c == null || !Number.isFinite(c)) {
      missing.push(d);
    } else if (c <= 0) {
      invalid.push({ date: d, close: c });
    }
  }
  return { missing, invalid };
}

export interface EligibilityRow {
  date: string;
  idx: number;
  nCloses: number;
  shortEligibleCount: number;
  longEligibleCount: number;
  validSymbolsCount: number;
  excluded: string[];
  shockRawNull: boolean;
}

export function shouldLogEligibilityRow(
  row: EligibilityRow,
  allRows: readonly EligibilityRow[],
  minAssetsTarget: number
): boolean {
  if (row.validSymbolsCount < minAssetsTarget) return true;
  if (row.shockRawNull) return true;
  const last10 = allRows.slice(-10);
  return last10.includes(row);
}

export interface IncompleteQualifiedDate {
  date: string;
  nCloses: number;
  missingSymbols: string[];
}

export function incompleteQualifiedDates(
  qualifiedDates: readonly string[],
  symbolsWithCloseByDate: Map<string, ReadonlySet<string>>,
  recentUniverse: readonly string[],
  sinceDate: string
): IncompleteQualifiedDate[] {
  const out: IncompleteQualifiedDate[] = [];
  for (const date of qualifiedDates) {
    if (date < sinceDate) continue;
    const present = symbolsWithCloseByDate.get(date) ?? new Set<string>();
    const missing = recentUniverse.filter((s) => !present.has(s));
    if (missing.length > 0) {
      out.push({ date, nCloses: recentUniverse.length - missing.length, missingSymbols: missing });
    }
  }
  return out;
}

export function duplicateBarDates(dates: readonly string[]): string[] {
  const seen = new Set<string>();
  const dups: string[] = [];
  for (const d of dates) {
    if (seen.has(d)) dups.push(d);
    else seen.add(d);
  }
  return [...new Set(dups)];
}
