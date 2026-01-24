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
function CustomTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload as TrendHealthHistoryPoint;
    return (
      <div className="bg-zinc-800 border border-zinc-700 rounded p-2 shadow-lg">
        <p className="text-xs text-zinc-400 mb-1">{data.date}</p>
        <p className="text-sm font-semibold text-green-400">
          Green: {data.greenPct}%
        </p>
        {data.yellowPct !== undefined && (
          <p className="text-xs text-yellow-400">Yellow: {data.yellowPct}%</p>
        )}
        {data.redPct !== undefined && (
          <p className="text-xs text-red-400">Red: {data.redPct}%</p>
        )}
      </div>
    );
  }
  return null;
}

export function HealthHistoryChart({ data }: HealthHistoryChartProps) {
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
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="greenPct"
            stroke="#22c55e"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#22c55e' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
