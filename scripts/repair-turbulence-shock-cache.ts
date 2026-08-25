/**
 * Manual-only merge of bounded Marketstack EOD history for the 12 US_SECTORS /
 * Turbulence shock symbols. Does not synthesize bars. Does not print API keys.
 *
 * Transactional: fetch/validate all 12 in memory first. Cache files are written
 * only after every symbol succeeds. A failed fetch leaves data/marketstack/eod
 * byte-for-byte untouched by this command.
 *
 * Env:
 * - TURBULENCE_SHOCK_CACHE_REPAIR_START (optional; default 2023-01-01)
 * - MARKETSTACK_API_KEY (required)
 */

import './load-env';

import { getDeck } from '../src/modules/trend100/data/decks';
import type { EodBar } from '../src/modules/trend100/data/providers/marketstack';
import {
  TURBULENCE_SHOCK_CACHE_REPAIR_SYMBOL_COUNT,
  canCommitTurbulenceShockCacheRepair,
  describeFetchedEodCoverage,
} from '../src/modules/trend100/data/providers/turbulenceShockCacheRepair';
import { fetchEodSeriesRange, mergeFetchedBarsIntoCache } from './marketstack-cache';

const DEFAULT_REPAIR_START = '2023-01-01';

function todayUtc(): string {
  return new Date().toISOString().split('T')[0]!;
}

function shockUniverse(): string[] {
  const deck = getDeck('US_SECTORS');
  return deck.universe.map((item) => item.providerTicker ?? item.ticker);
}

async function main(): Promise<void> {
  if (!process.env.MARKETSTACK_API_KEY) {
    throw new Error('MARKETSTACK_API_KEY is not set');
  }

  const startDate = process.env.TURBULENCE_SHOCK_CACHE_REPAIR_START || DEFAULT_REPAIR_START;
  const endDate = todayUtc();
  const symbols = shockUniverse();

  if (symbols.length !== TURBULENCE_SHOCK_CACHE_REPAIR_SYMBOL_COUNT) {
    throw new Error(
      `US_SECTORS universe expected exactly ${TURBULENCE_SHOCK_CACHE_REPAIR_SYMBOL_COUNT} symbols, got ${symbols.length}`
    );
  }

  console.log('=== Turbulence / US_SECTORS EOD cache repair (manual) ===');
  console.log(`Universe: ${symbols.join(', ')} (${symbols.length})`);
  console.log(`Range: ${startDate} → ${endDate}`);
  console.log('Provider: Marketstack (real EOD). Existing cache is merged, never replaced wholesale.');
  console.log('Transactional: no cache writes until all 12 fetches succeed.');
  console.log('API key: set (value not printed)');

  let totalRequests = 0;
  const failures: string[] = [];
  const staged = new Map<string, EodBar[]>();

  console.log('\n--- Phase 1: fetch / validate (no cache writes) ---');
  for (const symbol of symbols) {
    console.log(`\nFetch ${symbol}...`);
    try {
      const fetched = await fetchEodSeriesRange(symbol, startDate, endDate);
      totalRequests += fetched.requestCount;
      if (fetched.truncated) {
        failures.push(symbol);
        console.error(
          `  ❌ ${symbol}: fetch truncated (${fetched.requestCount} request(s), ${fetched.bars.length} bars). Cache not written.`
        );
        continue;
      }
      if (fetched.bars.length === 0) {
        failures.push(symbol);
        console.error(`  ❌ ${symbol}: provider returned 0 bars. Cache not written.`);
        continue;
      }
      staged.set(symbol, fetched.bars);
      const first = fetched.bars[0]!.date;
      const last = fetched.bars[fetched.bars.length - 1]!.date;
      console.log(
        `  ✓ ${symbol}: requests=${fetched.requestCount} fetched=${fetched.bars.length} first=${first} last=${last} (staged in memory)`
      );
    } catch (error) {
      failures.push(symbol);
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`  ❌ ${symbol}: ${reason}. Cache not written.`);
    }
  }

  const mayCommit = canCommitTurbulenceShockCacheRepair({
    expectedSymbolCount: TURBULENCE_SHOCK_CACHE_REPAIR_SYMBOL_COUNT,
    stagedSymbols: [...staged.keys()],
    failures,
  });

  console.log('\n=== Repair summary (pre-commit) ===');
  console.log(`Symbols attempted: ${symbols.length}`);
  console.log(`Staged in memory: ${staged.size}`);
  console.log(`Marketstack EOD series requests (ticker-units): ${totalRequests}`);
  console.log(`Failures: ${failures.length}${failures.length ? ` (${failures.join(', ')})` : ''}`);

  if (!mayCommit) {
    throw new Error(
      `Turbulence shock cache repair incomplete: ${failures.length} symbol(s) failed. ` +
        `No cache files were written. Do not treat the 12-name universe as repaired.`
    );
  }

  const coverage = describeFetchedEodCoverage(
    [...staged.entries()].map(([symbol, bars]) => ({
      symbol,
      dates: bars.map((b) => b.date),
    }))
  );
  console.log('\n--- Fetched-range coverage (diagnostic only) ---');
  for (const row of coverage.bySymbol) {
    console.log(
      `  ${row.symbol}: first=${row.firstDate} last=${row.lastDate} bars=${row.barCount}`
    );
  }
  console.log(`  Dates present on all 12 symbols: ${coverage.datesInAllSymbols}`);
  console.log(`  Latest date present on all 12: ${coverage.latestDateInAllSymbols ?? 'n/a'}`);
  console.log(
    `  Latest ${coverage.spyWindowSessions} SPY dates: missing symbol/date cells=${coverage.spyWindowMissingCells}`
  );

  console.log('\n--- Phase 2: commit repair (merge into existing caches) ---');
  for (const symbol of symbols) {
    const bars = staged.get(symbol)!;
    const stats = mergeFetchedBarsIntoCache(symbol, bars);
    console.log(
      `  ✓ ${symbol}: cache ${stats.oldCount} → ${stats.newCount} ` +
        `first=${stats.firstDate} last=${stats.lastDate} ` +
        `added=${stats.datesAdded} replaced=${stats.datesReplaced}`
    );
  }

  console.log('\n=== Repair commit complete ===');
  console.log(`All ${symbols.length} US_SECTORS / shock caches merged.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
