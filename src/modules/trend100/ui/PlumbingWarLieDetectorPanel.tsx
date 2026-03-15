/**
 * PlumbingWarLieDetectorPanel — War Lie Detector (Truth in the Pipes) panel
 *
 * Shows status badge, checklist (spread z30, ROC3, GoldConfirm), and charts.
 * All user-facing text is derived from a single shared panel state to avoid contradictions.
 */

'use client';

import { useMemo, useState } from 'react';
import type { PlumbingWarLieDetector } from '../types';
import { PlumbingSimpleChart, type PlumbingRegimeBand } from './PlumbingSimpleChart';

interface PlumbingWarLieDetectorPanelProps {
  data: PlumbingWarLieDetector;
}

const chipBase = 'inline-flex items-center rounded-md px-2 py-0.5 text-xs bg-zinc-900/60 border border-zinc-800 text-slate-300';

/** Map artifact label to public-facing display. THEATER → CONTAINED per v2 spec. */
function displayRegime(label: PlumbingWarLieDetector['label']): string {
  return label === 'THEATER' ? 'CONTAINED' : label;
}

/** Bucket state for display. Use artifact.bucketState when present, else derive from artifact. */
function getBucketStateForDisplay(data: PlumbingWarLieDetector): {
  physicalPlumbing: 'low' | 'watch' | 'strong';
  substitutionActive: boolean;
  macroConfirm: boolean;
} {
  if (data.bucketState) return data.bucketState;
  const z30 = data.latest.spread_z30;
  const physicalPlumbing: 'low' | 'watch' | 'strong' =
    !Number.isFinite(z30) || z30 < 1 ? 'low' : z30 >= 2 ? 'strong' : 'watch';
  const substitutionActive =
    data.energyComplex?.natGas?.active === true || data.energyComplex?.coal?.active === true;
  return { physicalPlumbing, substitutionActive, macroConfirm: data.signals.goldConfirm };
}

/** Human-readable bucket labels for UI. */
function bucketPlumbingLabel(p: 'low' | 'watch' | 'strong'): string {
  return p === 'low' ? 'contained' : p === 'watch' ? 'watch' : 'stressed';
}

/** Canonical panel state — single source of truth for all plain-English text. */
interface PanelState {
  label: PlumbingWarLieDetector['label'];
  oilStress: boolean;
  oilActive: boolean;
  gasActive: boolean;
  coalActive: boolean;
  coalAvailable: boolean;
  gasOrCoalActive: boolean;
  goldConfirm: boolean;
  trajectoryState: 'ESCALATING' | 'HOLDING' | 'EASING';
  energyBreadthState: 'NARROW' | 'BROADENING' | 'FULL_STRESS';
  phase: 'RISING' | 'EASING' | 'FLAT';
}

function getPanelState(data: PlumbingWarLieDetector): PanelState {
  const oilStress = data.latest.spread_z30 >= 1;
  const oilActive = data.latest.spread_z30 >= 2;
  const gasActive = data.energyComplex?.natGas?.active === true;
  const coalActive = data.energyComplex?.coal?.active === true;
  const coalAvailable = data.energyComplex?.coal != null;
  const gasOrCoalActive = gasActive || coalActive;
  const trajectory = getTrajectory(data);
  const energyBreadth = getEnergyBreadth(data);
  return {
    label: data.label,
    oilStress,
    oilActive,
    gasActive,
    coalActive,
    coalAvailable,
    gasOrCoalActive,
    goldConfirm: data.signals.goldConfirm,
    trajectoryState: trajectory.state,
    energyBreadthState: energyBreadth.state,
    phase: trajectory.phase,
  };
}

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

const ONBOARDING_LINE = 'This dashboard checks whether war-related energy stress is real, broadening, or fading.';

