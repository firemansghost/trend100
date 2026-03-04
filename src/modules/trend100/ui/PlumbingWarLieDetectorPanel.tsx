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

/** Plain-English verdict one-liner. */
function getVerdict(label: PlumbingWarLieDetector['label'], signals: PlumbingWarLieDetector['signals']): string {
  if (label === 'REAL_RISK') return 'Oil spread stress + gold confirmation → REAL_RISK.';
  if (label === 'THEATER') return 'No spread stress + no gold confirmation → THEATER.';
  if (signals.spreadActive && !signals.goldConfirm) return 'Oil spread is stressed, but gold isn\'t confirming → WATCH.';
  if (signals.goldConfirm && !signals.spreadActive) return 'Gold confirming, but oil spread not stressed → WATCH.';
  return 'Mixed signals → WATCH.';
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
  const [explainOpen, setExplainOpen] = useState(false);

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

  const hasLag = (dataFreshness?.lagTradingDays ?? 0) > 1;
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
          <span className={chipBase}>Score: {score}/3</span>
        </div>
        <span className="text-xs text-slate-500">asOf: {data.asOf}</span>
      </div>

      {/* Verdict one-liner */}
      <p className="text-sm text-slate-300">{getVerdict(label, signals)}</p>

      {/* Signal cards: Oil Stress + Gold Confirm */}
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
      </div>

      {/* Data freshness */}
      {(inputsLast || dataFreshness) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500">Data freshness:</span>
          {dataFreshness && (
            <>
              <span className={chipBase}>
                min: {dataFreshness.minLastDate} · max: {dataFreshness.maxLastDate}
              </span>
              {hasLag && (
                <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs bg-amber-900/40 border border-amber-700/50 text-amber-200">
                  ⚠ Lag {dataFreshness.lagTradingDays}d
                </span>
              )}
              {laggingList.length > 0 && (
                <span className={chipBase} title="Tickers holding data back">
                  Lagging: {laggingList.length <= 5 ? laggingList.join(', ') : laggingList.slice(0, 5).join(', ') + ` +${laggingList.length - 5}`}
                </span>
              )}
            </>
          )}
          {inputsLast && (
            <span className={chipBase} title="Per-ticker last EOD date">
              {['BNO', 'USO', 'GLD', 'SPY', 'TIP', 'UUP']
                .map((s) => `${s}=${inputsLast[s as keyof typeof inputsLast] ?? '?'}`)
                .join(' ')}
            </span>
          )}
        </div>
      )}

      {/* Why this label? (collapsible) */}
      <div className="rounded border border-zinc-800 bg-zinc-900/30 p-3">
        <button
          type="button"
          onClick={() => setExplainOpen(!explainOpen)}
          className="text-xs font-medium text-slate-400 hover:text-slate-300 flex items-center gap-1"
        >
          {explainOpen ? '▼' : '▶'} Explain
        </button>
        {explainOpen && (
          <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside mt-2">
            <li>
              <strong>Oil stress (z-score)</strong>: {latest.spread_z30.toFixed(2)} — Watch ≥1, Active ≥2
              {latest.spread_z30 >= 2 ? ' ✓ Active (+2)' : latest.spread_z30 >= 1 ? ' ✓ Watch (+1)' : ' (0)'}
            </li>
            <li>
              <strong>Oil stress change (3d)</strong>: {latest.spread_roc3.toFixed(2)}% (3-day rate of change)
            </li>
            <li>
              <strong>GoldConfirm</strong>: GLD/SPY & GLD/TIP 5d ROC both &gt;0 — {signals.goldConfirm ? '✓ (+1)' : 'no'}
            </li>
            <li>
              <strong>Score</strong>: {score}/3 (max: +2 z30≥2, +1 z30≥1, +1 goldConfirm)
            </li>
          </ul>
        )}
      </div>

      {/* Chart 1: Spread + MA5 with regime bands */}
      <div className="rounded border border-zinc-800 bg-zinc-900/40 p-3">
        <p className="text-xs text-slate-400 mb-2">
          ETF proxy spread (BNO − USO), direction &gt; level
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
