/**
 * Update plumbing war lie detector artifact
 *
 * Computes a geopolitical plumbing indicator: BNO/USO ratio (Brent vs WTI proxy),
 * GLD/SPY and GLD/TIP ratios for gold confirmation, z-scores and ROC.
 * Output: public/plumbing.war_lie_detector.json
 *
 * Uses EOD cache; requires BNO, USO, GLD, SPY, TIP, UUP.
 * Run update:snapshots first to populate BNO (added to MACRO deck).
 */

import './load-env';

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { EodBar } from '../src/modules/trend100/data/providers/marketstack';
import { fetchStooqEodSeries } from './stooq-eod';

const EOD_CACHE_DIR = join(process.cwd(), 'data', 'marketstack', 'eod');
const SYMBOLS = ['BNO', 'USO', 'GLD', 'SPY', 'TIP', 'UUP'] as const;
const MIN_BARS = 60;
const HISTORY_DAYS = 90;
const LABELS = ['THEATER', 'WATCH', 'REAL_RISK'] as const;
type PlumbingLabel = (typeof LABELS)[number];

interface PlumbingHistoryPoint {
  date: string;
  spread: number;
  bno_uso_ratio: number;
  spread_ma5: number;
  gld_spy_ratio: number;
}

interface PlumbingLabelHistoryPoint {
  date: string;
  label: PlumbingLabel;
  score: number;
}

interface PlumbingInputsLast {
  BNO: string;
  USO: string;
  GLD: string;
  SPY: string;
  TIP: string;
  UUP: string;
}

interface PlumbingDataFreshness {
  minLastDate: string;
  maxLastDate: string;
  lagTradingDays?: number;
  laggingTickers: string[];
}

interface PlumbingWarLieDetector {
  asOf: string;
  inputsLast?: PlumbingInputsLast;
  dataFreshness?: PlumbingDataFreshness;
  inputs: {
    brentProxy: string;
    wtiProxy: string;
    goldProxy: string;
    riskProxy: string;
    tipsProxy: string;
    dxyProxy: string;
  };
  latest: {
    bno: number;
    uso: number;
    spread: number;
    bno_uso_ratio: number;
    spread_ma5: number;
    spread_roc3: number;
    spread_z30: number;
    spread_z60: number;
    gld: number;
    gld_spy_ratio: number;
    gld_spy_roc5: number;
    gld_tip_ratio: number;
    gld_tip_roc5: number;
  };
  signals: {
    spreadWatch: boolean;
    spreadActive: boolean;
    goldConfirm: boolean;
  };
  score: number;
  label: PlumbingLabel;
  trajectory?: {
    state: 'ESCALATING' | 'HOLDING' | 'EASING';
    reason: string;
    phase: 'RISING' | 'FLAT' | 'EASING';
  };
  energyBreadth?: {
    state: 'NARROW' | 'BROADENING' | 'FULL_STRESS';
    reason: string;
  };
  energyComplex?: {
    natGas?: { ticker: 'UNG'; asOf: string; roc3: number; z30: number; active: boolean };
    coal?: { ticker: 'COAL'; asOf: string; roc3: number; z30: number; active: boolean };
  };
  /** Optional bucket state for v2 regime logic. Exposed for future PR26 bucket chips. */
  bucketState?: {
    physicalPlumbing: 'low' | 'watch' | 'strong';
    substitutionActive: boolean;
    macroConfirm: boolean;
  };
  history: PlumbingHistoryPoint[];
  labelHistory: PlumbingLabelHistoryPoint[];
}

/** Bucket state for v2 regime logic. Physical Plumbing = anchor; Substitution = spread; Macro = supportive. */
interface BucketState {
  physicalPlumbing: 'low' | 'watch' | 'strong';
  substitutionActive: boolean;
  macroConfirm: boolean;
}

