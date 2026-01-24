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

interface HealthHistoryChartProps {
  data: TrendHealthHistoryPoint[];
  showDiffusion?: boolean;
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
function CustomTooltip({ active, payload, showDiffusion }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload as TrendHealthHistoryPoint;
    
    // Handle UNKNOWN points
    if (data.regimeLabel === 'UNKNOWN' || data.greenPct === null) {
      return (
        <div className="bg-zinc-800 border border-zinc-700 rounded p-2 shadow-lg">
          <p className="text-xs text-zinc-400 mb-1">{data.date}</p>
          <p className="text-xs text-zinc-500">Unavailable (insufficient history)</p>
        </div>
      );
    }
    
    return (
      <div className="bg-zinc-800 border border-zinc-700 rounded p-2 shadow-lg">
        <p className="text-xs text-zinc-400 mb-1">{data.date}</p>
        <p className="text-sm font-semibold text-green-400">
          Green: {data.greenPct}%
        </p>
        {data.yellowPct !== undefined && data.yellowPct !== null && (
          <p className="text-xs text-yellow-400">Yellow: {data.yellowPct}%</p>
        )}
        {data.redPct !== undefined && data.redPct !== null && (
          <p className="text-xs text-red-400">Red: {data.redPct}%</p>
        )}
        {showDiffusion && data.diffusionPct !== null && data.diffusionPct !== undefined && (
          <p className="text-xs text-blue-400 mt-1">
            Diffusion: {data.diffusionPct}%
          </p>
        )}
      </div>
    );
  }
  return null;
}

export function HealthHistoryChart({ data, showDiffusion = false }: HealthHistoryChartProps) {
  // Determine if we should use compact date format for labels (for longer ranges)
  const isLongRange = data.length > 180;

  // Format data for Recharts: use timestamp for X-axis (unique per day), keep date for tooltip
  // Using timestamp ensures each daily point has a unique X value, preventing monthly bucketing
  const chartData = data.map((point) => ({
    ...point,
    dateTs: new Date(point.date).getTime(), // Numeric timestamp for X-axis (unique per day)
  }));

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-zinc-300 mb-4">
        Market Health (Green %)
      </h3>
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
            domain={[0, 100]}
            label={{ value: '%', position: 'insideLeft', fill: '#71717a' }}
          />
          <Tooltip content={(props) => <CustomTooltip {...props} showDiffusion={showDiffusion} />} />
          <Line
            type="monotone"
            dataKey="greenPct"
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
    </div>
  );
}
