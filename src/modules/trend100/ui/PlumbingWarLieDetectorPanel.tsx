/**
 * PlumbingWarLieDetectorPanel — War Lie Detector (Truth in the Pipes) panel
 *
 * Shows status badge, checklist (spread z30, ROC3, GoldConfirm), and charts.
 */

'use client';

import { useMemo, useState } from 'react';
import type { PlumbingWarLieDetector } from '../types';
import { PlumbingSimpleChart, type PlumbingRegimeBand } from './PlumbingSimpleChart';

interface PlumbingWarLieDetectorPanelProps {
  data: PlumbingWarLieDetector;
}

const chipBase = 'inline-flex items-center rounded-md px-2 py-0.5 text-xs bg-zinc-900/60 border border-zinc-800 text-slate-300';

const LABEL_FILL: Record<string, string> = {
  THEATER: '#64748b',
  WATCH: '#f59e0b',
  REAL_RISK: '#dc2626',
};

/** Build regime bands from labelHistory: group consecutive days with same label into runs. */
function buildRegimeBands(labelHistory: Array<{ date: string; label: string }>): PlumbingRegimeBand[] {
  if (!labelHistory || labelHistory.length === 0) return [];
  const dateToIdx = new Map<string, number>();
  labelHistory.forEach((p, i) => dateToIdx.set(p.date, i));
  const bands: PlumbingRegimeBand[] = [];
  let runStart = labelHistory[0]!.date;
  let runLabel = labelHistory[0]!.label;
  for (let i = 1; i < labelHistory.length; i++) {
    const prev = labelHistory[i - 1]!;
    const curr = labelHistory[i]!;
    const prevIdx = dateToIdx.get(prev.date);
    const currIdx = dateToIdx.get(curr.date);
    const contiguous = prevIdx != null && currIdx != null && currIdx === prevIdx + 1;
    if (!contiguous || curr.label !== runLabel) {
      bands.push({ x1: runStart, x2: prev.date, fill: LABEL_FILL[runLabel] ?? '#64748b' });
      runStart = curr.date;
      runLabel = curr.label;
    }
  }
  const last = labelHistory[labelHistory.length - 1]!;
  bands.push({ x1: runStart, x2: last.date, fill: LABEL_FILL[runLabel] ?? '#64748b' });
  return bands;
}

/** "What to watch next" bullets based on label/signal state. */
function getWhatToWatchNext(
  label: PlumbingWarLieDetector['label'],
  z30: number,
  goldConfirm: boolean,
  gasActive?: boolean,
  coalActive?: boolean,
  trajectoryState?: 'ESCALATING' | 'HOLDING' | 'EASING',
  energyBreadthState?: 'NARROW' | 'BROADENING' | 'FULL_STRESS'
): string[] {
  const bullets: string[] = [];
  if (trajectoryState) {
    if (trajectoryState === 'ESCALATING') bullets.push('Escalation is broadening; watch for confirmation to persist.');
    else if (trajectoryState === 'HOLDING') bullets.push('Stress is present, but not clearly broadening yet.');
    else bullets.push('Pressure is cooling unless confirms reappear.');
  }
  if (energyBreadthState) {
    if (energyBreadthState === 'NARROW') bullets.push('If gas or coal turns ON → stress is broadening beyond oil.');
    else if (energyBreadthState === 'BROADENING') bullets.push('If Gold Confirm flips ON → broadening may become full stress.');
    else bullets.push('If gas/coal and gold stay ON together → broad stress remains in place.');
  }
  if (label === 'WATCH') {
    if (z30 >= 2 && !goldConfirm) {
      bullets.push('If Gold Confirm flips ON → likely REAL_RISK', 'If Phase turns EASING for a few days → likely downshift');
    } else if (goldConfirm && z30 < 2) {
      bullets.push('If Oil Stress reaches Active (z30 ≥ 2) → likely REAL_RISK', 'If Gold Confirm turns OFF → likely THEATER/WATCH');
    } else {
      bullets.push('If Gold Confirm flips ON → likely REAL_RISK', 'If Phase turns EASING for a few days → likely downshift');
    }
    if (gasActive === false) {
      bullets.push('If Gas Stress turns ON → energy supply crunch broadening');
    }
  } else if (label === 'REAL_RISK') {
    bullets.push('If Gold Confirm stays ON and Phase stays RISING → escalation', 'If Gold Confirm turns OFF → likely downshift to WATCH');
    if (!goldConfirm && (gasActive === false || gasActive === undefined)) {
      bullets.push('Both Gas + Gold confirm OFF → risk narrowing back to oil-only stress');
    }
  } else {
    bullets.push('If Oil Stress reaches Watch (z30 ≥ 1) → WATCH', 'If Gold Confirm flips ON → WATCH (and watch for REAL_RISK)');
  }
  return bullets.slice(0, 5);
}

