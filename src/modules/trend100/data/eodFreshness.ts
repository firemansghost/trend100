const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function utcCalendarDaysBetween(fromYmd: string, toYmd: string): number {
  const from = Date.parse(`${fromYmd}T00:00:00Z`);
  const to = Date.parse(`${toYmd}T00:00:00Z`);
  return Math.floor((to - from) / (1000 * 60 * 60 * 24));
}

/** Repair-grade SPY tip freshness (calendar days vs UTC today). */
export function evaluateSpyEodFreshness(
  lastDate: unknown,
  utcToday: string,
  maxCalendarDays = 10
): { ok: true; lastDate: string; ageDays: number } | { ok: false; reason: string } {
  if (typeof lastDate !== 'string' || !DATE_RE.test(lastDate)) {
    return { ok: false, reason: 'SPY last date is missing or not YYYY-MM-DD' };
  }
  if (!DATE_RE.test(utcToday)) {
    return { ok: false, reason: 'UTC today is not YYYY-MM-DD' };
  }
  const ageDays = utcCalendarDaysBetween(lastDate, utcToday);
  if (ageDays < 0) {
    return { ok: false, reason: `SPY last date ${lastDate} is after UTC today ${utcToday}` };
  }
  if (ageDays > maxCalendarDays) {
    return {
      ok: false,
      reason: `SPY last date ${lastDate} is ${ageDays} calendar days before UTC ${utcToday} (max ${maxCalendarDays})`,
    };
  }
  return { ok: true, lastDate, ageDays };
}
