/**
 * Verify artifacts - print stats for generated files
 * 
 * Prints point counts and date ranges for health history and EOD cache files.
 * Useful for debugging and verification.
 */

import './load-env';

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import type { TrendHealthHistoryPoint, TrendDeckId } from '../src/modules/trend100/types';
import { getAllDeckIds, getDeck } from '../src/modules/trend100/data/decks';
import { getMinKnownPctForDeck } from '../src/modules/trend100/data/deckConfig';
import { toSectionKey } from '../src/modules/trend100/data/sectionKey';
import { isWeekend, hasFullHealthSchema } from './healthHistorySanitize';

const PUBLIC_DIR = join(process.cwd(), 'public');
const EOD_CACHE_DIR = join(process.cwd(), 'data', 'marketstack', 'eod');

function getHealthHistoryRetentionDays(): number {
  const raw = process.env.HEALTH_HISTORY_RETENTION_DAYS;
  if (!raw || raw.trim() === '') return 0;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return 0;
  return Math.max(0, parsed);
}

/**
 * Print health history stats for a deck
 * Returns false if validation fails (weekend/partial points found)
 */
function printHealthHistoryStatsForFile(
  label: string,
  fileName: string,
  deckIdForConfig: TrendDeckId,
  requireExists: boolean
): boolean {
  const filePath = join(PUBLIC_DIR, fileName);
  if (!existsSync(filePath)) {
    if (requireExists) {
      console.error(`  ❌ ${label}: File not found (${fileName})`);
      return false;
    }
    console.log(`  ${label}: File not found`);
    return true;
  }
  
  try {
    const content = readFileSync(filePath, 'utf-8');
    const history = JSON.parse(content) as TrendHealthHistoryPoint[];
    if (!Array.isArray(history) || history.length === 0) {
      console.log(`  ${label}: Empty or invalid`);
      return true; // Not a validation failure
    }

    // PLUMBING requires sufficient depth for Market Health Over Time chart
    if (deckIdForConfig === 'PLUMBING' && history.length < 200) {
      console.error(
        `  ❌ ${label}: Too few points (${history.length}, need >= 200) - run artifacts:refresh with EOD cache`
      );
      return false;
    }

    // Validate: check for weekend points and partial-schema points
    const weekendPoints: string[] = [];
    const partialSchemaPoints: string[] = [];
    
    for (const point of history) {
      if (isWeekend(point.date)) {
        weekendPoints.push(point.date);
      }
      if (!hasFullHealthSchema(point)) {
        partialSchemaPoints.push(point.date);
      }
    }

    // Fail if weekend or partial points found
    if (weekendPoints.length > 0) {
      console.error(`  ❌ ${label}: Found ${weekendPoints.length} weekend point(s) (first: ${weekendPoints[0]})`);
      return false;
    }
    if (partialSchemaPoints.length > 0) {
      console.error(`  ❌ ${label}: Found ${partialSchemaPoints.length} partial-schema point(s) (first: ${partialSchemaPoints[0]})`);
      return false;
    }
    
    const earliest = history[0]!.date;
    const latest = history[history.length - 1]!.date;

    // PLUMBING: last date must be within 10 days (weekends/holidays)
    if (deckIdForConfig === 'PLUMBING') {
      const today = new Date().toISOString().split('T')[0]!;
      const lastDateObj = new Date(latest);
      const todayObj = new Date(today);
      const daysSinceLast = Math.floor(
        (todayObj.getTime() - lastDateObj.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceLast > 10) {
        console.error(
          `  ❌ ${label}: Stale (last date ${latest} is ${daysSinceLast} days ago, max 10)`
        );
        return false;
      }
    }

    const days = Math.ceil(
      (new Date(latest).getTime() - new Date(earliest).getTime()) / (1000 * 60 * 60 * 24)
    );
    
    // Check for warm-up issues (points with totalPct == 0) in a recent window.
    // With long-run retention, early "warm-up" zeros are expected and should not dominate the signal.
    const latestDateStr = history[history.length - 1]!.date;
    const windowDays = Math.max(1, parseInt(process.env.TREND100_WARMUP_CHECK_DAYS || '365', 10));
    const windowStart = new Date(latestDateStr);
    windowStart.setDate(windowStart.getDate() - windowDays);
    const windowStartStr = windowStart.toISOString().split('T')[0]!;
    const windowHistory = history.filter((p) => p.date >= windowStartStr);

    // Separate valid and UNKNOWN points
    const validPoints = history.filter((p) => p.greenPct !== null && p.regimeLabel !== 'UNKNOWN');
    const unknownPoints = history.filter((p) => p.regimeLabel === 'UNKNOWN' || p.greenPct === null);
    
    // Find earliest valid date
    let firstValidDate: string | null = null;
    for (const point of history) {
      if (point.greenPct !== null && point.regimeLabel !== 'UNKNOWN') {
        firstValidDate = point.date;
        break;
      }
    }
    
    // Check for warm-up issues in valid points only (recent window)
    const validWindowHistory = windowHistory.filter((p) => p.greenPct !== null && p.regimeLabel !== 'UNKNOWN');
    const zeroPoints = validWindowHistory.filter((p) => {
      const totalPct = (p.greenPct || 0) + (p.yellowPct || 0) + (p.redPct || 0);
      return totalPct === 0;
    });
    
    const zeroPct = validWindowHistory.length > 0 ? (zeroPoints.length / validWindowHistory.length) * 100 : 0;
    
    let status = '';
    if (zeroPct > 30 && validWindowHistory.length > 0) {
      status = ` ⚠️  ${zeroPct.toFixed(1)}% zero points (last ${windowDays}d, valid only)`;
    } else if (firstValidDate && firstValidDate > earliest) {
      const warmupDays = Math.ceil(
        (new Date(firstValidDate).getTime() - new Date(earliest).getTime()) / (1000 * 60 * 60 * 24)
      );
      status = ` (warm-up: ${warmupDays} days)`;
    }
    
    // Get per-deck minKnownPct
    const envDefault = parseFloat(process.env.TREND100_MIN_KNOWN_PCT || '0.9');
    const deckMinKnownPct = getMinKnownPctForDeck(deckIdForConfig, envDefault);
    
    // For MACRO, show eligible stats
    let eligibleStats = '';
    if (deckIdForConfig === 'MACRO' && validPoints.length > 0) {
      const recentValid = validPoints.slice(-365); // Last 365 valid points
      const eligibleCounts = recentValid
        .map((p) => p.eligibleCount ?? p.totalTickers ?? 0)
        .filter((c) => c > 0);
      if (eligibleCounts.length > 0) {
        const avgEligible = eligibleCounts.reduce((a, b) => a + b, 0) / eligibleCounts.length;
        eligibleStats = `, Avg eligible (last 365d): ${avgEligible.toFixed(1)}`;
      }
    }
    
    console.log(`  ${label}: ${history.length} points (${earliest} to ${latest}, ~${days} days)${status}`);
    console.log(`    Valid: ${validPoints.length}, UNKNOWN: ${unknownPoints.length}, MinKnownPct: ${deckMinKnownPct.toFixed(2)}${eligibleStats}`);
    if (firstValidDate && firstValidDate !== earliest) {
      console.log(`    First valid: ${firstValidDate}`);
    }
    
    return true; // Validation passed
  } catch (error) {
    console.log(`  ${label}: Error reading file: ${error}`);
    return false; // Error reading file is a failure
  }
}

function getGroupKeysForDeck(deckId: TrendDeckId): string[] {
  const deck = getDeck(deckId);
  const keys = new Set<string>();
  for (const item of deck.universe) {
    if (item.group) {
      keys.add(item.group.toLowerCase());
    }
  }
  return Array.from(keys).sort((a, b) => a.localeCompare(b));
}

function deckHasGroups(deckId: TrendDeckId): boolean {
  return getGroupKeysForDeck(deckId).length > 0;
}

/** Section keys for non-grouped decks with >=2 sections. */
function getSectionKeysForDeck(deckId: TrendDeckId): string[] {
  const deck = getDeck(deckId);
  if (deckHasGroups(deckId) || !deck.sections || deck.sections.length < 2) {
    return [];
  }
  return deck.sections.map((s) => toSectionKey(s.id)).sort((a, b) => a.localeCompare(b));
}

/**
 * Print EOD cache stats for a sample of symbols
 */
function printEodCacheStats(sampleSymbols?: string[]): void {
  if (!existsSync(EOD_CACHE_DIR)) {
    console.log('  EOD cache directory not found');
    return;
  }
  
  // If specific symbols requested, use those; otherwise sample from all files
  let files: string[];
  if (sampleSymbols && sampleSymbols.length > 0) {
    files = sampleSymbols
      .map((sym) => `${sym.replace(/\./g, '_')}.json`)
      .filter((f) => existsSync(join(EOD_CACHE_DIR, f)));
  } else {
    files = readdirSync(EOD_CACHE_DIR)
      .filter((f) => f.endsWith('.json'))
      .slice(0, 5);
  }
  
  if (files.length === 0) {
    console.log('  No EOD cache files found');
    return;
  }
  
  const cacheDays = parseInt(process.env.MARKETSTACK_CACHE_DAYS || '2300', 10);
  const limitedHistoryAllowlist = new Set<string>(['FBTC', 'FETH']);
  
  for (const file of files) {
    const filePath = join(EOD_CACHE_DIR, file);
    try {
      const content = readFileSync(filePath, 'utf-8');
      const bars = JSON.parse(content) as Array<{ date: string; close: number }>;
      if (!Array.isArray(bars) || bars.length === 0) {
        console.log(`  ${file}: Empty or invalid`);
        continue;
      }
      
      const symbol = file.replace('.json', '').replace(/_/g, '.');
      const earliest = bars[0]!.date;
      const latest = bars[bars.length - 1]!.date;
      const days = Math.ceil(
        (new Date(latest).getTime() - new Date(earliest).getTime()) / (1000 * 60 * 60 * 24)
      );
      
      const bufferDays = 10;
      const needsExtension = days < (cacheDays - bufferDays);

      // Heuristic: treat some symbols as legitimately limited history (inception),
      // so we don't warn forever.
      //
      // Rules:
      // - Explicit allowlist (FBTC, FETH)
      // - OR if it has "enough" bars already (>=250) and earliest is within ~15 months of today,
      //   assume inception-limited (extension likely won't go earlier).
      const today = new Date();
      const earliestDate = new Date(earliest);
      const inceptionLikely =
        limitedHistoryAllowlist.has(symbol) ||
        (bars.length >= 250 &&
          Math.ceil((today.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24)) <= 460);

      const status = needsExtension
        ? inceptionLikely
          ? ' ℹ️  (limited history: inception)'
          : ' ⚠️  (needs extension)'
        : '';
      console.log(`  ${symbol}: ${bars.length} bars (${earliest} to ${latest}, ~${days} days${status})`);
    } catch (error) {
      console.log(`  ${file}: Error reading file: ${error}`);
    }
  }
  
  if (!sampleSymbols || sampleSymbols.length === 0) {
    const allFiles = readdirSync(EOD_CACHE_DIR).filter((f) => f.endsWith('.json'));
    if (allFiles.length > files.length) {
      console.log(`  ... and ${allFiles.length - files.length} more files`);
    }
  }
}

interface TurbulenceGatePoint {
  date: string;
  spx: number | null;
  spx50dma: number | null;
  spxAbove50dma: boolean | null;
  vix: number | null;
  vixBelow25: boolean | null;
}

function printTurbulenceGatesStats(): boolean {
  const filePath = join(PUBLIC_DIR, 'turbulence.gates.json');
  if (!existsSync(filePath)) {
    console.error('  ❌ turbulence.gates.json: File not found');
    return false;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const points = JSON.parse(content) as unknown;
    if (!Array.isArray(points)) {
      console.error('  ❌ turbulence.gates.json: Not an array');
      return false;
    }

    const arr = points as TurbulenceGatePoint[];
    if (arr.length < 250) {
      console.error(`  ❌ turbulence.gates.json: Too few points (${arr.length}, need >= 250)`);
      return false;
    }

    for (let i = 1; i < arr.length; i++) {
      if (arr[i]!.date <= arr[i - 1]!.date) {
        console.error(`  ❌ turbulence.gates.json: Not sorted ascending (${arr[i - 1]!.date} vs ${arr[i]!.date})`);
        return false;
      }
    }

    const lastDate = arr[arr.length - 1]!.date;
    const today = new Date().toISOString().split('T')[0]!;
    const lastDateObj = new Date(lastDate);
    const todayObj = new Date(today);
    const daysSinceLast = Math.floor((todayObj.getTime() - lastDateObj.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceLast > 10) {
      console.error(
        `  ❌ turbulence.gates.json: Stale (last date ${lastDate} is ${daysSinceLast} days ago, max 10)`
      );
      return false;
    }
    if (daysSinceLast > 3) {
      console.warn(
        `  ⚠️  turbulence.gates.json: lastDate=${lastDate}, ageDays=${daysSinceLast} (using last-known-good)`
      );
    }

    let hasSpx50dma = false;
    for (const p of arr) {
      if (p.spx === null && p.spxAbove50dma !== null) {
        console.error(`  ❌ turbulence.gates.json: spx null but spxAbove50dma non-null at ${p.date}`);
        return false;
      }
      if (p.spx50dma === null && p.spxAbove50dma !== null) {
        console.error(`  ❌ turbulence.gates.json: spx50dma null but spxAbove50dma non-null at ${p.date}`);
        return false;
      }
      if (p.vix === null && p.vixBelow25 !== null) {
        console.error(`  ❌ turbulence.gates.json: vix null but vixBelow25 non-null at ${p.date}`);
        return false;
      }
      if (p.spx50dma !== null) hasSpx50dma = true;
    }
    if (!hasSpx50dma) {
      console.error('  ❌ turbulence.gates.json: No non-null spx50dma (compute broken)');
      return false;
    }

    const first = arr[0]!.date;
    const last = arr[arr.length - 1]!.date;
    const lastP = arr[arr.length - 1]!;
    console.log(`  turbulence.gates.json: ${arr.length} points (${first} to ${last})`);
    console.log(`    lastDate=${last}, ageDays=${daysSinceLast}`);
    console.log(`    Last: spx=${lastP.spx ?? 'null'}, spx50dma=${lastP.spx50dma ?? 'null'}, spxAbove50dma=${lastP.spxAbove50dma ?? 'null'}, vix=${lastP.vix ?? 'null'}, vixBelow25=${lastP.vixBelow25 ?? 'null'}`);
    return true;
  } catch (error) {
    console.error(`  turbulence.gates.json: Error - ${error}`);
    return false;
  }
}

interface TurbulenceShockPoint {
  date: string;
  nAssets: number;
  nPairs: number;
  shockRaw: number | null;
  shockZ: number | null;
}

function printTurbulenceShockStats(): boolean {
  const filePath = join(PUBLIC_DIR, 'turbulence.shock.json');
  if (!existsSync(filePath)) {
    console.error('  ❌ turbulence.shock.json: File not found');
    return false;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const points = JSON.parse(content) as unknown;
    if (!Array.isArray(points)) {
      console.error('  ❌ turbulence.shock.json: Not an array');
      return false;
    }

    const arr = points as TurbulenceShockPoint[];
    if (arr.length < 250) {
      console.error(`  ❌ turbulence.shock.json: Too few points (${arr.length}, need >= 250)`);
      return false;
    }

    for (let i = 1; i < arr.length; i++) {
      if (arr[i]!.date <= arr[i - 1]!.date) {
        console.error(`  ❌ turbulence.shock.json: Not sorted ascending (${arr[i - 1]!.date} vs ${arr[i]!.date})`);
        return false;
      }
    }

    const lastDate = arr[arr.length - 1]!.date;
    const today = new Date().toISOString().split('T')[0]!;
    const lastDateObj = new Date(lastDate);
    const todayObj = new Date(today);
    const daysSinceLast = Math.floor((todayObj.getTime() - lastDateObj.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceLast > 7) {
      console.error(`  ❌ turbulence.shock.json: Stale (last date ${lastDate} is ${daysSinceLast} days ago, max 7)`);
      return false;
    }

    for (const p of arr) {
      if (typeof p.date !== 'string' || typeof p.nAssets !== 'number' || typeof p.nPairs !== 'number') {
        console.error(`  ❌ turbulence.shock.json: Missing or invalid keys at ${p.date}`);
        return false;
      }
      if (p.shockRaw != null && p.nPairs !== (p.nAssets * (p.nAssets - 1)) / 2) {
        console.error(`  ❌ turbulence.shock.json: nPairs inconsistent with nAssets at ${p.date} (nPairs=${p.nPairs}, expected=${(p.nAssets * (p.nAssets - 1)) / 2})`);
        return false;
      }
    }

    const hasShockRaw = arr.some((p) => p.shockRaw != null);
    const hasShockZ = arr.some((p) => p.shockZ != null);
    if (!hasShockRaw) {
      console.error('  ❌ turbulence.shock.json: No non-null shockRaw (compute broken or minAssets not met)');
      return false;
    }
    const lastShockP = arr[arr.length - 1]!;
    if (lastShockP.shockRaw === null) {
      console.error(`  ❌ turbulence.shock.json: Last row (${lastShockP.date}) must have non-null shockRaw (output should be trimmed to last computed date)`);
      return false;
    }
    if (!hasShockZ && arr.length >= 360) {
      console.warn('  ⚠️  turbulence.shock.json: No non-null shockZ (insufficient trailing window?)');
    }

    const nullRawCount = arr.filter((p) => p.shockRaw === null).length;
    const nullZCount = arr.filter((p) => p.shockZ === null).length;
    const pctNullRaw = arr.length > 0 ? (nullRawCount / arr.length) * 100 : 0;
    const pctNullZ = arr.length > 0 ? (nullZCount / arr.length) * 100 : 0;
    if (pctNullRaw > 50 || pctNullZ > 80) {
      console.warn(`  ⚠️  turbulence.shock.json: High nulls (shockRaw: ${pctNullRaw.toFixed(1)}%, shockZ: ${pctNullZ.toFixed(1)}%) - check minAssets/windows`);
    }

    const first = arr[0]!.date;
    const last = arr[arr.length - 1]!.date;
    console.log(`  turbulence.shock.json: ${arr.length} points (${first} to ${last})`);
    console.log(`    Last: nAssets=${lastShockP.nAssets}, nPairs=${lastShockP.nPairs}, shockRaw=${lastShockP.shockRaw ?? 'null'}, shockZ=${lastShockP.shockZ ?? 'null'}`);
    return true;
  } catch (error) {
    console.error(`  turbulence.shock.json: Error - ${error}`);
    return false;
  }
}

interface TurbulenceGreenBarPoint {
  date: string;
  shockZ: number | null;
  shockRaw: number | null;
  spxAbove50dma: boolean | null;
  vixBelow25: boolean | null;
  isGreenBar: boolean | null;
}

function printTurbulenceGreenBarStats(): boolean {
  const filePath = join(PUBLIC_DIR, 'turbulence.greenbar.json');
  if (!existsSync(filePath)) {
    console.error('  ❌ turbulence.greenbar.json: File not found');
    return false;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const points = JSON.parse(content) as unknown;
    if (!Array.isArray(points)) {
      console.error('  ❌ turbulence.greenbar.json: Not an array');
      return false;
    }

    const arr = points as TurbulenceGreenBarPoint[];
    if (arr.length < 250) {
      console.error(`  ❌ turbulence.greenbar.json: Too few points (${arr.length}, need >= 250)`);
      return false;
    }

    for (let i = 1; i < arr.length; i++) {
      if (arr[i]!.date <= arr[i - 1]!.date) {
        console.error(`  ❌ turbulence.greenbar.json: Not sorted ascending (${arr[i - 1]!.date} vs ${arr[i]!.date})`);
        return false;
      }
    }

    const lastDate = arr[arr.length - 1]!.date;
    const today = new Date().toISOString().split('T')[0]!;
    const lastDateObj = new Date(lastDate);
    const todayObj = new Date(today);
    const daysSinceLast = Math.floor((todayObj.getTime() - lastDateObj.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceLast > 7) {
      console.error(`  ❌ turbulence.greenbar.json: Stale (last date ${lastDate} is ${daysSinceLast} days ago, max 7)`);
      return false;
    }

    for (const p of arr) {
      const gatesMissing = p.spxAbove50dma == null || p.vixBelow25 == null;
      if (gatesMissing && p.isGreenBar !== null) {
        console.error(`  ❌ turbulence.greenbar.json: When gates missing at ${p.date}, isGreenBar must be null`);
        return false;
      }
      if (!gatesMissing && typeof p.isGreenBar !== 'boolean') {
        console.error(`  ❌ turbulence.greenbar.json: When gates present at ${p.date}, isGreenBar must be boolean`);
        return false;
      }
    }

    const hasValidRow = arr.some(
      (p) =>
        p.shockZ != null &&
        (p.spxAbove50dma != null || p.vixBelow25 != null)
    );
    if (!hasValidRow) {
      console.error('  ❌ turbulence.greenbar.json: No row with shockZ and gates non-null');
      return false;
    }

    const lastGreenBarP = arr[arr.length - 1]!;
    if (lastGreenBarP.shockRaw === null) {
      console.error(`  ❌ turbulence.greenbar.json: Last row (${lastGreenBarP.date}) must have non-null shockRaw (aligned to last computed shock date)`);
      return false;
    }

    const countGreenBars = arr.filter((p) => p.isGreenBar === true).length;
    const pendingGatesCount = arr.filter((p) => p.isGreenBar === null).length;
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oneYearAgoStr = oneYearAgo.toISOString().split('T')[0]!;
    const countGreenBarsLast365 = arr.filter((p) => p.isGreenBar === true && p.date >= oneYearAgoStr).length;
    const lastGreenBar = [...arr].reverse().find((p) => p.isGreenBar === true);
    const lastP = arr[arr.length - 1]!;

    console.log(`  turbulence.greenbar.json: ${arr.length} points (${arr[0]!.date} to ${lastP.date})`);
    console.log(`    Green bars: ${countGreenBars} all-time, ${countGreenBarsLast365} last 365d`);
    console.log(`    Last green bar: ${lastGreenBar?.date ?? 'none'}`);
    console.log(`    Rows with pending gates (isGreenBar null): ${pendingGatesCount}`);
    console.log(`    Last: shockZ=${lastP.shockZ ?? 'null'}, spxAbove50dma=${lastP.spxAbove50dma ?? 'null'}, vixBelow25=${lastP.vixBelow25 ?? 'null'}, isGreenBar=${lastP.isGreenBar ?? 'null'}`);
    return true;
  } catch (error) {
    console.error(`  turbulence.greenbar.json: Error - ${error}`);
    return false;
  }
}

const PLUMBING_ASOF_MAX_DAYS = 10;

function printPlumbingWarLieDetectorStats(): boolean {
  const filePath = join(PUBLIC_DIR, 'plumbing.war_lie_detector.json');
  if (!existsSync(filePath)) {
    console.error('  ❌ plumbing.war_lie_detector.json: File not found');
    return false;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content) as unknown;
    if (typeof data !== 'object' || data === null) {
      console.error('  ❌ plumbing.war_lie_detector.json: Invalid JSON');
      return false;
    }

    const obj = data as Record<string, unknown>;
    const asOf = obj.asOf;
    if (typeof asOf !== 'string') {
      console.error('  ❌ plumbing.war_lie_detector.json: Missing or invalid asOf');
      return false;
    }

    const today = new Date().toISOString().split('T')[0]!;
    const lastDateObj = new Date(asOf);
    const todayObj = new Date(today);
    const daysSinceLast = Math.floor((todayObj.getTime() - lastDateObj.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceLast > PLUMBING_ASOF_MAX_DAYS) {
      console.error(
        `  ❌ plumbing.war_lie_detector.json: Stale (asOf ${asOf} is ${daysSinceLast} days ago, max ${PLUMBING_ASOF_MAX_DAYS})`
      );
      return false;
    }

    const label = obj.label;
    if (!['THEATER', 'WATCH', 'REAL_RISK'].includes(String(label))) {
      console.error(`  ❌ plumbing.war_lie_detector.json: Invalid label "${label}"`);
      return false;
    }

    const latest = obj.latest as Record<string, unknown> | undefined;
    if (!latest || typeof latest !== 'object') {
      console.error('  ❌ plumbing.war_lie_detector.json: Missing latest');
      return false;
    }
    const spread = latest.spread;
    const spreadZ30 = latest.spread_z30;
    const spreadRoc3 = latest.spread_roc3;
    if (typeof spread !== 'number' || !Number.isFinite(spread)) {
      console.error('  ❌ plumbing.war_lie_detector.json: latest.spread must be finite number');
      return false;
    }
    if (typeof spreadZ30 !== 'number' || !Number.isFinite(spreadZ30)) {
      console.error('  ❌ plumbing.war_lie_detector.json: latest.spread_z30 must be finite number');
      return false;
    }
    if (typeof spreadRoc3 !== 'number' || !Number.isFinite(spreadRoc3)) {
      console.error('  ❌ plumbing.war_lie_detector.json: latest.spread_roc3 must be finite number');
      return false;
    }

    const score = obj.score;
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 3) {
      console.error(
        `  ❌ plumbing.war_lie_detector.json: score must be finite number in [0,3], got ${score}`
      );
      return false;
    }

    const history = obj.history;
    if (!Array.isArray(history)) {
      console.error('  ❌ plumbing.war_lie_detector.json: history must be array');
      return false;
    }
    if (history.length < 60) {
      console.error(
        `  ❌ plumbing.war_lie_detector.json: history too short (${history.length}, need >= 60)`
      );
      return false;
    }
    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1] as { date?: string };
      const curr = history[i] as { date?: string };
      if (curr?.date && prev?.date && curr.date <= prev.date) {
        console.error(`  ❌ plumbing.war_lie_detector.json: history not sorted ascending (${prev.date} vs ${curr.date})`);
        return false;
      }
    }

    const labelHistory = obj.labelHistory;
    if (labelHistory != null) {
      if (!Array.isArray(labelHistory)) {
        console.error('  ❌ plumbing.war_lie_detector.json: labelHistory must be array if present');
        return false;
      }
      if (labelHistory.length === 0) {
        console.error('  ❌ plumbing.war_lie_detector.json: labelHistory must be non-empty if present');
        return false;
      }
      for (let i = 1; i < labelHistory.length; i++) {
        const prev = labelHistory[i - 1] as { date?: string };
        const curr = labelHistory[i] as { date?: string };
        if (curr?.date && prev?.date && curr.date <= prev.date) {
          console.error(
            `  ❌ plumbing.war_lie_detector.json: labelHistory not sorted ascending (${prev.date} vs ${curr.date})`
          );
          return false;
        }
      }
    }

    const lastH = history[history.length - 1] as { date?: string } | undefined;
    console.log(`  plumbing.war_lie_detector.json: asOf=${asOf}, label=${label}, score=${obj.score ?? '?'}`);
    console.log(`    Latest: spread=${spread}, spread_z30=${spreadZ30}, history=${history.length} points`);
    if (lastH?.date) {
      console.log(`    Last history date: ${lastH.date}`);
    }
    return true;
  } catch (error) {
    console.error(`  plumbing.war_lie_detector.json: Error - ${error}`);
    return false;
  }
}

function printSnapshotPlumbingStats(): boolean {
  const filePath = join(PUBLIC_DIR, 'snapshot.PLUMBING.json');
  if (!existsSync(filePath)) {
    console.error('  ❌ snapshot.PLUMBING.json: File not found');
    return false;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content) as unknown;
    if (typeof data !== 'object' || data === null) {
      console.error('  ❌ snapshot.PLUMBING.json: Invalid JSON');
      return false;
    }

    const obj = data as Record<string, unknown>;
    const universeSize = obj.universeSize;
    if (typeof universeSize !== 'number' || universeSize !== 6) {
      console.error(
        `  ❌ snapshot.PLUMBING.json: universeSize must be 6, got ${universeSize}`
      );
      return false;
    }

    const asOfDate = obj.asOfDate;
    if (typeof asOfDate !== 'string') {
      console.error('  ❌ snapshot.PLUMBING.json: Missing or invalid asOfDate');
      return false;
    }
    const today = new Date().toISOString().split('T')[0]!;
    const asOfObj = new Date(asOfDate);
    const todayObj = new Date(today);
    const daysSince = Math.floor(
      (todayObj.getTime() - asOfObj.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSince > PLUMBING_ASOF_MAX_DAYS) {
      console.error(
        `  ❌ snapshot.PLUMBING.json: Stale (asOfDate ${asOfDate} is ${daysSince} days ago, max ${PLUMBING_ASOF_MAX_DAYS})`
      );
      return false;
    }

    const runDate = obj.runDate;
    console.log(
      `  snapshot.PLUMBING.json: universeSize=${universeSize}, asOfDate=${asOfDate}, runDate=${runDate ?? '?'}`
    );
    return true;
  } catch (error) {
    console.error(`  snapshot.PLUMBING.json: Error - ${error}`);
    return false;
  }
}

/**
 * Main function
 */
function main() {
  console.log('📊 Artifact Verification Report\n');
  
  const hhRetentionDays = getHealthHistoryRetentionDays();
  console.log(
    `Health-history retention: ${hhRetentionDays === 0 ? 'none (retain all)' : `${hhRetentionDays} days`}\n`
  );

  console.log('Health History Files:');
  const deckIds = getAllDeckIds();
  let validationFailed = false;
  for (const deckId of deckIds) {
    const groupKeys = getGroupKeysForDeck(deckId);
    const sectionKeys = getSectionKeysForDeck(deckId);

    // Always validate the base (ALL) file. Require it if deck has group or section variants, or PLUMBING.
    const requireBase =
      groupKeys.length > 0 || sectionKeys.length > 0 || deckId === 'PLUMBING';
    const baseOk = printHealthHistoryStatsForFile(
      deckId,
      `health-history.${deckId}.json`,
      deckId,
      requireBase
    );
    if (!baseOk) validationFailed = true;

    // For grouped decks, require and validate per-group series files.
    if (groupKeys.length > 0) {
      for (const key of groupKeys) {
        const label = `${deckId}.${key}`;
        const ok = printHealthHistoryStatsForFile(
          label,
          `health-history.${deckId}.${key}.json`,
          deckId,
          true
        );
        if (!ok) validationFailed = true;
      }
    }

    // For non-grouped decks with multiple sections, require and validate per-section series files.
    if (sectionKeys.length > 0) {
      for (const key of sectionKeys) {
        const label = `${deckId}.${key}`;
        const ok = printHealthHistoryStatsForFile(
          label,
          `health-history.${deckId}.${key}.json`,
          deckId,
          true
        );
        if (!ok) validationFailed = true;
      }
    }
  }
  
  if (validationFailed) {
    console.error('\n❌ Validation failed: weekend or partial-schema points found in health history');
    process.exit(1);
  }

  console.log('\nTurbulence Gates:');
  const gatesOk = printTurbulenceGatesStats();
  if (!gatesOk) {
    console.error('\n❌ Validation failed: turbulence.gates.json invalid or stale');
    process.exit(1);
  }

  console.log('\nTurbulence Shock:');
  const shockOk = printTurbulenceShockStats();
  if (!shockOk) {
    console.error('\n❌ Validation failed: turbulence.shock.json invalid or stale');
    process.exit(1);
  }

  console.log('\nTurbulence Green Bar:');
  const greenBarOk = printTurbulenceGreenBarStats();
  if (!greenBarOk) {
    console.error('\n❌ Validation failed: turbulence.greenbar.json invalid or stale');
    process.exit(1);
  }

  console.log('\nPLUMBING Artifacts:');
  const snapshotPlumbingOk = printSnapshotPlumbingStats();
  if (!snapshotPlumbingOk) {
    console.error('\n❌ Validation failed: snapshot.PLUMBING.json invalid or stale');
    process.exit(1);
  }
  const plumbingOk = printPlumbingWarLieDetectorStats();
  if (!plumbingOk) {
    console.error('\n❌ Validation failed: plumbing.war_lie_detector.json invalid or stale');
    process.exit(1);
  }
  
  console.log('\nEOD Cache Files (sample: SPY, QQQ, TLT, GLDM, FBTC):');
  printEodCacheStats(['SPY', 'QQQ', 'TLT', 'GLDM', 'FBTC']);
  
  console.log('');
}

main();
