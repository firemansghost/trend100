import { describe, expect, it } from 'vitest';
import {
  deckHasHistoryVariants,
  parseHealthHistoryCli,
  resolveBackfillDeckIds,
} from '../data/healthHistoryCli';
import { getAllDeckIds } from '../data/decks';

describe('parseHealthHistoryCli', () => {
  it('treats no selector as incremental (existing default)', () => {
    expect(parseHealthHistoryCli([])).toEqual({ mode: 'incremental', variantsOnly: false });
  });

  it('parses --deck MACRO as MACRO-only backfill (base + variants)', () => {
    const args = parseHealthHistoryCli([
      '--start',
      '2019-10-01',
      '--end',
      '2026-08-25',
      '--deck',
      'MACRO',
    ]);
    expect(args.mode).toBe('backfill');
    expect(args.deckIds).toEqual(['MACRO']);
    expect(args.variantsOnly).toBe(false);
    expect(resolveBackfillDeckIds(args)).toEqual(['MACRO']);
  });

  it('parses --deck MACRO --variants-only as MACRO variants only', () => {
    const args = parseHealthHistoryCli([
      '--start',
      '2019-10-01',
      '--end',
      '2026-08-25',
      '--deck',
      'MACRO',
      '--variants-only',
    ]);
    expect(args.deckIds).toEqual(['MACRO']);
    expect(args.variantsOnly).toBe(true);
    expect(resolveBackfillDeckIds(args)).toEqual(['MACRO']);
    expect(deckHasHistoryVariants('MACRO')).toBe(true);
  });

  it('does not include other decks when --deck MACRO is set', () => {
    const ids = resolveBackfillDeckIds(
      parseHealthHistoryCli(['--backfill-days', '30', '--deck', 'MACRO'])
    );
    expect(ids).toEqual(['MACRO']);
    expect(ids).not.toEqual(getAllDeckIds());
  });

  it('rejects an invalid deck id', () => {
    expect(() =>
      parseHealthHistoryCli(['--backfill-days', '10', '--deck', 'NOT_A_DECK'])
    ).toThrow(/Invalid --deck NOT_A_DECK/);
  });

  it('refuses --variants-only without --deck (no silent all-decks or base fallback)', () => {
    expect(() =>
      parseHealthHistoryCli(['--backfill-days', '10', '--variants-only'])
    ).toThrow(/--variants-only requires --deck/);
  });

  it('refuses --variants-only on a deck with no variants (does not rebuild base)', () => {
    expect(deckHasHistoryVariants('LEADERSHIP')).toBe(false);
    expect(() =>
      resolveBackfillDeckIds(
        parseHealthHistoryCli([
          '--backfill-days',
          '10',
          '--deck',
          'LEADERSHIP',
          '--variants-only',
        ])
      )
    ).toThrow(/LEADERSHIP.*no group\/section history variants/);
  });

  it('with no deck selector in backfill, selects every deck', () => {
    const args = parseHealthHistoryCli(['--backfill-days', '365']);
    expect(args.deckIds).toBeUndefined();
    expect(resolveBackfillDeckIds(args)).toEqual(getAllDeckIds());
  });

  it('ignores a standalone -- separator (pnpm script -- args)', () => {
    const without = parseHealthHistoryCli(['--start', '2026-02-18', '--end', '2026-08-25']);
    const withSep = parseHealthHistoryCli([
      '--',
      '--start',
      '2026-02-18',
      '--end',
      '2026-08-25',
    ]);
    expect(withSep).toEqual(without);
  });

  it('ignores -- with --deck MACRO --variants-only', () => {
    const without = parseHealthHistoryCli([
      '--start',
      '2019-10-01',
      '--end',
      '2026-08-25',
      '--deck',
      'MACRO',
      '--variants-only',
    ]);
    const withSep = parseHealthHistoryCli([
      '--',
      '--start',
      '2019-10-01',
      '--end',
      '2026-08-25',
      '--deck',
      'MACRO',
      '--variants-only',
    ]);
    expect(withSep).toEqual(without);
    expect(withSep.deckIds).toEqual(['MACRO']);
    expect(withSep.variantsOnly).toBe(true);
  });

  it('still rejects a real unknown argument', () => {
    expect(() =>
      parseHealthHistoryCli(['--', '--start', '2026-02-18', '--end', '2026-08-25', '--nope'])
    ).toThrow(/Unknown argument: --nope/);
  });
});