/** Compute bucket state from artifact. Requires energyComplex for substitution. */
function computeBucketState(
  spreadZ30: number,
  goldConfirm: boolean,
  energyComplex: PlumbingWarLieDetector['energyComplex']
): BucketState {
  const physicalPlumbing: BucketState['physicalPlumbing'] =
    !Number.isFinite(spreadZ30) || spreadZ30 < 1 ? 'low' : spreadZ30 >= 2 ? 'strong' : 'watch';
  const gasActive = energyComplex?.natGas?.active === true;
  const coalActive = energyComplex?.coal?.active === true;
  const substitutionActive = gasActive || coalActive;
  return {
    physicalPlumbing,
    substitutionActive,
    macroConfirm: goldConfirm,
  };
}

/** Regime from bucket state (v2 plumbing-first). CONTAINED maps to THEATER for now. */
function computeRegimeFromBuckets(bucketState: BucketState): PlumbingLabel {
  if (bucketState.physicalPlumbing === 'low') return 'THEATER';
  if (
    bucketState.physicalPlumbing === 'strong' &&
    (bucketState.substitutionActive || bucketState.macroConfirm)
  ) {
    return 'REAL_RISK';
  }
  return 'WATCH';
}

/** Historical regime: plumbing+macro only (no energyComplex per day). Plumbing-first. */
function computeRegimeFromBucketsHistorical(z30: number, goldConfirm: boolean): PlumbingLabel {
  const physicalPlumbing: BucketState['physicalPlumbing'] =
    !Number.isFinite(z30) || z30 < 1 ? 'low' : z30 >= 2 ? 'strong' : 'watch';
  if (physicalPlumbing === 'low') return 'THEATER';
  if (physicalPlumbing === 'strong' && goldConfirm) return 'REAL_RISK';
  return 'WATCH';
}

/** Phase from roc3: RISING >= 0.5%, EASING <= -0.5%, FLAT otherwise. */
function getPhase(roc3: number): 'RISING' | 'FLAT' | 'EASING' {
  if (roc3 >= 0.5) return 'RISING';
  if (roc3 <= -0.5) return 'EASING';
  return 'FLAT';
}

/** Compute trajectory state and reason from artifact signals. */
function computeTrajectory(artifact: PlumbingWarLieDetector): PlumbingWarLieDetector['trajectory'] {
  const { label, signals, latest, energyComplex } = artifact;
  const phase = getPhase(latest.spread_roc3);
  const natGasActive = energyComplex?.natGas?.active === true;

  const escalating =
    label === 'REAL_RISK' ||
    signals.goldConfirm === true ||
    natGasActive ||
    (phase === 'RISING' && latest.spread_z30 >= 2);

  const easing =
    phase === 'EASING' &&
    signals.goldConfirm === false &&
    !natGasActive &&
    latest.spread_z30 < 2;

  const state: 'ESCALATING' | 'HOLDING' | 'EASING' = escalating ? 'ESCALATING' : easing ? 'EASING' : 'HOLDING';

  let reason: string;
  if (state === 'ESCALATING') {
    if (label === 'REAL_RISK' || (signals.goldConfirm && latest.spread_z30 >= 2)) {
      reason = 'Stress is broadening beyond oil.';
    } else if (natGasActive || signals.goldConfirm) {
      reason = 'Confirms are active; stress is broadening.';
    } else {
      reason = 'Oil stress is present, but confirms are limited.';
    }
  } else if (state === 'EASING') {
    reason = 'Pressure is cooling and confirms are fading.';
  } else {
    reason = 'Stress is present, but not clearly broadening yet.';
  }

  return { state, reason, phase };
}

