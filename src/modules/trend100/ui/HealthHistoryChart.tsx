/**
 * HealthHistoryChart component
 * 
 * Displays market health history as a line chart.
 */

'use client';

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
} from 'recharts';
import type { TrendHealthHistoryPoint } from '../types';

type MetricKey =
  | 'greenPct'
  | 'heatScore'
  | 'pctAboveUpperBand'
  | 'stretch200MedianPct'
  | 'medianDistanceAboveUpperBandPct';

/** Chart data point: metric fields become null for UNKNOWN points so Recharts renders gaps. */
type ChartPoint = Omit<TrendHealthHistoryPoint, MetricKey | 'diffusionPct'> & {
  dateTs: number;
  greenPct: number | null;
  heatScore: number | null;
  pctAboveUpperBand: number | null;
  stretch200MedianPct: number | null;
  medianDistanceAboveUpperBandPct: number | null;
  diffusionPct: number | null;
};

interface HealthHistoryChartProps {
  data: TrendHealthHistoryPoint[];
  showDiffusion?: boolean;
  metricKey?: MetricKey;
  metricLabel?: string;
  yDomain?: [number | 'auto' | 'dataMin' | 'dataMax', number | 'auto' | 'dataMin' | 'dataMax'];
  /** Dates where Turbulence Green Bar is active (for subtle overlay) */
  greenBarDates?: Set<string>;
}

/**
 * Format date for X-axis tick labels (MM/DD or MM/YY for longer ranges)
 */
