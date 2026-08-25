/**
 * Manual-only merge of bounded Marketstack EOD history for the 12 US_SECTORS /
 * Turbulence shock symbols. Does not synthesize bars. Does not print API keys.
 *
 * Env:
 * - TURBULENCE_SHOCK_CACHE_REPAIR_START (optional; default 2023-01-01)
 * - MARKETSTACK_API_KEY (required)
 */

import './load-env';

import { getDeck } from '../src/modules/trend100/data/decks';
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

  if (symbols.length < 12) {
    throw new Error(`US_SECTORS universe expected 12 symbols, got ${symbols.length}`);
  }

  console.log('=== Turbulence / US_SECTORS EOD cache repair (manual) ===');
  console.log(`Universe: ${symbols.join(', ')} (${symbols.length})`);
  console.log(`Range: ${startDate} → ${endDate}`);
  console.log('Provider: Marketstack (real EOD). Existing cache is merged, never replaced wholesale.');
  console.log('API key: set (value not printed)');

  let totalRequests = 0;
  const failures: string[] = [];

  for (const symbol of symbols) {
    console.log(`\nRepair ${symbol}...`);
    try {
      const fetched = await fetchEodSeriesRange(symbol, startDate, endDate);
      totalRequests += fetched.requestCount;
      if (fetched.truncated) {
        failures.push(symbol);
        console.error(
          `  ❌ ${symbol}: fetch truncated (${fetched.requestCount} request(s), ${fetched.bars.length} bars). Cache not updated.`
        );
        continue;
      }
      if (fetched.bars.length === 0) {
        failures.push(symbol);
        console.error(`  ❌ ${symbol}: provider returned 0 bars. Cache not updated.`);
        continue;
      }
      const stats = mergeFetchedBarsIntoCache(symbol, fetched.bars);
      console.log(
        `  ✓ ${symbol}: requests=${fetched.requestCount} fetched=${fetched.bars.length} ` +
          `cache ${stats.oldCount} → ${stats.newCount} ` +
          `first=${stats.firstDate} last=${stats.lastDate} ` +
          `added=${stats.datesAdded} replaced=${stats.datesReplaced}`
      );
    } catch (error) {
      failures.push(symbol);
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`  ❌ ${symbol}: ${reason}. Cache not updated.`);
    }
  }

  console.log('\n=== Repair summary ===');
  console.log(`Symbols attempted: ${symbols.length}`);
  console.log(`Marketstack EOD series requests (ticker-units): ${totalRequests}`);
  console.log(`Failures: ${failures.length}${failures.length ? ` (${failures.join(', ')})` : ''}`);

  if (failures.length > 0) {
    throw new Error(
      `Turbulence shock cache repair incomplete: ${failures.length} symbol(s) failed. ` +
        `Do not treat the 12-name universe as repaired.`
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
