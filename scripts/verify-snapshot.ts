/**
 * Script to verify snapshot data layer
 * 
 * Run with: pnpm exec tsx scripts/verify-snapshot.ts
 */

import { verifySnapshot } from '../src/modules/trend100/data/verifySnapshot';

verifySnapshot();
