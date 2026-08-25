/**
 * Provider-free internal-gap audit of data/marketstack/eod.
 * Usage: pnpm exec tsx scripts/audit-marketstack-eod-gaps.ts [--start 2026-02-18]
 */
import './load-env';

import { DEFAULT_EOD_GAP_AUDIT_START } from '../src/modules/trend100/data/eodGapAudit';
import { printInternalGapAudit, runInternalGapAudit } from './eodInternalGapAuditLib';

function parseStart(argv: string[]): string {
  const i = argv.indexOf('--start');
  if (i >= 0 && argv[i + 1]) return argv[i + 1]!;
  return DEFAULT_EOD_GAP_AUDIT_START;
}

function main() {
  const argv = process.argv.slice(2).filter((a) => a !== '--');
  const start = parseStart(argv);
  const failOnLongGap = argv.includes('--fail-on-long-gap');
  const result = runInternalGapAudit({ start });
  printInternalGapAudit(result);
  if (failOnLongGap && result.summary.symbolsWithLongGap > 0) {
    console.error(
      `Completeness gate: symbolsWithLongGap=${result.summary.symbolsWithLongGap} ` +
        `(${result.summary.projectedRepairSymbols.join(', ')})`
    );
    process.exit(1);
  }
  const failOnUnverified = argv.includes('--fail-on-unverified-long-gap');
  if (failOnUnverified && result.summary.symbolsWithUnverifiedLongGap > 0) {
    console.error(
      `Readiness gate: symbolsWithUnverifiedLongGap=${result.summary.symbolsWithUnverifiedLongGap} ` +
        `(${result.summary.unverifiedLongGapSymbols.join(', ')})`
    );
    process.exit(1);
  }
}

main();
