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

interface PlumbingWarLieDetector {
  asOf: string;
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
  history: PlumbingHistoryPoint[];
  labelHistory: PlumbingLabelHistoryPoint[];
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

  let score = 0;
  if (Number.isFinite(spreadZ30)) {
    if (spreadZ30 >= 2) score += 2;
    else if (spreadZ30 >= 1) score += 1;
  }
  if (goldConfirm) score += 1;
  score = Math.min(3, score);

  let label: PlumbingLabel = 'THEATER';
  if (spreadActive && goldConfirm) {
    label = 'REAL_RISK';
  } else if (spreadWatch || goldConfirm) {
    label = 'WATCH';
  }

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
    const daySpreadWatch = Number.isFinite(dayZ30) && dayZ30 >= 1;
    const daySpreadActive = Number.isFinite(dayZ30) && dayZ30 >= 2;

    let dayScore = 0;
    if (Number.isFinite(dayZ30)) {
      if (dayZ30 >= 2) dayScore += 2;
      else if (dayZ30 >= 1) dayScore += 1;
    }
    if (dayGoldConfirm) dayScore += 1;
    dayScore = Math.min(3, dayScore);

    let dayLabel: PlumbingLabel = 'THEATER';
    if (daySpreadActive && dayGoldConfirm) dayLabel = 'REAL_RISK';
    else if (daySpreadWatch || dayGoldConfirm) dayLabel = 'WATCH';

    labelHistory.push({ date: d, label: dayLabel, score: dayScore });
  }

  const asOf = alignedDates[lastIdx]!;
  const artifact: PlumbingWarLieDetector = {
    asOf,
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

  const outPath = join(process.cwd(), 'public', 'plumbing.war_lie_detector.json');
  writeFileSync(outPath, JSON.stringify(artifact, null, 2), 'utf-8');

  console.log(`\n✅ Wrote public/plumbing.war_lie_detector.json`);
  console.log(`   asOf: ${asOf}, label: ${label}, score: ${score}`);
  console.log(`   spread_z30: ${artifact.latest.spread_z30}, spread_roc3: ${artifact.latest.spread_roc3}`);
  console.log(`   goldConfirm: ${goldConfirm}`);
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
