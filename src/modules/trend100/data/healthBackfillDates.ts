/**
 * Offline health-history backfill calendar: union of variant EOD dates and
 * existing in-range history dates. Does not invent weekdays or EOD bars.
 */

export function isUtcWeekend(ymd: string): boolean {
  const date = new Date(`${ymd}T00:00:00Z`);
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export function resolveHealthBackfillDates(args: {
  eodDates: readonly string[];
  existingHistoryDates: readonly string[];
  startDate: string;
  endDate: string;
}): string[] {
  const set = new Set<string>();
  for (const date of [...args.eodDates, ...args.existingHistoryDates]) {
    if (typeof date !== 'string' || date.length < 10) continue;
    const ymd = date.slice(0, 10);
    if (ymd < args.startDate || ymd > args.endDate) continue;
    if (isUtcWeekend(ymd)) continue;
    set.add(ymd);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}
