/**
 * HealthHistoryChart component
 * 
 * Displays market health history as a line chart.
 */

'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { TrendHealthHistoryPoint } from '../types';

type MetricKey =
  | 'greenPct'
  | 'heatScore'
  | 'pctAboveUpperBand'
  | 'stretch200MedianPct'
  | 'medianDistanceAboveUpperBandPct';

interface HealthHistoryChartProps {
  data: TrendHealthHistoryPoint[];
  showDiffusion?: boolean;
  metricKey?: MetricKey;
  metricLabel?: string;
  yDomain?: [number | 'auto' | 'dataMin' | 'dataMax', number | 'auto' | 'dataMin' | 'dataMax'];
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
}: HealthHistoryChartProps) {
  // Determine if we should use compact date format for labels (for longer ranges)
  const isLongRange = data.length > 180;

  // Format data for Recharts: use timestamp for X-axis (unique per day), keep date for tooltip
  // Using timestamp ensures each daily point has a unique X value, preventing monthly bucketing
  const chartData = data.map((point) => ({
    ...point,
    dateTs: new Date(point.date).getTime(), // Numeric timestamp for X-axis (unique per day)
  }));

  const isEmpty = chartData.length === 0;

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
    </div>
  );
}