/** Plain-English verdict one-liner. */
function getVerdict(label: PlumbingWarLieDetector['label'], signals: PlumbingWarLieDetector['signals']): string {
  if (label === 'REAL_RISK') return 'Oil spread stress + gold confirmation → REAL_RISK.';
  if (label === 'THEATER') return 'No spread stress + no gold confirmation → THEATER.';
  if (signals.spreadActive && !signals.goldConfirm) return 'Oil spread is stressed, but gold isn\'t confirming → WATCH.';
  if (signals.goldConfirm && !signals.spreadActive) return 'Gold confirming, but oil spread not stressed → WATCH.';
  return 'Mixed signals → WATCH.';
}

/** Phase: RISING (ROC3 >= 0.5%), EASING (<= -0.5%), FLAT otherwise. */
function getPhase(roc3: number): 'RISING' | 'EASING' | 'FLAT' {
  if (roc3 >= 0.5) return 'RISING';
  if (roc3 <= -0.5) return 'EASING';
  return 'FLAT';
}

/** Compute trajectory when artifact lacks it (backwards compat). */
function getTrajectory(data: PlumbingWarLieDetector): NonNullable<PlumbingWarLieDetector['trajectory']> {
  if (data.trajectory) return data.trajectory;
  const phase = getPhase(data.latest.spread_roc3);
  const natGasActive = data.energyComplex?.natGas?.active === true;
  const escalating =
    data.label === 'REAL_RISK' ||
    data.signals.goldConfirm ||
    natGasActive ||
    (phase === 'RISING' && data.latest.spread_z30 >= 2);
  const easing =
    phase === 'EASING' &&
    !data.signals.goldConfirm &&
    !natGasActive &&
    data.latest.spread_z30 < 2;
  const state = escalating ? 'ESCALATING' : easing ? 'EASING' : 'HOLDING';
  const reason =
    state === 'ESCALATING'
      ? 'Stress is broadening beyond oil.'
      : state === 'EASING'
        ? 'Pressure is cooling and confirms are fading.'
        : 'Stress is present, but not clearly broadening yet.';
  return { state, reason, phase };
}

function trajectoryChipClass(state: 'ESCALATING' | 'HOLDING' | 'EASING'): string {
  switch (state) {
    case 'ESCALATING':
      return 'bg-red-900/40 border-red-700/60 text-red-200';
    case 'EASING':
      return 'bg-emerald-900/40 border-emerald-700/60 text-emerald-200';
    default:
      return 'bg-amber-900/40 border-amber-700/60 text-amber-200';
  }
}

/** Compute energy breadth when artifact lacks it (backwards compat). */
function getEnergyBreadth(data: PlumbingWarLieDetector): NonNullable<PlumbingWarLieDetector['energyBreadth']> {
  if (data.energyBreadth) return data.energyBreadth;
  const oilStress = data.latest.spread_z30 >= 1;
  const gasActive = data.energyComplex?.natGas?.active === true;
  const coalActive = data.energyComplex?.coal?.active === true;
  const gasOrCoalActive = gasActive || coalActive;
  const phase = data.trajectory?.phase ?? getPhase(data.latest.spread_roc3);
  const oilEasing = phase === 'EASING' || phase === 'FLAT';
  if (oilStress && data.signals.goldConfirm && gasOrCoalActive) {
    return { state: 'FULL_STRESS', reason: 'Oil, macro fear, and wider energy stress are all confirming.' };
  }
  if (oilStress && gasOrCoalActive) {
    return { state: 'BROADENING', reason: 'Stress is spreading beyond crude into the wider energy complex.' };
  }
  if (oilStress && !gasOrCoalActive && !data.signals.goldConfirm) {
    return { state: 'NARROW', reason: 'Stress is still mostly confined to oil.' };
  }
  if (oilEasing && !gasOrCoalActive && !data.signals.goldConfirm) {
    return { state: 'NARROW', reason: 'Stress is mostly confined to oil.' };
  }
  return { state: oilStress ? 'BROADENING' : 'NARROW', reason: oilStress ? 'Stress is present, but confirms are mixed.' : 'Stress is still mostly confined to oil.' };
}