/** Plain-English headline — acute market stress framing, not war-grade. */
function getCurrentRead(s: PanelState): string {
  if (s.label === 'THEATER') {
    const bucketsActive = s.gasOrCoalActive || s.goldConfirm;
    const easing = s.trajectoryState === 'EASING';
    const base = 'Acute market stress is contained for now.';
    if (!bucketsActive && easing) {
      return `${base} Plumbing stress has cooled from peak and is not broadly spreading.`;
    }
    if (!bucketsActive) {
      return `${base} Stress is localized rather than broadly spreading; plumbing and substitution are quiet.`;
    }
    return `${base} Plumbing stress is low; without stronger plumbing the regime does not escalate.`;
  }
  if (s.label === 'REAL_RISK') {
    if (s.gasOrCoalActive && s.goldConfirm) {
      return 'Acute stress is broadening beyond oil. Oil, gold, and the wider energy complex are confirming together.';
    }
    return 'Acute stress is broadening beyond oil. Oil and gold are confirming; watch for gas or coal to join.';
  }
  if (s.label === 'WATCH') {
    if (s.oilActive && !s.goldConfirm) {
      const quiet = s.gasOrCoalActive ? 'substitution is active' : 'substitution and macro are quiet';
      return `Stress is building, but not yet broadly confirmed. Plumbing is active; ${quiet}.`;
    }
    if (s.goldConfirm && !s.oilActive) {
      return 'Macro is confirming, but plumbing is not yet at strong stress. Stress is localized rather than broadly spreading.';
    }
    if (s.gasOrCoalActive) {
      return 'Stress is broadening beyond oil. Substitution is active.';
    }
    return 'Stress is building, but not yet broadly confirmed. Signals are split across buckets.';
  }
  return 'Mixed signals → WATCH.';
}

/** "What to watch next" bullets based on panel state. */
function getWhatToWatchNext(s: PanelState): string[] {
  const bullets: string[] = [];
  if (s.trajectoryState === 'ESCALATING') bullets.push('Escalation is broadening; watch for confirmation to persist.');
  else if (s.trajectoryState === 'HOLDING') bullets.push('Stress is present, but not clearly broadening yet.');
  else if (s.trajectoryState === 'EASING') bullets.push('Pressure is cooling unless macro or substitution turns on.');
  if (s.energyBreadthState === 'NARROW') bullets.push('If substitution (gas or coal) turns on → stress broadening.');
  else if (s.energyBreadthState === 'BROADENING') bullets.push('If macro confirmation flips on → broadening may become full stress.');
  else if (s.energyBreadthState === 'FULL_STRESS') bullets.push('If substitution and macro stay on together → broad stress remains in place.');
  if (s.label === 'WATCH') {
    if (s.oilActive && !s.goldConfirm) {
      bullets.push('If macro confirmation flips on → likely REAL_RISK', 'If Phase turns EASING for a few days → likely downshift to CONTAINED');
    } else if (s.goldConfirm && !s.oilActive) {
      bullets.push('If plumbing stress rises above Watch → likely REAL_RISK', 'If macro turns off → likely CONTAINED/WATCH');
    } else {
      bullets.push('If macro confirmation flips on → likely REAL_RISK', 'If Phase turns EASING for a few days → likely downshift to CONTAINED');
    }
    if (!s.gasActive) bullets.push('If Gas Stress turns ON → energy supply crunch broadening');
  } else if (s.label === 'REAL_RISK') {
    bullets.push('If macro stays on and Phase stays RISING → escalation', 'If macro turns off → likely downshift to WATCH');
    if (!s.goldConfirm && !s.gasActive) bullets.push('Substitution and macro turn off → risk narrowing back to oil-only stress');
  } else {
    bullets.push('If plumbing stress rises above Watch → WATCH', 'If macro confirmation flips on → WATCH (and watch for REAL_RISK)');
  }
  return bullets.slice(0, 3);
}

/** Why this read — max 3 bullets for regime/trajectory/breadth. */
function getWhyThisReadBullets(data: PlumbingWarLieDetector, s: PanelState): string[] {
  const trajectory = getTrajectory(data);
  const energyBreadth = getEnergyBreadth(data);
  const out: string[] = [];
  if (s.label === 'THEATER') {
    const bucketsActive = s.gasOrCoalActive || s.goldConfirm;
    out.push(bucketsActive
      ? 'Plumbing stress is low; substitution and macro may be active, but without stronger plumbing the regime does not escalate.'
      : 'Plumbing stress is low; substitution and macro are quiet.');
    out.push(`Trajectory is ${trajectory.state}: recent oil move is ${s.phase === 'EASING' ? 'negative' : s.phase === 'FLAT' ? 'flat' : 'positive'} and plumbing is below Watch.`);
  } else if (s.label === 'WATCH') {
    if (s.oilActive && !s.goldConfirm) {
      out.push(`Plumbing stress is present; macro is quiet and ${s.gasOrCoalActive ? 'substitution is active' : 'substitution is quiet'}.`);
    } else if (s.goldConfirm && !s.oilActive) {
      out.push('Macro is confirming but plumbing is not yet at strong stress; stress is localized.');
    } else {
      out.push('Signals are split across buckets; substitution and macro are limited.');
    }
    out.push(`Breadth: ${energyBreadth.state} — ${energyBreadth.reason}`);
  } else {
    out.push(s.gasOrCoalActive ? 'Plumbing strong + substitution and/or macro confirming.' : 'Plumbing strong + macro confirming.');
    out.push(`Breadth: ${energyBreadth.state} — ${energyBreadth.reason}`);
  }
  if (data.productStress?.active && out.length < 3) {
    out.push('Refined product stress (UGA/USO) is active, supporting the plumbing read.');
  }
  return out.slice(0, 3);
}

