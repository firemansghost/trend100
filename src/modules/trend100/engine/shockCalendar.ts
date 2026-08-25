/**
 * Qualified Turbulence shock calendar.
 *
 * Shock calendar (this module): a date is a shock session only if SPY has a
 * close AND at least minAssetsTarget recent-universe symbols have closes.
 *
 * Shock calculation acceptance remains a separate policy (currently floor-6
 * via minForDate in update-turbulence-shock.ts) until a later audit.
 */

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
 * Log returns vs the previous *qualified* shock date, not vs a discarded union date.
 * return[i] is null unless the symbol has closes on both dates[i] and dates[i-1].
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
    if (close != null && prevClose != null && prevClose > 0) {
      arr[i] = Math.log(close / prevClose);
    }
  }
  return arr;
}