/** Plain-English Explain bullets + "Not X because" lines. */
function getExplainBullets(data: PlumbingWarLieDetector): {
  bullets: string[];
  notLines: string[];
} {
  const { label, latest, signals } = data;
  const trajectory = getTrajectory(data);
  const phase = getPhase(latest.spread_roc3);
  const oilStress = latest.spread_z30 >= 1;
  const oilActive = latest.spread_z30 >= 2;
  const gasActive = data.energyComplex?.natGas?.active === true;
  const coalActive = data.energyComplex?.coal?.active === true;
  const gasOrCoalActive = gasActive || coalActive;

  const bullets: string[] = [];
  const notLines: string[] = [];

  if (label === 'THEATER') {
    bullets.push('Bottom line: Oil stress has cooled and is no longer spreading across the wider energy complex.');
    bullets.push('Why this is THEATER: Gold is not confirming, and both gas and coal are off.');
    bullets.push(`Why this is ${trajectory.state}: The recent oil move is ${phase === 'EASING' ? 'negative' : phase === 'FLAT' ? 'flat' : 'positive'} and oil stress is back below Watch.`);
    bullets.push('What would flip this back up: Oil stress rising above Watch again, especially if gas or gold turns on.');
    notLines.push('Not WATCH because: oil stress is below the Watch threshold.');
    notLines.push('Not REAL_RISK because: gold is off and the broader energy confirms are quiet.');
  } else if (label === 'WATCH') {
    if (oilActive && !signals.goldConfirm) {
      bullets.push('Bottom line: Oil stress is still present, but the move is not clearly broadening.');
      bullets.push('Why this is not worse: Gold is not confirming, and gas/coal are still quiet.');
      bullets.push('What would make it worse: If Gold Confirm flips on while oil stress stays high, this likely moves toward REAL_RISK.');
      bullets.push('What confirms fading: If gas and coal stay off while oil decelerates, pressure is likely cooling.');
      notLines.push('Not REAL_RISK because: gold is off.');
    } else if (signals.goldConfirm && !oilActive) {
      bullets.push('Bottom line: Gold is confirming, but oil stress is not yet at Active.');
      bullets.push('Why this is not worse: The move is still mostly confined to oil.');
      bullets.push('What would make it worse: If oil stress reaches Active (z30 ≥ 2), this likely moves toward REAL_RISK.');
      bullets.push('What confirms fading: If Gold Confirm turns off, this likely downshifts to THEATER.');
      notLines.push('Not REAL_RISK because: oil stress is below Active.');
    } else {
      bullets.push('Bottom line: Oil stress is present, but confirms are mixed.');
      bullets.push('Why this is not worse: Secondary confirms are limited.');
      bullets.push('What would make it worse: If gas or coal turns on, stress is broadening beyond oil.');
      bullets.push('What confirms fading: If the broader confirms stay quiet, this remains narrow.');
      notLines.push('Not REAL_RISK because: gold is off or oil stress is not at Active.');
    }
  } else {
    bullets.push('Bottom line: Oil, gas, and macro fear are confirming together.');
    bullets.push('Why this is FULL_STRESS: Stress is broad across oil, macro, and the energy complex.');
    bullets.push('What would make it worse: If gas/coal and gold stay on together, broad stress remains in place.');
    bullets.push('What confirms fading: If Gold Confirm turns off, this likely downshifts to WATCH.');
    notLines.push('Not WATCH because: oil stress is Active and gold is confirming.');
  }

  return { bullets, notLines };
}

