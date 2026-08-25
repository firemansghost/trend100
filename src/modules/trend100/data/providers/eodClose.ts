/**
 * Usable Marketstack EOD close: finite and strictly greater than zero.
 * Prefer a valid adjusted_close; otherwise a valid raw close. Never accept 0,
 * negatives, NaN, or +/-Infinity.
 */

export function isUsableEodClose(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function parseNumericField(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : null;
}

/**
 * Select a usable close from a Marketstack EOD row.
 * Returns null when neither adjusted_close nor close is finite and > 0.
 */
export function selectUsableEodClose(row: {
  adjusted_close?: unknown;
  close?: unknown;
}): number | null {
  const adjusted = parseNumericField(row.adjusted_close);
  if (isUsableEodClose(adjusted)) return adjusted;
  const raw = parseNumericField(row.close);
  if (isUsableEodClose(raw)) return raw;
  return null;
}

export function eodBarFromProviderRow(row: {
  date?: unknown;
  adjusted_close?: unknown;
  close?: unknown;
}): { date: string; close: number; adjusted_close?: number } | null {
  if (typeof row.date !== 'string' || row.date.length < 10) return null;
  const close = selectUsableEodClose(row);
  if (close == null) return null;
  const adjusted = parseNumericField(row.adjusted_close);
  return {
    date: row.date.slice(0, 10),
    close,
    ...(isUsableEodClose(adjusted) ? { adjusted_close: adjusted } : {}),
  };
}

export interface CachedBarLike {
  date: string;
  close: number;
  adjusted_close?: number;
}

export function sanitizeCachedEodBars<T extends CachedBarLike>(
  bars: readonly T[]
): { bars: T[]; droppedDates: string[] } {
  const kept: T[] = [];
  const droppedDates: string[] = [];
  for (const bar of bars) {
    if (isUsableEodClose(bar.close)) {
      kept.push(bar);
    } else {
      droppedDates.push(bar.date);
    }
  }
  return { bars: kept, droppedDates };
}
