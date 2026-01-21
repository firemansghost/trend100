/**
 * Snapshot verification
 * 
 * Simple verification that snapshot shape and values are correct.
 * Run this to ensure the data layer is working correctly.
 */

import { getLatestSnapshot } from './getLatestSnapshot';
import type { TrendStatus } from '../types';

const VALID_STATUSES: TrendStatus[] = ['GREEN', 'YELLOW', 'RED', 'UNKNOWN'];
const VALID_REGIMES = ['RISK_ON', 'TRANSITION', 'RISK_OFF'] as const;

export function verifySnapshot() {
  const snapshot = getLatestSnapshot();

  // Verify structure
  console.log('Verifying snapshot...');
  console.log(`asOfDate: ${snapshot.asOfDate}`);
  console.log(`universeSize: ${snapshot.universeSize}`);
  console.log(`tickers.length: ${snapshot.tickers.length}`);

  // Assertions
  if (snapshot.universeSize !== 100) {
    throw new Error(`Expected universeSize 100, got ${snapshot.universeSize}`);
  }

  if (snapshot.tickers.length !== 100) {
    throw new Error(`Expected 100 tickers, got ${snapshot.tickers.length}`);
  }

  // Verify all statuses are valid
  const invalidStatuses = snapshot.tickers.filter(
    (t) => !VALID_STATUSES.includes(t.status)
  );
  if (invalidStatuses.length > 0) {
    throw new Error(
      `Found ${invalidStatuses.length} tickers with invalid status`
    );
  }

  // Verify health summary
  const { health } = snapshot;
  if (!VALID_REGIMES.includes(health.regimeLabel)) {
    throw new Error(`Invalid regimeLabel: ${health.regimeLabel}`);
  }

  if (
    typeof health.greenPct !== 'number' ||
    typeof health.yellowPct !== 'number' ||
    typeof health.redPct !== 'number'
  ) {
    throw new Error('Health percentages must be numbers');
  }

  // Count status distribution
  const statusCounts = {
    GREEN: snapshot.tickers.filter((t) => t.status === 'GREEN').length,
    YELLOW: snapshot.tickers.filter((t) => t.status === 'YELLOW').length,
    RED: snapshot.tickers.filter((t) => t.status === 'RED').length,
    UNKNOWN: snapshot.tickers.filter((t) => t.status === 'UNKNOWN').length,
  };

  console.log('\nStatus distribution:');
  console.log(`  GREEN: ${statusCounts.GREEN}`);
  console.log(`  YELLOW: ${statusCounts.YELLOW}`);
  console.log(`  RED: ${statusCounts.RED}`);
  console.log(`  UNKNOWN: ${statusCounts.UNKNOWN}`);

  console.log('\nHealth summary:');
  console.log(`  Green: ${health.greenPct}%`);
  console.log(`  Yellow: ${health.yellowPct}%`);
  console.log(`  Red: ${health.redPct}%`);
  console.log(`  Regime: ${health.regimeLabel}`);

  console.log('\n✅ Snapshot verification passed!');
  return snapshot;
}