function formatTickLabel(dateStr: string, isLongRange: boolean): string {
  const date = new Date(dateStr);
  if (isLongRange) {
    return `${date.getMonth() + 1}/${date.getFullYear().toString().slice(-2)}`;
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * Custom tooltip for the chart - always shows full daily date
 */
function CustomTooltip({ active, payload, showDiffusion, metricKey, metricLabel }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload as TrendHealthHistoryPoint;
    
    // Handle UNKNOWN points
    if (data.regimeLabel === 'UNKNOWN') {
      return (
        <div className="bg-zinc-800 border border-zinc-700 rounded p-2 shadow-lg">
          <p className="text-xs text-zinc-400 mb-1">{data.date}</p>
          <p className="text-xs text-zinc-500">Unavailable (insufficient history)</p>
        </div>
      );
    }
    
    // Show eligible context if available (MACRO deck)
    const hasEligibleInfo = data.eligibleCount !== undefined && data.totalTickers !== undefined;
    const eligibleInfo = hasEligibleInfo && data.eligibleCount !== data.totalTickers
      ? `Eligible: ${data.eligibleCount} / Total: ${data.totalTickers}`
      : null;
    const missingInfo = data.missingCount !== undefined && data.missingCount > 0
      ? `Missing: ${data.missingCount}`
      : null;
    const ineligibleInfo = data.ineligibleCount !== undefined && data.ineligibleCount > 0
      ? `Ineligible: ${data.ineligibleCount}`
      : null;

    return (
      <div className="bg-zinc-800 border border-zinc-700 rounded p-2 shadow-lg">
        <p className="text-xs text-zinc-400 mb-1">{data.date}</p>
        <p className="text-sm font-semibold text-zinc-100">
          {metricLabel}: {metricKey ? (data as any)[metricKey] : data.greenPct}
          {metricKey === 'stretch200MedianPct' ? '%' : '%'}
        </p>
        <p className="text-xs text-green-400">Green: {data.greenPct}%</p>
        <p className="text-xs text-yellow-400">Yellow: {data.yellowPct}%</p>
        <p className="text-xs text-red-400">Red: {data.redPct}%</p>
        {showDiffusion && (
          <p className="text-xs text-blue-400 mt-1">
            Diffusion: {data.diffusionPct}%
          </p>
        )}
        {eligibleInfo && (
          <p className="text-xs text-zinc-500 mt-1">{eligibleInfo}</p>
        )}
        {missingInfo && (
          <p className="text-xs text-zinc-500">{missingInfo}</p>
        )}
        {ineligibleInfo && (
          <p className="text-xs text-zinc-500">{ineligibleInfo}</p>
        )}
      </div>
    );
  }
  return null;
}

export function HealthHistoryChart({
  data,
  showDiffusion = false,
  metricKey = 'greenPct',
  metricLabel = 'Health (Green %)',
  yDomain = [0, 100],
  greenBarDates,
}: HealthHistoryChartProps) {
  // Determine if we should use compact date format for labels (for longer ranges)
  const isLongRange = data.length > 180;

  // Format data for Recharts: use timestamp for X-axis (unique per day), keep date for tooltip.
  // Mask UNKNOWN points: set metric values to null so Recharts renders gaps (no flatline at 0).
  const chartData: ChartPoint[] = data.map((point) => {
    const isUnknown = point.regimeLabel === 'UNKNOWN';
    const dateTs = new Date(point.date).getTime();
    return {
      ...point,
      dateTs,
      greenPct: isUnknown ? null : point.greenPct,
      heatScore: isUnknown ? null : point.heatScore,
      pctAboveUpperBand: isUnknown ? null : point.pctAboveUpperBand,
      stretch200MedianPct: isUnknown ? null : point.stretch200MedianPct,
      medianDistanceAboveUpperBandPct: isUnknown ? null : point.medianDistanceAboveUpperBandPct,
      diffusionPct: isUnknown ? null : point.diffusionPct,
    } as ChartPoint;
  });

  const isEmpty = chartData.length === 0;

  // Chart date range for filtering Green Bar dates
  const chartMinDate = chartData[0]?.date ?? null;
  const chartMaxDate =
    chartData.length > 0 ? chartData[chartData.length - 1]!.date : null;

  // Green bar overlay: one band per event (consecutive trading days)
  // Use chart's date series for adjacency: weekend/holiday gaps don't split runs
  // Also compute daysInView and eventsInView for legend
  const { greenBarRuns, daysInView, eventsInView } = useMemo(() => {
    if (!greenBarDates || greenBarDates.size === 0 || !chartMinDate || !chartMaxDate) {
      return { greenBarRuns: [], daysInView: 0, eventsInView: 0 };
    }
    const inRange = [...greenBarDates].filter(
      (d) => d >= chartMinDate && d <= chartMaxDate
    );
    if (inRange.length === 0) {
      return { greenBarRuns: [], daysInView: 0, eventsInView: 0 };
    }
    inRange.sort();
    const dateToIdx = new Map<string, number>();
    chartData.forEach((p, i) => dateToIdx.set(p.date, i));
    const runs: string[][] = [];
    let current: string[] = [inRange[0]!];
    const MS_PER_DAY = 86400000;
    for (let i = 1; i < inRange.length; i++) {
      const prevDate = inRange[i - 1]!;
      const currDate = inRange[i]!;
      const prevIdx = dateToIdx.get(prevDate);
      const currIdx = dateToIdx.get(currDate);
      const contiguous =
        prevIdx != null && currIdx != null && currIdx === prevIdx + 1;
      if (contiguous) {
        current.push(currDate);
      } else if (prevIdx != null && currIdx != null) {
        runs.push(current);
        current = [currDate];
      } else {
        current.push(currDate);
      }
    }
    runs.push(current);
    const greenBarRuns: Array<{ x1: number; x2: number }> = runs.map((run) => {
      const first = run[0]!;
      const last = run[run.length - 1]!;
      const x1 = new Date(first).getTime();
      const x2 = new Date(last).getTime() + MS_PER_DAY - 1;
      return { x1, x2 };
    });
    return {
      greenBarRuns,
      daysInView: inRange.length,
      eventsInView: runs.length,
    };
  }, [greenBarDates, chartMinDate, chartMaxDate, chartData]);

  // Shaded "missing history" region: from chart start until first non-UNKNOWN point
  const minTs = chartData[0]?.dateTs;
  const firstKnownTs = chartData.find((p) => p.regimeLabel !== 'UNKNOWN')?.dateTs;
  const maxTs = chartData[chartData.length - 1]?.dateTs;
  const showShade =
    minTs != null && firstKnownTs != null && firstKnownTs > minTs;
  const showShadeAllUnknown =
    minTs != null && maxTs != null && firstKnownTs == null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-zinc-300 mb-4">
        {metricLabel}
      </h3>
      {isEmpty ? (
        <div className="flex items-center justify-center h-[300px] rounded border border-zinc-700/50 bg-zinc-800/30 text-zinc-500 text-sm">
          No history data to display.
        </div>
      ) : (
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
          <XAxis
            dataKey="dateTs"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            stroke="#71717a"
            tick={{ fill: '#71717a', fontSize: 12 }}
            tickFormatter={(value) => {
              // Format timestamp back to date string for label
              const dateStr = new Date(value).toISOString().split('T')[0]!;
              return formatTickLabel(dateStr, isLongRange);
            }}
            interval="preserveStartEnd"
            minTickGap={30}
          />
          <YAxis
            stroke="#71717a"
            tick={{ fill: '#71717a', fontSize: 12 }}
            domain={yDomain}
            label={{ value: '%', position: 'insideLeft', fill: '#71717a' }}
          />
          <Tooltip
            content={(props) => (
              <CustomTooltip
                {...props}
                showDiffusion={showDiffusion}
                metricKey={metricKey}
                metricLabel={metricLabel}
              />
            )}
          />
          {(showShade || showShadeAllUnknown) && (
            <ReferenceArea
              x1={minTs!}
              x2={showShadeAllUnknown ? maxTs! : firstKnownTs!}
              fill="rgba(148, 163, 184, 0.12)"
              strokeOpacity={0}
              ifOverflow="extendDomain"
            />
          )}
          {greenBarRuns.map((area, i) => (
            <ReferenceArea
              key={`gb-${i}`}
              x1={area.x1}
              x2={area.x2}
              fill="rgba(34, 197, 94, 0.15)"
              stroke="rgba(34, 197, 94, 0.25)"
              strokeOpacity={0.6}
              ifOverflow="extendDomain"
            />
          ))}
          <Line
            type="monotone"
            dataKey={metricKey}
            stroke="#22c55e"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#22c55e' }}
            connectNulls={false}
          />
          {showDiffusion && (
            <Line
              type="monotone"
              dataKey="diffusionPct"
              stroke="#3b82f6"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              dot={false}
              activeDot={{ r: 3, fill: '#3b82f6' }}
              connectNulls={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      )}
      {!isEmpty && eventsInView > 0 && (() => {
        const tradingDaysInView = chartData.length;
        const density =
          tradingDaysInView > 0 ? daysInView / tradingDaysInView : 0;
        const high =
          eventsInView >= 2 || daysInView >= 15 || density >= 0.25;
        const elevated =
          eventsInView === 1 || daysInView >= 7 || density >= 0.12;
        const activityLevel = high ? 'HIGH' : elevated ? 'ELEVATED' : null;
        const activityLabel =
          activityLevel === 'HIGH' ? 'HIGH' : activityLevel === 'ELEVATED' ? 'ELEVATED' : '';
        const titleText =
          activityLevel
            ? `Green Bar activity: ${activityLevel} (${daysInView} days / ${eventsInView} events in view)`
            : undefined;
        return (
          <div className="mt-2 text-xs text-slate-400 space-y-0.5">
            <div>Vertical bands = Green Bar events.</div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>Green Bar in view: {daysInView} days / {eventsInView} events</span>
              {activityLevel && (
                <>
                  <span className="text-slate-500">·</span>
                  <span
                    className="inline-flex items-center gap-1.5 text-slate-400"
                    title={titleText}
                    aria-label={titleText}
                  >
                    <span className="text-slate-400">Activity</span>
                    <span
                      className={
                        activityLevel === 'HIGH'
                          ? 'relative h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400 ring-2 ring-amber-500/40 ring-offset-1 ring-offset-zinc-900 animate-pulse'
                          : 'relative h-2 w-2 shrink-0 rounded-full bg-amber-500/80 ring-2 ring-amber-500/20 ring-offset-1 ring-offset-zinc-900'
                      }
                      aria-hidden
                    />
                    <span
                      className={
                        activityLevel === 'HIGH'
                          ? 'text-amber-300/90'
                          : 'text-slate-300'
                      }
                    >
                      {activityLabel}
                    </span>
                  </span>
                </>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
