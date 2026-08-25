import { getAllDeckIds, getDeck, isDeckId } from './decks';
import type { TrendDeckId } from '../types';

export type HealthHistoryCliArgs = {
  mode: 'incremental' | 'backfill';
  backfillDays?: number;
  startDate?: string;
  endDate?: string;
  /** Undefined means all decks (existing default). */
  deckIds?: TrendDeckId[];
  variantsOnly: boolean;
};

function takeValue(args: string[], flag: string, i: number): { value: string; next: number } {
  if (i >= args.length - 1 || !args[i + 1] || args[i + 1]!.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return { value: args[i + 1]!, next: i + 2 };
}

export function deckHasHistoryVariants(deckId: TrendDeckId): boolean {
  const deck = getDeck(deckId);
  const hasGroups = deck.universe.some((item) => Boolean(item.group));
  if (hasGroups) return true;
  return (deck.sections?.length ?? 0) >= 2;
}

/**
 * Parse update-health-history CLI. Selectors (--deck, --variants-only) require backfill mode.
 */
export function parseHealthHistoryCli(argv: string[]): HealthHistoryCliArgs {
  const deckIds: TrendDeckId[] = [];
  let variantsOnly = false;
  let backfillDays: number | undefined;
  let startDate: string | undefined;
  let endDate: string | undefined;

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;
    if (arg === '--') {
      i += 1;
      continue;
    }
    if (arg === '--backfill-days') {
      const { value, next } = takeValue(argv, arg, i);
      const days = parseInt(value, 10);
      if (isNaN(days) || days <= 0) {
        throw new Error('--backfill-days must be a positive number');
      }
      backfillDays = days;
      i = next;
      continue;
    }
    if (arg === '--start') {
      const { value, next } = takeValue(argv, arg, i);
      startDate = value;
      i = next;
      continue;
    }
    if (arg === '--end') {
      const { value, next } = takeValue(argv, arg, i);
      endDate = value;
      i = next;
      continue;
    }
    if (arg === '--deck') {
      const { value, next } = takeValue(argv, arg, i);
      if (!isDeckId(value)) {
        throw new Error(
          `Invalid --deck ${value}. Valid decks: ${getAllDeckIds().join(', ')}`
        );
      }
      deckIds.push(value);
      i = next;
      continue;
    }
    if (arg === '--variants-only') {
      variantsOnly = true;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  const hasBackfillRange = Boolean(startDate || endDate);
  const hasBackfillDays = backfillDays != null;
  const wantsBackfill = hasBackfillDays || hasBackfillRange || deckIds.length > 0 || variantsOnly;

  if (wantsBackfill && !hasBackfillDays && !(startDate && endDate)) {
    throw new Error('Backfill mode requires --backfill-days or both --start and --end');
  }

  if (hasBackfillDays && hasBackfillRange) {
    throw new Error('Use either --backfill-days or --start/--end, not both');
  }

  if (startDate || endDate) {
    if (!startDate || !endDate) {
      throw new Error('--start and --end require date values (YYYY-MM-DD)');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      throw new Error('Dates must be in YYYY-MM-DD format');
    }
    if (startDate > endDate) {
      throw new Error('Start date must be before end date');
    }
  }

  if (!wantsBackfill) {
    if (variantsOnly || deckIds.length > 0) {
      throw new Error('--deck and --variants-only require backfill mode');
    }
    return { mode: 'incremental', variantsOnly: false };
  }

  if (variantsOnly && deckIds.length === 0) {
    throw new Error('--variants-only requires --deck so base history is never rebuilt silently');
  }

  return {
    mode: 'backfill',
    backfillDays,
    startDate,
    endDate,
    deckIds: deckIds.length > 0 ? deckIds : undefined,
    variantsOnly,
  };
}

/** Decks to backfill. Empty selectors => all decks. variants-only never falls back to base. */
export function resolveBackfillDeckIds(args: HealthHistoryCliArgs): TrendDeckId[] {
  const selected = args.deckIds ?? getAllDeckIds();
  if (args.variantsOnly) {
    for (const id of selected) {
      if (!deckHasHistoryVariants(id)) {
        throw new Error(
          `--variants-only was set for ${id}, which has no group/section history variants. Refusing to rebuild base health-history.${id}.json.`
        );
      }
    }
  }
  return selected;
}