/** Plain-English verdict one-liner. */
function getVerdict(s: PanelState): string {
  if (s.label === 'REAL_RISK') return 'Plumbing strong + (substitution or macro) confirming → REAL_RISK.';
  if (s.label === 'THEATER') {
    const bucketsActive = s.gasOrCoalActive || s.goldConfirm;
    if (!bucketsActive) return 'Plumbing stress is low; substitution and macro are quiet → CONTAINED.';
    return 'Plumbing stress is low; substitution and macro may be active, but without stronger plumbing → CONTAINED.';
  }
  if (s.oilActive && !s.goldConfirm) return 'Plumbing stress rising, but substitution and macro quiet → WATCH.';
  if (s.goldConfirm && !s.oilActive) return 'Macro confirming, but plumbing not yet stressed → WATCH.';
  return 'Mixed signals → WATCH.';
}

/** Phase: RISING (ROC3 >= 0.5%), EASING (<= -0.5%), FLAT otherwise. */
function getPhase(roc3: number): 'RISING' | 'EASING' | 'FLAT' {
  if (roc3 >= 0.5) return 'RISING';
  if (roc3 <= -0.5) return 'EASING';
  return 'FLAT';
}

/** Compute trajectory when artifact lacks it (backwards compat). Used by getPanelState. */
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
        ? 'Pressure is cooling; macro and substitution are quiet.'
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
  return { state: oilStress ? 'BROADENING' : 'NARROW', reason: oilStress ? 'Signals are split across buckets.' : 'Stress is still mostly confined to oil.' };
}

/** "Gas and coal" phrase for plain-English — matches actual signal state. */
function gasCoalPhrase(s: PanelState): string {
  if (s.gasActive && s.coalActive) return 'gas and coal are on';
  if (s.gasActive) return 'gas is on';
  if (s.coalActive) return 'coal is on';
  if (s.coalAvailable) return 'gas and coal are off';
  return 'gas is off';
}