/** Compute energy breadth: NARROW | BROADENING | FULL_STRESS. (Easing/cooling is Trajectory.) */
function computeEnergyBreadth(artifact: PlumbingWarLieDetector): PlumbingWarLieDetector['energyBreadth'] {
  const { signals, latest, trajectory, energyComplex } = artifact;
  const oilStress = latest.spread_z30 >= 1;
  const gasActive = energyComplex?.natGas?.active === true;
  const coalActive = energyComplex?.coal?.active === true;
  const gasOrCoalActive = gasActive || coalActive;
  const phase = trajectory?.phase ?? getPhase(latest.spread_roc3);
  const oilEasing = phase === 'EASING' || phase === 'FLAT';

  if (oilStress && signals.goldConfirm && gasOrCoalActive) {
    return {
      state: 'FULL_STRESS',
      reason: 'Oil, macro fear, and wider energy stress are all confirming.',
    };
  }
  if (oilStress && gasOrCoalActive) {
    return {
      state: 'BROADENING',
      reason: 'Stress is spreading beyond crude into the wider energy complex.',
    };
  }
  if (oilStress && !gasOrCoalActive && !signals.goldConfirm) {
    return {
      state: 'NARROW',
      reason: 'Stress is still mostly confined to oil.',
    };
  }
  if (oilEasing && !gasOrCoalActive && !signals.goldConfirm) {
    return { state: 'NARROW', reason: 'Stress is mostly confined to oil.' };
  }
  return {
    state: oilStress ? 'BROADENING' : 'NARROW',
    reason: oilStress ? 'Stress is present, but confirms are mixed.' : 'Stress is still mostly confined to oil.',
  };
}

function loadEodCache(symbol: string): EodBar[] | null {
  const fileName = `${symbol.replace(/\./g, '_')}.json`;
  const filePath = join(EOD_CACHE_DIR, fileName);
  if (!existsSync(filePath)) return null;
  try {
    const content = readFileSync(filePath, 'utf-8');
    const bars = JSON.parse(content) as EodBar[];
    if (!Array.isArray(bars)) return null;
    return bars.sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return null;
  }
}

/** Compute roc3, z30, active for a single-ticker series. z30 = z-score of last 30 ROC3 values. */
function computeEnergySignal(
  bars: EodBar[],
  wldAsOf: string,
  ticker: 'UNG' | 'COAL',
  roc3ActiveThreshold: number,
  z30ActiveThreshold: number
): { ticker: 'UNG' | 'COAL'; asOf: string; roc3: number; z30: number; active: boolean } | null {
  if (bars.length < 34) return null; // need 3 for roc3 + 30 for z30
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  const lastDate = sorted[sorted.length - 1]!.date;
  if (lastDate > wldAsOf) return null; // energy data ahead of WLD asOf
  const idx = sorted.findIndex((b) => b.date === lastDate);
  if (idx < 33) return null;
  const close = sorted.map((b) => b.close);
  const roc3Arr: number[] = [];
  for (let i = 3; i < close.length; i++) {
    if (close[i - 3]! > 0) {
      roc3Arr.push(((close[i]! - close[i - 3]!) / close[i - 3]!) * 100);
    } else {
      roc3Arr.push(NaN);
    }
  }
  const lastRoc3 = roc3Arr[roc3Arr.length - 1];
  if (!Number.isFinite(lastRoc3)) return null;
  const win30 = roc3Arr.slice(-30).filter(Number.isFinite);
  if (win30.length < 20) return null;
  const mean = win30.reduce((a, b) => a + b, 0) / win30.length;
  const variance = win30.reduce((a, b) => a + (b - mean) ** 2, 0) / win30.length;
  const std = Math.sqrt(variance) || 1e-10;
  const z30 = (lastRoc3 - mean) / std;
  const active =
    (Number.isFinite(z30) && z30 >= z30ActiveThreshold) ||
    (Number.isFinite(lastRoc3) && lastRoc3 >= roc3ActiveThreshold);
  return {
    ticker,
    asOf: lastDate,
    roc3: Math.round(lastRoc3 * 100) / 100,
    z30: Math.round(z30 * 100) / 100,
    active,
  };
}

/** Try Stooq first, then Marketstack EOD cache. Returns bars or null. */
async function fetchEnergyBars(symbol: string, startDate: string, endDate: string): Promise<EodBar[] | null> {
  try {
    return await fetchStooqEodSeries(symbol, startDate, endDate);
  } catch {
    const bars = loadEodCache(symbol);
    if (bars && bars.length >= 34) {
      const filtered = bars.filter((b) => b.date <= endDate);
      return filtered.length >= 34 ? filtered : null;
    }
    return null;
  }
}

