/**
 * PlumbingWarLieDetectorPanel — War Lie Detector (Truth in the Pipes) panel
 *
 * Shows status badge, checklist (spread z30, ROC3, GoldConfirm), and charts.
 */

'use client';

import { useMemo } from 'react';
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
  const { latest, signals, label, score, history, labelHistory } = data;

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

      {/* Checklist */}
      <div className="flex flex-wrap gap-2">
        <span className={chipBase} title="Z-score of BNO/USO ratio over 30 days. Watch ≥1, Active ≥2.">
          Spread z30: {latest.spread_z30.toFixed(2)}
          {latest.spread_z30 >= 2 ? ' ✓ Active' : latest.spread_z30 >= 1 ? ' ✓ Watch' : ' (below 1)'}
        </span>
        <span className={chipBase} title="3-day ROC of BNO/USO ratio.">
          Spread ROC3: {latest.spread_roc3.toFixed(2)}%
        </span>
        <span className={chipBase} title="Gold confirmation: GLD/SPY and GLD/TIP 5-day ROC both positive.">
          GoldConfirm: {signals.goldConfirm ? 'true ✓' : 'false'}
        </span>
      </div>

      {/* Chart 1: Spread + MA5 with regime bands */}
      <div className="rounded border border-zinc-800 bg-zinc-900/40 p-3">
        <p className="text-xs text-slate-400 mb-2">
          BNO–USO spread (display) + MA5
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