function energyBreadthChipClass(state: 'NARROW' | 'BROADENING' | 'FULL_STRESS'): string {
  switch (state) {
    case 'NARROW':
      return 'bg-slate-700/60 border-slate-600 text-slate-200';
    case 'BROADENING':
      return 'bg-amber-900/40 border-amber-700/60 text-amber-200';
    case 'FULL_STRESS':
      return 'bg-red-900/40 border-red-700/60 text-red-200';
    default:
      return 'bg-zinc-800 border-zinc-700 text-slate-300';
  }
}

function labelBadgeClass(label: PlumbingWarLieDetector['label']): string {
  switch (label) {
    case 'THEATER':
      return 'bg-slate-700/60 border-slate-600 text-slate-200';
    case 'WATCH':
      return 'bg-amber-900/50 border-amber-700/60 text-amber-200';
    case 'REAL_RISK':
      return 'bg-red-900/40 border-red-700/60 text-red-200';
    default:
      return 'bg-zinc-800 border-zinc-700 text-slate-300';
  }
}

export function PlumbingWarLieDetectorPanel({ data }: PlumbingWarLieDetectorPanelProps) {
  const { latest, signals, label, score, history, labelHistory, inputsLast, dataFreshness } = data;
  const [techDetailsOpen, setTechDetailsOpen] = useState(false);
  const trajectory = useMemo(() => getTrajectory(data), [data]);
  const energyBreadth = useMemo(() => getEnergyBreadth(data), [data]);
  const explainBullets = useMemo(() => getExplainBullets(data), [data]);

  const regimeBands = useMemo(
    () => (labelHistory && labelHistory.length > 0 ? buildRegimeBands(labelHistory) : []),
    [labelHistory]
  );

  const spreadChartData = history.map((h) => ({
    date: h.date,
    spread: h.spread,
    spread_ma5: h.spread_ma5,
  }));

  const ratioChartData = history.map((h) => ({
    date: h.date,
    gld_spy_ratio: h.gld_spy_ratio,
  }));

  const lagTradingDays = dataFreshness?.lagTradingDays ?? 0;
  const isAligned = lagTradingDays === 0 || dataFreshness?.minLastDate === dataFreshness?.maxLastDate;
  const laggingList = dataFreshness?.laggingTickers ?? [];

  return (
    <div className="container mx-auto px-4 py-4 border-b border-zinc-800 space-y-4">
      {/* Status badge */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-300 text-xs">Plumbing:</span>
          <span
            className={`inline-flex items-center rounded-md px-3 py-1 text-sm font-medium border ${labelBadgeClass(label)}`}
          >
            {label}
          </span>
          <span
            className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium border ${trajectoryChipClass(trajectory.state)}`}
            title={trajectory.reason}
          >
            {trajectory.state}
          </span>
          <span
            className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium border ${energyBreadthChipClass(energyBreadth.state)}`}
            title={energyBreadth.reason}
          >
            Energy: {energyBreadth.state}
          </span>
          <span className={chipBase}>Confirms: {score}/3</span>
        </div>
        <span className="text-xs text-slate-500">asOf: {data.asOf}</span>
      </div>

      {/* Verdict one-liner */}
      <p className="text-sm text-slate-300">{getVerdict(label, signals)}</p>

      {/* Trajectory + Energy Breadth reasons (plain-English helpers) */}
      <p className="text-sm text-slate-400">{trajectory.reason}</p>
      <p className="text-sm text-slate-500">{energyBreadth.reason}</p>

      {/* What to watch next */}
      <div className="rounded border border-zinc-800 bg-zinc-900/30 px-3 py-2">
        <p className="text-xs font-medium text-slate-400 mb-1.5">What to watch next</p>
        <ul className="text-xs text-slate-300 space-y-0.5 list-disc list-inside">
          {getWhatToWatchNext(
            label,
            latest.spread_z30,
            signals.goldConfirm,
            data.energyComplex?.natGas?.active,
            data.energyComplex?.coal?.active,
            trajectory.state,
            energyBreadth.state
          ).map((bullet, i) => (
            <li key={i}>{bullet}</li>
          ))}
        </ul>
      </div>

      {/* Signal cards: Oil Stress + Gold Confirm + Gas + Coal */}
      <div className="flex flex-wrap gap-3">
        <div className="rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2 min-w-[140px]">
          <p className="text-xs font-medium text-slate-400 mb-1">Oil Stress</p>
          <p className="text-sm text-slate-200">
            {latest.spread_z30 >= 2 ? '✓ Active (≥2)' : latest.spread_z30 >= 1 ? '✓ Watch (≥1)' : '✓ Low (<1)'}
          </p>
          <p className="text-xs text-slate-500 mt-0.5" title="Z-score of BNO/USO ratio: how many standard deviations from 30d average.">
            z-score: {latest.spread_z30.toFixed(2)}
          </p>
        </div>
        <div className="rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2 min-w-[140px]">
          <p className="text-xs font-medium text-slate-400 mb-1">Gold Confirm</p>
          <p className="text-sm text-slate-200">{signals.goldConfirm ? '✓ Yes' : '✗ No'}</p>
          <p className="text-xs text-slate-500 mt-0.5" title="GLD/SPY and GLD/TIP 5-day ROC both positive.">
            {signals.goldConfirm ? 'Both ratio ROC5 > 0' : 'Not both positive'}
          </p>
        </div>
        <div className="rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2 min-w-[140px]">
          <p className="text-xs font-medium text-slate-400 mb-1">Nat Gas Stress</p>
          <p className="text-sm text-slate-200">
            {data.energyComplex?.natGas == null
              ? 'N/A'
              : data.energyComplex.natGas.active
                ? 'ON'
                : 'OFF'}
          </p>
          <p className="text-xs text-slate-500 mt-0.5" title={data.energyComplex?.natGas ? `UNG: roc3 ${data.energyComplex.natGas.roc3}%, z30 ${data.energyComplex.natGas.z30}` : 'Data unavailable'}>
            {data.energyComplex?.natGas ? `UNG · roc3: ${data.energyComplex.natGas.roc3}%, z30: ${data.energyComplex.natGas.z30}` : '—'}
          </p>
        </div>
        {data.energyComplex?.coal != null && (
          <div className="rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2 min-w-[140px]">
            <p className="text-xs font-medium text-slate-400 mb-1">Coal Stress</p>
            <p className="text-sm text-slate-200">
              {data.energyComplex.coal.active ? 'ON' : 'OFF'}
            </p>
            <p className="text-xs text-slate-500 mt-0.5" title={`COAL: roc3 ${data.energyComplex.coal.roc3}%, z30 ${data.energyComplex.coal.z30}, ${data.energyComplex.coal.active ? 'active' : 'off'}`}>
              roc3: {data.energyComplex.coal.roc3}%, z30: {data.energyComplex.coal.z30}
            </p>
          </div>
        )}
      </div>

      {/* Data freshness */}
      {(inputsLast || dataFreshness) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500">Data freshness:</span>
          {dataFreshness && (
            <>
              {isAligned ? (
                <span
                  className={chipBase}
                  title={inputsLast ? ['BNO', 'USO', 'GLD', 'SPY', 'TIP', 'UUP']
                    .map((s) => `${s}=${inputsLast[s as keyof typeof inputsLast] ?? '?'}`)
                    .join(' ') : undefined}
                >
                  Fresh: {dataFreshness.maxLastDate}
                </span>
              ) : (
                <>
                  <span className={chipBase}>
                    min: {dataFreshness.minLastDate} · max: {dataFreshness.maxLastDate}
                  </span>
                  <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs bg-amber-900/40 border border-amber-700/50 text-amber-200">
                    ⚠ Lag {dataFreshness.lagTradingDays}d
                  </span>
                  {laggingList.length > 0 && (
                    <span className={chipBase} title="Tickers holding data back">
                      Lagging: {laggingList.length <= 5 ? laggingList.join(', ') : laggingList.slice(0, 5).join(', ') + ` +${laggingList.length - 5}`}
                    </span>
                  )}
                </>
              )}
            </>
          )}
          {inputsLast && !isAligned && (
            <span className={chipBase} title="Per-ticker last EOD date">
              {['BNO', 'USO', 'GLD', 'SPY', 'TIP', 'UUP']
                .map((s) => `${s}=${inputsLast[s as keyof typeof inputsLast] ?? '?'}`)
                .join(' ')}
            </span>
          )}
        </div>
      )}

      {/* Explain: plain-English first, technical appendix second */}
      <div className="rounded border border-zinc-800 bg-zinc-900/30 p-3">
        <p className="text-xs font-medium text-slate-400 mb-2">Explain</p>
        <ul className="text-sm text-slate-300 space-y-1.5 list-none mb-3">
          {explainBullets.bullets.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-slate-500 shrink-0">•</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
        {explainBullets.notLines.length > 0 && (
          <div className="text-xs text-slate-500 space-y-0.5 mb-3 border-t border-zinc-800 pt-2">
            {explainBullets.notLines.map((n, i) => (
              <p key={i}>{n}</p>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setTechDetailsOpen(!techDetailsOpen)}
          className="text-xs text-slate-500 hover:text-slate-400"
        >
          {techDetailsOpen ? '▼' : '▶'} Show technical details
        </button>
        {techDetailsOpen && (
          <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside mt-2">
            <li>
              <strong>Phase</strong> (3d change): {getPhase(latest.spread_roc3)} — RISING ≥0.5%, EASING ≤−0.5%, FLAT otherwise
            </li>
            <li>
              <strong>Oil stress (z-score)</strong>: {latest.spread_z30.toFixed(2)} — Watch ≥1, Active ≥2
              {latest.spread_z30 >= 2 ? ' ✓ Active (+2)' : latest.spread_z30 >= 1 ? ' ✓ Watch (+1)' : ' (0)'}
            </li>
            <li>
              <strong>Oil stress change (3d)</strong>: {latest.spread_roc3.toFixed(2)}%
            </li>
            <li>
              <strong>GoldConfirm</strong>: {signals.goldConfirm ? '✓' : 'no'}
            </li>
            <li>
              <strong>Nat gas stress</strong>: {data.energyComplex?.natGas == null ? 'N/A' : data.energyComplex.natGas.active ? 'ON' : 'OFF'}
            </li>
            <li>
              <strong>Coal stress</strong>: {data.energyComplex?.coal == null ? 'N/A' : data.energyComplex.coal.active ? 'ON' : 'OFF'}
            </li>
            <li>
              <strong>Confirms</strong>: {score}/3 (max: +2 z30≥2, +1 z30≥1, +1 goldConfirm)
            </li>
          </ul>
        )}
      </div>

      {/* Chart 1: Spread + MA5 with regime bands */}
      <div className="rounded border border-zinc-800 bg-zinc-900/40 p-3">
        <p className="text-xs text-slate-400 mb-2">
          Oil dislocation (Brent vs WTI proxies)
          {regimeBands.length > 0 && (
            <span className="ml-2 text-slate-500">· Bands: THEATER (slate) / WATCH (amber) / REAL_RISK (red)</span>
          )}
        </p>
        <PlumbingSimpleChart
          data={spreadChartData}
          lines={[
            { dataKey: 'spread', stroke: '#a1a1aa', name: 'Spread' },
            { dataKey: 'spread_ma5', stroke: '#fbbf24', name: 'MA5' },
          ]}
          height={180}
          regimeBands={regimeBands}
          tickInterval="monthly"
          lastValueLabel={
            <span className="text-xs text-slate-400">
              Last: {latest.spread.toFixed(4)} · MA5: {latest.spread_ma5.toFixed(4)}
            </span>
          }
        />
      </div>

      {/* Chart 2: GLD/SPY ratio */}
      <div className="rounded border border-zinc-800 bg-zinc-900/40 p-3">
        <p className="text-xs text-slate-400 mb-2">GLD/SPY ratio</p>
        <PlumbingSimpleChart
          data={ratioChartData}
          lines={[{ dataKey: 'gld_spy_ratio', stroke: '#a1a1aa', name: 'GLD/SPY' }]}
          height={180}
        />
      </div>
    </div>
  );
}
