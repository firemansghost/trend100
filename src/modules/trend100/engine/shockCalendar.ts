/**
 * Qualified Turbulence shock calendar.
 *
 * Shock calendar (this module): a date is a shock session only if SPY has a
 * close AND at least minAssetsTarget recent-universe symbols have closes.
 *
 * ShockRaw acceptance is a separate check on the 20/60-eligible set, also
 * gated at minAssetsTarget (see hasEnoughShockAssets).
 */

import { isUsableEodClose } from '../data/providers/eodClose';

export const SHOCK_CALENDAR_SPY_SYMBOL = 'SPY';

export interface ShockDateParticipation {
  date: string;
  symbolCount: number;
  spyHadClose: boolean;
}

export interface QualifiedShockCalendar {
  unionDates: string[];
  qualifiedDates: string[];
  discarded: ShockDateParticipation[];
}

export function buildQualifiedShockCalendar(args: {
  unionDates: string[];
  /** Symbols (recent universe) with a valid close on each date. */
  symbolsWithCloseByDate: Map<string, ReadonlySet<string>>;
  recentUniverse: readonly string[];
  minAssetsTarget: number;
  spySymbol?: string;
}): QualifiedShockCalendar {
  const spySymbol = args.spySymbol ?? SHOCK_CALENDAR_SPY_SYMBOL;
  const recent = new Set(args.recentUniverse);
  const discarded: ShockDateParticipation[] = [];
  const qualifiedDates: string[] = [];

  for (const date of args.unionDates) {
    const present = args.symbolsWithCloseByDate.get(date) ?? new Set<string>();
    let symbolCount = 0;
    for (const s of present) {
      if (recent.has(s)) symbolCount += 1;
    }
    const spyHadClose = present.has(spySymbol);
    const ok = spyHadClose && symbolCount >= args.minAssetsTarget;
    if (ok) {
      qualifiedDates.push(date);
    } else {
      discarded.push({ date, symbolCount, spyHadClose });
    }
  }

  return {
    unionDates: [...args.unionDates],
    qualifiedDates,
    discarded,
  };
}

/**
 * A close participates in the shock calendar only if it is finite and > 0.
 */
export function isShockCalendarClose(close: unknown): close is number {
  return isUsableEodClose(close);
}

/**
 * Log returns vs the previous *qualified* shock date, not vs a discarded union date.
 * Both closes must be finite and > 0, and ln(current/previous) must be finite.
 */
export function logReturnsOnQualifiedDates(
  qualifiedDates: readonly string[],
  closeByDate: ReadonlyMap<string, number>
): (number | null)[] {
  const arr: (number | null)[] = new Array(qualifiedDates.length).fill(null);
  for (let i = 1; i < qualifiedDates.length; i++) {
    const d = qualifiedDates[i]!;
    const prev = qualifiedDates[i - 1]!;
    const close = closeByDate.get(d);
    const prevClose = closeByDate.get(prev);
    if (!isUsableEodClose(close) || !isUsableEodClose(prevClose)) continue;
    const ret = Math.log(close / prevClose);
    if (!Number.isFinite(ret)) continue;
    arr[i] = ret;
  }
  return arr;
}
