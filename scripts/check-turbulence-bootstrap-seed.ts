/**
 * Read-only check: ci/bootstrap/turbulence.gates.json staleness vs CI fallback window.
 *
 * Exit codes:
 * - 0: healthy, or warning (approaching expiration)
 * - 1: failing or expired (refresh bootstrap before daily deploy breaks)
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const BOOTSTRAP_PATH = join(process.cwd(), 'ci', 'bootstrap', 'turbulence.gates.json');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

function getTodayUtc(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parse YYYY-MM-DD as UTC midnight; returns epoch ms. */
function utcDateMs(dateStr: string): number {
  const m = DATE_RE.exec(dateStr);
  if (!m) {
    throw new Error(`Invalid date (expected YYYY-MM-DD): ${dateStr}`);
  }
  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(5, 7));
  const day = Number(dateStr.slice(8, 10));
  return Date.UTC(year, month - 1, day);
}

function calendarDaysBetweenUtc(earlier: string, later: string): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((utcDateMs(later) - utcDateMs(earlier)) / msPerDay);
}

function isGateRowWithDate(x: unknown): x is { date: string } {
  if (x === null || typeof x !== 'object') return false;
  const d = (x as { date?: unknown }).date;
  return typeof d === 'string' && DATE_RE.test(d);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function main(): void {
  const maxStalenessDays = parsePositiveIntEnv('TURBULENCE_GATES_FALLBACK_MAX_STALENESS_DAYS', 120);
  const warningWindowDays = parsePositiveIntEnv('TURBULENCE_BOOTSTRAP_WARNING_DAYS', 30);
  const failureWindowDays = parsePositiveIntEnv('TURBULENCE_BOOTSTRAP_FAIL_DAYS', 14);

  const warnThresholdDays = maxStalenessDays - warningWindowDays;
  const failThresholdDays = maxStalenessDays - failureWindowDays;

  if (warnThresholdDays < 0 || failThresholdDays < 0) {
    fail(
      'Invalid threshold config: warning/failure windows exceed max_staleness_days. ' +
        `max=${maxStalenessDays} warning_window=${warningWindowDays} failure_window=${failureWindowDays}`
    );
  }

  if (!existsSync(BOOTSTRAP_PATH)) {
    fail(`Bootstrap seed missing: ${BOOTSTRAP_PATH}`);
  }

  let arr: unknown;
  try {
    arr = JSON.parse(readFileSync(BOOTSTRAP_PATH, 'utf-8')) as unknown;
  } catch (e) {
    fail(
      `Bootstrap seed is not valid JSON (${BOOTSTRAP_PATH}): ${
        e instanceof Error ? e.message : String(e)
      }`
    );
  }

  if (!Array.isArray(arr) || arr.length === 0) {
    fail(`Bootstrap seed must be a non-empty JSON array (${BOOTSTRAP_PATH})`);
  }

  const lastRow = arr[arr.length - 1];
  if (!isGateRowWithDate(lastRow)) {
    fail(`Bootstrap seed last row has no usable date field (${BOOTSTRAP_PATH})`);
  }

  const lastDate = lastRow.date;
  const todayUtc = getTodayUtc();
  const daysStale = calendarDaysBetweenUtc(lastDate, todayUtc);
  const daysUntilExpiry = maxStalenessDays - daysStale;

  let status: 'healthy' | 'warning' | 'failing' | 'expired';
  if (daysStale > maxStalenessDays) {
    status = 'expired';
  } else if (daysStale >= failThresholdDays) {
    status = 'failing';
  } else if (daysStale >= warnThresholdDays) {
    status = 'warning';
  } else {
    status = 'healthy';
  }

  console.log('=== turbulence bootstrap seed check ===');
  console.log('bootstrap_path:', BOOTSTRAP_PATH);
  console.log('bootstrap_points:', arr.length);
  console.log('last_date:', lastDate);
  console.log('today_utc:', todayUtc);
  console.log('days_stale:', daysStale);
  console.log('max_staleness_days:', maxStalenessDays);
  console.log('days_until_expiry:', daysUntilExpiry);
  console.log('warning_window_days:', warningWindowDays);
  console.log('failure_window_days:', failureWindowDays);
  console.log('warn_threshold_days:', warnThresholdDays);
  console.log('fail_threshold_days:', failThresholdDays);
  console.log('status:', status);

  const refreshHint =
    'Refresh ci/bootstrap/turbulence.gates.json in a separate ops PR when Stooq is reachable ' +
    '(regenerate synthetic series; do not run artifacts:refresh in this check).';

  if (status === 'expired') {
    console.error('');
    console.error(
      `❌ Bootstrap seed is EXPIRED: last_date ${lastDate} is ${daysStale} calendar days behind ` +
        `UTC today (max ${maxStalenessDays}). Daily Artifacts Deploy will fail on cold cache misses.`
    );
    console.error(refreshHint);
    process.exit(1);
  }

  if (status === 'failing') {
    console.error('');
    console.error(
      `❌ Bootstrap seed is FAILING: ${daysStale} days stale (${daysUntilExpiry} days until ` +
        `${maxStalenessDays}-day fallback window). Refresh before daily deploy breaks.`
    );
    console.error(refreshHint);
    process.exit(1);
  }

  if (status === 'warning') {
    console.warn('');
    console.warn(
      `⚠️  Bootstrap seed is aging: ${daysStale} days stale (${daysUntilExpiry} days until ` +
        `${maxStalenessDays}-day fallback window). Plan a refresh soon.`
    );
    console.warn(refreshHint);
    if (process.env.GITHUB_ACTIONS === 'true') {
      console.warn(
        `::warning title=Turbulence bootstrap seed aging::last_date=${lastDate} days_stale=${daysStale} days_until_expiry=${daysUntilExpiry}`
      );
    }
    process.exit(0);
  }

  console.log('');
  console.log(`✅ Bootstrap seed is healthy (${daysUntilExpiry} days until fallback window expires).`);
  process.exit(0);
}

main();
