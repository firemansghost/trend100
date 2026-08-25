/**
 * Fail closed if restored SPY EOD is missing or older than 10 UTC calendar days.
 * No provider calls.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { evaluateSpyEodFreshness } from '../src/modules/trend100/data/eodFreshness';

const MAX_DAYS = 10;

function main() {
  const file = join(process.cwd(), 'data', 'marketstack', 'eod', 'SPY.json');
  if (!existsSync(file)) {
    console.error('SPY EOD cache file is missing. Refusing offline health-history backfill.');
    process.exit(1);
  }
  let bars: unknown;
  try {
    bars = JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    console.error('SPY EOD cache is not valid JSON. Refusing offline health-history backfill.');
    process.exit(1);
  }
  if (!Array.isArray(bars) || bars.length === 0) {
    console.error('SPY EOD cache is empty. Refusing offline health-history backfill.');
    process.exit(1);
  }
  const last = bars[bars.length - 1] as { date?: unknown };
  const today = new Date().toISOString().slice(0, 10);
  const result = evaluateSpyEodFreshness(last?.date, today, MAX_DAYS);
  if (!result.ok) {
    console.error(`${result.reason}. Refusing offline health-history backfill.`);
    process.exit(1);
  }
  console.log(`SPY EOD freshness ok: last=${result.lastDate} ageDays=${result.ageDays} (max ${MAX_DAYS})`);
}

main();