/** Plain-English Explain bullets + "Not X because" lines + optional lag line. */
function getExplainBullets(data: PlumbingWarLieDetector, s: PanelState): {
  bullets: string[];
  notLines: string[];
  lagLine: string | null;
} {
  const trajectory = getTrajectory(data);
  const bullets: string[] = [];
  const notLines: string[] = [];
  const lagTradingDays = data.dataFreshness?.lagTradingDays ?? 0;
  const laggingList = data.dataFreshness?.laggingTickers ?? [];
  const lagLine: string | null =
    lagTradingDays > 0 && laggingList.length > 0
      ? `This panel is ${lagTradingDays} trading day${lagTradingDays === 1 ? '' : 's'} behind because ${laggingList[0]}${laggingList.length > 1 ? ` and ${laggingList.length - 1} other input${laggingList.length === 2 ? '' : 's'}` : ''} ${laggingList.length === 1 ? 'has' : 'have'} not printed the latest close yet.`
      : lagTradingDays > 0
        ? 'The model is waiting for the last common date across all required inputs.'
        : null;

  if (s.label === 'THEATER') {
    const bucketsActive = s.gasOrCoalActive || s.goldConfirm;
    bullets.push('Bottom line: Plumbing stress has cooled; without stronger plumbing, the regime stays contained.');
    bullets.push(bucketsActive
      ? 'Why this is CONTAINED: Plumbing stress is low; substitution and macro may be active, but without stronger plumbing the regime does not escalate.'
      : 'Why this is CONTAINED: Plumbing stress is low; substitution and macro are quiet.');
    bullets.push(`Why this is ${trajectory.state}: The recent oil move is ${s.phase === 'EASING' ? 'negative' : s.phase === 'FLAT' ? 'flat' : 'positive'} and plumbing stress is back below Watch.`);
    bullets.push(bucketsActive
      ? 'What would flip this back up: Plumbing stress rising above Watch would move toward WATCH; substitution and macro are already active, so plumbing is the gate.'
      : 'What would flip this back up: Plumbing stress rising above Watch again, especially if substitution or macro turns on.');
    notLines.push('Not WATCH because: plumbing stress is below the Watch threshold.');
    notLines.push(bucketsActive
      ? 'Not REAL_RISK because: plumbing not strong enough, even though substitution and macro may be active.'
      : 'Not REAL_RISK because: plumbing not strong enough, or substitution and macro are quiet.');
  } else if (s.label === 'WATCH') {
    if (s.oilActive && !s.goldConfirm) {
      bullets.push('Bottom line: Plumbing stress is still present, but the move is not clearly broadening.');
      bullets.push(`Why this is not worse: Macro is quiet; ${s.gasOrCoalActive ? 'substitution is active' : 'substitution is quiet'}.`);
      bullets.push('What would make it worse: If macro confirmation flips on while plumbing stays high, this likely moves toward REAL_RISK.');
      bullets.push(s.gasOrCoalActive ? 'What would ease it: If substitution turns off while plumbing decelerates, pressure is likely cooling.' : 'What would ease it: If substitution and macro stay quiet while plumbing decelerates, pressure is likely cooling.');
      notLines.push('Not REAL_RISK because: macro is quiet.');
    } else if (s.goldConfirm && !s.oilActive) {
      bullets.push('Bottom line: Macro is confirming, but plumbing is not yet at strong stress.');
      bullets.push('Why this is not worse: The move is still mostly confined to oil.');
      bullets.push('What would make it worse: If plumbing stress reaches strong (z30 ≥ 2), this likely moves toward REAL_RISK.');
      bullets.push('What would ease it: If macro turns off, this likely downshifts to CONTAINED.');
      notLines.push('Not REAL_RISK because: plumbing is not at strong stress.');
    } else {
      bullets.push('Bottom line: Plumbing is present, but signals are split across buckets.');
      bullets.push('Why this is not worse: Substitution and macro are limited.');
      bullets.push('What would make it worse: If substitution turns on, stress is broadening beyond oil.');
      bullets.push(s.gasOrCoalActive ? 'What would ease it: If substitution turns off, this remains narrow.' : 'What would ease it: If substitution and macro stay quiet, this remains narrow.');
      notLines.push('Not REAL_RISK because: macro is quiet or plumbing is not at strong stress.');
    }
  } else {
    bullets.push('Bottom line: Plumbing strong; substitution or macro confirming.');
    bullets.push(s.gasOrCoalActive ? 'Why this is REAL_RISK: Plumbing strong + substitution active and/or macro confirming.' : 'Why this is REAL_RISK: Plumbing strong + macro confirming.');
    bullets.push(s.gasOrCoalActive ? 'What would make it worse: If substitution and macro stay on together, broad stress remains in place.' : 'What would make it worse: If substitution turns on, stress is broadening beyond oil.');
    bullets.push('What would ease it: If macro turns off, this likely downshifts to WATCH.');
    notLines.push('Not WATCH because: plumbing is Active and macro is confirming.');
  }

  if (data.productStress?.active) {
    bullets.push('Refined product stress (UGA/USO) is active, supporting the plumbing read.');
  }

  return { bullets, notLines, lagLine };
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

/** Lag badge styling: fresh = positive, 1d = amber, 2+d = red. */
function lagBadgeClass(lagTradingDays: number): string {
  if (lagTradingDays === 0) return 'bg-emerald-900/40 border-emerald-700/60 text-emerald-200';
  if (lagTradingDays === 1) return 'bg-amber-900/40 border-amber-700/60 text-amber-200';
  return 'bg-red-900/40 border-red-700/60 text-red-200';
}

function labelBadgeClass(displayLabel: string): string {
  switch (displayLabel) {
    case 'CONTAINED':
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
  const panelState = useMemo(() => getPanelState(data), [data]);
  const trajectory = useMemo(() => getTrajectory(data), [data]);
  const energyBreadth = useMemo(() => getEnergyBreadth(data), [data]);
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
  const laggingList = dataFreshness?.laggingTickers ?? [];

  return (
    <div className="container mx-auto px-4 py-4 border-b border-zinc-800 space-y-4">
      {/* Onboarding */}
      <p className="text-sm text-slate-400">{ONBOARDING_LINE}</p>

      {/* Current read */}
      <p className="text-base font-medium text-slate-200">{getCurrentRead(panelState)}</p>

      {/* Chip row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-300 text-xs">Plumbing:</span>
          <span
            className={`inline-flex items-center rounded-md px-3 py-1 text-sm font-medium border ${labelBadgeClass(displayRegime(label))}`}
          >
            {displayRegime(label)}
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
          {dataFreshness && (
            <span
              className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium border ${lagBadgeClass(lagTradingDays)}`}
              title={lagTradingDays === 0 ? `All inputs aligned as of ${dataFreshness.maxLastDate}` : `Held back by: ${laggingList.join(', ')}`}
            >
              {lagTradingDays === 0
                ? `Fresh as of ${dataFreshness.maxLastDate}`
                : lagTradingDays === 1
                  ? '1-day lag'
                  : `Data lag: ${lagTradingDays}d`}
            </span>
          )}
        </div>
        <span className="text-xs text-slate-500">asOf: {data.asOf}</span>
      </div>

      {/* Bucket chips row */}
      {(() => {
        const bucket = getBucketStateForDisplay(data);
        const macroLabel = bucket.macroConfirm ? 'confirming' : 'quiet';
        return (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={chipBase}>Plumbing: {bucketPlumbingLabel(bucket.physicalPlumbing)}</span>
            <span className={chipBase}>Substitution: {bucket.substitutionActive ? 'active' : 'inactive'}</span>
            <span className={chipBase}>Macro: {macroLabel}</span>
          </div>
        );
      })()}

      {/* Why this read */}
      <div className="rounded border border-zinc-800 bg-zinc-900/30 px-3 py-2">
        <p className="text-xs font-medium text-slate-400 mb-1.5">Why this read</p>
        <ul className="text-xs text-slate-300 space-y-0.5 list-disc list-inside">
          {getWhyThisReadBullets(data, panelState).map((bullet, i) => (
            <li key={i}>{bullet}</li>
          ))}
        </ul>
      </div>

      {/* What would change this read */}
      <div className="rounded border border-zinc-800 bg-zinc-900/30 px-3 py-2">
        <p className="text-xs font-medium text-slate-400 mb-1.5">What would change this read</p>
        <ul className="text-xs text-slate-300 space-y-0.5 list-disc list-inside">
          {getWhatToWatchNext(panelState).map((bullet, i) => (
            <li key={i}>{bullet}</li>
          ))}
        </ul>
      </div>

      {/* Lag sentence when lag exists */}
      {lagTradingDays > 0 && dataFreshness && (
        <p className="text-sm text-amber-200/90">
          {laggingList.length === 1
            ? `${laggingList[0]} is still on ${dataFreshness.minLastDate} while the other inputs are on ${dataFreshness.maxLastDate}. This panel is lagging by ${lagTradingDays} trading day${lagTradingDays === 1 ? '' : 's'}.`
            : `One or more inputs are still on ${dataFreshness.minLastDate} while others are on ${dataFreshness.maxLastDate}. Held back by: ${laggingList.length <= 3 ? laggingList.join(', ') : laggingList.slice(0, 3).join(', ') + ` +${laggingList.length - 3} more`}.`}
          {' '}This call is held back by lagging input data, not by the model itself.
        </p>
      )}

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

      {/* Technical details (collapsed) */}
      <div className="rounded border border-zinc-800 bg-zinc-900/30 p-3">
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
            {data.productStress != null ? (
              <li>
                <strong>Product stress (UGA/USO)</strong>: z30={data.productStress.z30}, roc3={data.productStress.roc3}%, active={data.productStress.active ? 'yes' : 'no'}
              </li>
            ) : null}
            <li>
              <strong>Legacy score</strong>: {score}/3 (oil + gold; regime is bucket-based)
            </li>
            {(() => {
              const bucket = getBucketStateForDisplay(data);
              return (
                <li>
                  <strong>Bucket state</strong>: plumbing={bucket.physicalPlumbing}, substitution={bucket.substitutionActive ? 'active' : 'inactive'}, macro={bucket.macroConfirm ? 'confirming' : 'quiet'}
                </li>
              );
            })()}
            {(() => {
              const lh = data.labelHistory;
              if (!lh || lh.length === 0) return null;
              let lastRealRiskStart: string | null = null;
              for (let i = lh.length - 1; i >= 0; i--) {
                if (lh[i]!.label === 'REAL_RISK') {
                  let j = i;
                  while (j > 0 && lh[j - 1]!.label === 'REAL_RISK') j--;
                  lastRealRiskStart = lh[j]!.date;
                  break;
                }
              }
              return lastRealRiskStart ? (
                <li>
                  <strong>Latest REAL_RISK began</strong>: {lastRealRiskStart}
                </li>
              ) : null;
            })()}
          </ul>
        )}
      </div>

      {/* Chart 1: Spread + MA5 with regime bands */}
      <div className="rounded border border-zinc-800 bg-zinc-900/40 p-3">
        <p className="text-xs text-slate-400 mb-2">
          Oil dislocation (Brent vs WTI proxies)
          {regimeBands.length > 0 && (
            <span className="ml-2 text-slate-500">· Bands: CONTAINED (slate) / WATCH (amber) / REAL_RISK (red)</span>
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