async function fetchEnergyComplex(asOf: string): Promise<PlumbingWarLieDetector['energyComplex']> {
  const endDate = asOf;
  const start = new Date(asOf);
  start.setDate(start.getDate() - 180);
  const startDate = start.toISOString().split('T')[0]!;
  const result: NonNullable<PlumbingWarLieDetector['energyComplex']> = {};

  for (const { symbol, roc3Threshold, z30Threshold } of [
    { symbol: 'UNG' as const, roc3Threshold: 5.0, z30Threshold: 1.0 },
    { symbol: 'COAL' as const, roc3Threshold: 3.0, z30Threshold: 1.0 },
  ]) {
    try {
      const bars = await fetchEnergyBars(symbol, startDate, endDate);
      if (bars) {
        const sig = computeEnergySignal(bars, asOf, symbol, roc3Threshold, z30Threshold);
        if (sig) {
          if (symbol === 'UNG') result.natGas = sig;
          else result.coal = sig;
        }
      }
    } catch (err) {
      console.warn(`  WARN: Energy complex ${symbol} fetch failed:`, err instanceof Error ? err.message : err);
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function main() {
  const barsBySymbol = new Map<string, EodBar[]>();
  const missing: string[] = [];

  for (const sym of SYMBOLS) {
    const bars = loadEodCache(sym);
    if (bars && bars.length >= MIN_BARS) {
      barsBySymbol.set(sym, bars);
    } else {
      missing.push(sym);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing or insufficient EOD cache for: ${missing.join(', ')}. ` +
        `Need >= ${MIN_BARS} bars. Run pnpm -s update:snapshots first.`
    );
  }

  // Build common-date aligned series
  const allDates = new Set<string>();
  for (const bars of barsBySymbol.values()) {
    for (const b of bars) {
      allDates.add(b.date);
    }
  }
  const dates = [...allDates].sort();

  const closeByDate = new Map<string, Record<string, number>>();
  for (const sym of SYMBOLS) {
    const bars = barsBySymbol.get(sym)!;
    const closeMap = new Map(bars.map((b) => [b.date, b.close]));
    for (const d of dates) {
      const close = closeMap.get(d);
      if (close != null && close > 0) {
        let m = closeByDate.get(d);
        if (!m) {
          m = {};
          closeByDate.set(d, m);
        }
        m[sym] = close;
      }
    }
  }

  // Filter to dates where all 6 symbols have data
  const alignedDates = dates.filter((d) => {
    const m = closeByDate.get(d);
    if (!m) return false;
    for (const sym of SYMBOLS) {
      if (m[sym] == null || m[sym]! <= 0) return false;
    }
    return true;
  });

  if (alignedDates.length < MIN_BARS) {
    throw new Error(
      `Insufficient aligned bars: ${alignedDates.length} (need >= ${MIN_BARS}). ` +
        `Check EOD cache completeness for ${SYMBOLS.join(', ')}.`
    );
  }

  // Compute series
  const spread: number[] = [];
  const ratio: number[] = [];
  const spreadMa5: number[] = [];
  const gldSpyRatio: number[] = [];
  const gldTipRatio: number[] = [];

  for (let i = 0; i < alignedDates.length; i++) {
    const d = alignedDates[i]!;
    const m = closeByDate.get(d)!;
    const bno = m.BNO!;
    const uso = m.USO!;
    const gld = m.GLD!;
    const spy = m.SPY!;
    const tip = m.TIP!;

    spread.push(bno - uso);
    ratio.push(bno / uso);
    gldSpyRatio.push(gld / spy);
    gldTipRatio.push(gld / tip);

    // spread_ma5 = 5-day SMA of spread
    if (i >= 4) {
      let sum = 0;
      for (let j = i - 4; j <= i; j++) {
        sum += spread[j]!;
      }
      spreadMa5.push(sum / 5);
    } else {
      spreadMa5.push(NaN);
    }
  }

  const n = alignedDates.length;
  const lastIdx = n - 1;

  // Latest values
  const bno = closeByDate.get(alignedDates[lastIdx]!)!.BNO!;
  const uso = closeByDate.get(alignedDates[lastIdx]!)!.USO!;
  const gld = closeByDate.get(alignedDates[lastIdx]!)!.GLD!;
  const spreadVal = spread[lastIdx]!;
  const ratioVal = ratio[lastIdx]!;
  const spreadMa5Val = spreadMa5[lastIdx];
  const gldSpyVal = gldSpyRatio[lastIdx]!;
  const gldTipVal = gldTipRatio[lastIdx]!;

  // spread_roc3 = ROC of ratio over 3 days
  let spreadRoc3 = NaN;
  if (lastIdx >= 3 && ratio[lastIdx - 3]! > 0) {
    spreadRoc3 = ((ratioVal - ratio[lastIdx - 3]!) / ratio[lastIdx - 3]!) * 100;
  }

  // spread_z30, spread_z60 = z-score of ratio
  let spreadZ30 = NaN;
  let spreadZ60 = NaN;
  if (lastIdx >= 29) {
    const win30 = ratio.slice(lastIdx - 29, lastIdx + 1);
    const mean30 = win30.reduce((a, b) => a + b, 0) / 30;
    const var30 =
      win30.reduce((a, b) => a + (b - mean30) ** 2, 0) / 30;
    const std30 = Math.sqrt(var30) || 1e-10;
    spreadZ30 = (ratioVal - mean30) / std30;
  }
  if (lastIdx >= 59) {
    const win60 = ratio.slice(lastIdx - 59, lastIdx + 1);
    const mean60 = win60.reduce((a, b) => a + b, 0) / 60;
    const var60 =
      win60.reduce((a, b) => a + (b - mean60) ** 2, 0) / 60;
    const std60 = Math.sqrt(var60) || 1e-10;
    spreadZ60 = (ratioVal - mean60) / std60;
  }

  // gld_spy_roc5, gld_tip_roc5
  let gldSpyRoc5 = NaN;
  let gldTipRoc5 = NaN;
  if (lastIdx >= 5 && gldSpyRatio[lastIdx - 5]! > 0) {
    gldSpyRoc5 =
      ((gldSpyVal - gldSpyRatio[lastIdx - 5]!) / gldSpyRatio[lastIdx - 5]!) * 100;
  }
  if (lastIdx >= 5 && gldTipRatio[lastIdx - 5]! > 0) {
    gldTipRoc5 =
      ((gldTipVal - gldTipRatio[lastIdx - 5]!) / gldTipRatio[lastIdx - 5]!) * 100;
  }

  const goldConfirm =
    Number.isFinite(gldSpyRoc5) &&
    Number.isFinite(gldTipRoc5) &&
    gldSpyRoc5 > 0 &&
    gldTipRoc5 > 0;

  const spreadWatch = Number.isFinite(spreadZ30) && spreadZ30 >= 1;
  const spreadActive = Number.isFinite(spreadZ30) && spreadZ30 >= 2;

  // Score: legacy confirm count (oil 0-2 + gold 0-1). Regime is source of truth.
  let score = 0;
  if (Number.isFinite(spreadZ30)) {
    if (spreadZ30 >= 2) score += 2;
    else if (spreadZ30 >= 1) score += 1;
  }
  if (goldConfirm) score += 1;
  score = Math.min(3, score);

  // Label computed in run() after energyComplex (bucket-based). Placeholder for artifact shape.
  const label: PlumbingLabel = 'THEATER';

  // History: last 90 trading days
  const historyStart = Math.max(0, lastIdx - HISTORY_DAYS + 1);
  const history: PlumbingHistoryPoint[] = [];
  const labelHistory: PlumbingLabelHistoryPoint[] = [];

  for (let i = historyStart; i <= lastIdx; i++) {
    const d = alignedDates[i]!;
    const s = spread[i]!;
    const r = ratio[i]!;
    const ma5 = Number.isFinite(spreadMa5[i]) ? spreadMa5[i]! : s;
    const gs = gldSpyRatio[i]!;
    history.push({
      date: d,
      spread: Math.round(s * 100) / 100,
      bno_uso_ratio: Math.round(r * 10000) / 10000,
      spread_ma5: Math.round(ma5 * 100) / 100,
      gld_spy_ratio: Math.round(gs * 10000) / 10000,
    });

    // Compute label/score for this day
    let dayZ30 = NaN;
    if (i >= 29) {
      const win30 = ratio.slice(i - 29, i + 1);
      const mean30 = win30.reduce((a, b) => a + b, 0) / 30;
      const var30 = win30.reduce((a, b) => a + (b - mean30) ** 2, 0) / 30;
      const std30 = Math.sqrt(var30) || 1e-10;
      dayZ30 = (r - mean30) / std30;
    }
    let dayGldSpyRoc5 = NaN;
    let dayGldTipRoc5 = NaN;
    if (i >= 5 && gldSpyRatio[i - 5]! > 0) {
      dayGldSpyRoc5 = ((gs - gldSpyRatio[i - 5]!) / gldSpyRatio[i - 5]!) * 100;
    }
    if (i >= 5 && gldTipRatio[i - 5]! > 0) {
      dayGldTipRoc5 = ((gldTipRatio[i]! - gldTipRatio[i - 5]!) / gldTipRatio[i - 5]!) * 100;
    }
    const dayGoldConfirm =
      Number.isFinite(dayGldSpyRoc5) && Number.isFinite(dayGldTipRoc5) && dayGldSpyRoc5 > 0 && dayGldTipRoc5 > 0;

    let dayScore = 0;
    if (Number.isFinite(dayZ30)) {
      if (dayZ30 >= 2) dayScore += 2;
      else if (dayZ30 >= 1) dayScore += 1;
    }
    if (dayGoldConfirm) dayScore += 1;
    dayScore = Math.min(3, dayScore);

    // Historical: plumbing+macro only (no energyComplex per day). Plumbing-first.
    const dayLabel = computeRegimeFromBucketsHistorical(dayZ30, dayGoldConfirm);

    labelHistory.push({ date: d, label: dayLabel, score: dayScore });
  }

  const inputLastDates = SYMBOLS.map((s) => {
    const bars = barsBySymbol.get(s);
    return bars && bars.length > 0 ? `${s}=${bars[bars.length - 1]!.date}` : `${s}=missing`;
  }).join(' ');
  console.log(`PLUMBING inputs last: ${inputLastDates}`);

  const inputsLast: Record<string, string> = {};
  for (const s of SYMBOLS) {
    const bars = barsBySymbol.get(s);
    if (bars && bars.length > 0) {
      inputsLast[s] = bars[bars.length - 1]!.date;
    }
  }
  const lastDates = Object.values(inputsLast);
  const minLastDate = lastDates.length === 6 ? lastDates.reduce((a, b) => (a < b ? a : b)) : null;
  const maxLastDate = lastDates.length === 6 ? lastDates.reduce((a, b) => (a > b ? a : b)) : null;
  const lagTd =
    minLastDate && maxLastDate && minLastDate !== maxLastDate
      ? Math.ceil(
          ((new Date(maxLastDate).getTime() - new Date(minLastDate).getTime()) / (1000 * 60 * 60 * 24)) * (5 / 7)
        )
      : 0;
  const laggingTickers =
    lagTd === 0
      ? []
      : [...Object.entries(inputsLast)].filter(([, d]) => d === minLastDate).map(([t]) => t);
  const dataFreshness =
    minLastDate != null && maxLastDate != null
      ? { minLastDate, maxLastDate, lagTradingDays: lagTd, laggingTickers }
      : undefined;

  const asOf = alignedDates[lastIdx]!;
  const artifact: PlumbingWarLieDetector = {
    asOf,
    inputsLast: Object.keys(inputsLast).length === 6 ? (inputsLast as PlumbingInputsLast) : undefined,
    dataFreshness,
    energyComplex: undefined,
    inputs: {
      brentProxy: 'BNO',
      wtiProxy: 'USO',
      goldProxy: 'GLD',
      riskProxy: 'SPY',
      tipsProxy: 'TIP',
      dxyProxy: 'UUP',
    },
    latest: {
      bno: Math.round(bno * 100) / 100,
      uso: Math.round(uso * 100) / 100,
      spread: Math.round(spreadVal * 100) / 100,
      bno_uso_ratio: Math.round(ratioVal * 10000) / 10000,
      spread_ma5: Number.isFinite(spreadMa5Val)
        ? Math.round(spreadMa5Val * 100) / 100
        : spreadVal,
      spread_roc3: Number.isFinite(spreadRoc3)
        ? Math.round(spreadRoc3 * 100) / 100
        : 0,
      spread_z30: Number.isFinite(spreadZ30)
        ? Math.round(spreadZ30 * 100) / 100
        : 0,
      spread_z60: Number.isFinite(spreadZ60)
        ? Math.round(spreadZ60 * 100) / 100
        : 0,
      gld: Math.round(gld * 100) / 100,
      gld_spy_ratio: Math.round(gldSpyVal * 10000) / 10000,
      gld_spy_roc5: Number.isFinite(gldSpyRoc5)
        ? Math.round(gldSpyRoc5 * 100) / 100
        : 0,
      gld_tip_ratio: Math.round(gldTipVal * 10000) / 10000,
      gld_tip_roc5: Number.isFinite(gldTipRoc5)
        ? Math.round(gldTipRoc5 * 100) / 100
        : 0,
    },
    signals: {
      spreadWatch,
      spreadActive,
      goldConfirm,
    },
    score,
    label,
    history,
    labelHistory,
  };

  return { artifact, asOf, score, goldConfirm };
}

async function run() {
  const { artifact, asOf, score, goldConfirm } = main();
  try {
    console.log('  Fetching energy complex (UNG, COAL) from Stooq...');
    artifact.energyComplex = await fetchEnergyComplex(asOf);
    if (artifact.energyComplex?.natGas) {
      console.log(`   UNG: roc3=${artifact.energyComplex.natGas.roc3}, z30=${artifact.energyComplex.natGas.z30}, active=${artifact.energyComplex.natGas.active}`);
    }
    if (artifact.energyComplex?.coal) {
      console.log(`   COAL: roc3=${artifact.energyComplex.coal.roc3}, z30=${artifact.energyComplex.coal.z30}, active=${artifact.energyComplex.coal.active}`);
    }
  } catch (err) {
    console.warn('  WARN: Energy complex fetch failed (continuing without):', err instanceof Error ? err.message : err);
  }

  // Bucket-based regime (v2 plumbing-first)
  const bucketState = computeBucketState(
    artifact.latest.spread_z30,
    artifact.signals.goldConfirm,
    artifact.energyComplex
  );
  artifact.label = computeRegimeFromBuckets(bucketState);
  artifact.bucketState = {
    physicalPlumbing: bucketState.physicalPlumbing,
    substitutionActive: bucketState.substitutionActive,
    macroConfirm: bucketState.macroConfirm,
  };

  artifact.trajectory = computeTrajectory(artifact);
  if (artifact.trajectory) {
    console.log(`   trajectory: ${artifact.trajectory.state} — ${artifact.trajectory.reason}`);
  }

  artifact.energyBreadth = computeEnergyBreadth(artifact);
  if (artifact.energyBreadth) {
    console.log(`   energyBreadth: ${artifact.energyBreadth.state} — ${artifact.energyBreadth.reason}`);
  }

  const outPath = join(process.cwd(), 'public', 'plumbing.war_lie_detector.json');
  writeFileSync(outPath, JSON.stringify(artifact, null, 2), 'utf-8');

  console.log(`\n✅ Wrote public/plumbing.war_lie_detector.json`);
  console.log(`   asOf: ${asOf}, label: ${artifact.label}, score: ${score}`);
  console.log(`   spread_z30: ${artifact.latest.spread_z30}, spread_roc3: ${artifact.latest.spread_roc3}`);
  console.log(`   goldConfirm: ${goldConfirm}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
