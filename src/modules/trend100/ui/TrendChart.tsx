/**
 * TrendChart component
 * 
 * Displays price chart with moving averages and bands.
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
  Legend,
} from 'recharts';
import type { TickerSeriesPoint } from '../data/getTickerSeries';
import type { ChartVisibility } from './TrendModal';

interface TrendChartProps {
  points: TickerSeriesPoint[];
  visible: ChartVisibility;
}

/**
 * Format date for display (MM/DD or MM/YY for longer ranges)
 */
function formatDate(dateStr: string, isLongRange: boolean): string {
  const date = new Date(dateStr);
  if (isLongRange) {
    return `${date.getMonth() + 1}/${date.getFullYear().toString().slice(-2)}`;
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * Custom tooltip for the chart
 */
function CustomTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload as TickerSeriesPoint;
    return (
      <div className="bg-zinc-800 border border-zinc-700 rounded p-2 shadow-lg">
        <p className="text-xs text-zinc-400 mb-1">{data.date}</p>
        {data.price !== undefined && (
          <p className="text-sm font-semibold text-zinc-100">
            Price: ${data.price.toFixed(2)}
          </p>
        )}
        {data.sma200 !== undefined && (
          <p className="text-xs text-zinc-400">200d SMA: ${data.sma200.toFixed(2)}</p>
        )}
        {data.sma50w !== undefined && (
          <p className="text-xs text-zinc-400">50w SMA: ${data.sma50w.toFixed(2)}</p>
        )}
        {data.ema50w !== undefined && (
          <p className="text-xs text-zinc-400">50w EMA: ${data.ema50w.toFixed(2)}</p>
        )}
      </div>
    );
  }
  return null;
}

export function TrendChart({ points, visible }: TrendChartProps) {
  if (points.length === 0) {
    return (
      <div className="bg-zinc-800 rounded p-8 text-center text-zinc-500">
        No data available
      </div>
    );
  }

  // Determine if we should use compact date format
  const isLongRange = points.length > 180;

  // Format data for Recharts
  const chartData = points.map((point) => ({
    ...point,
    dateLabel: formatDate(point.date, isLongRange),
  }));

  // Check if we have band data (for toggle visibility)
  const hasBand = points.some(
    (p) => p.upperBand !== undefined && p.lowerBand !== undefined
  );

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
        <XAxis
          dataKey="dateLabel"
          stroke="#71717a"
          tick={{ fill: '#71717a', fontSize: 11 }}
          interval="preserveStartEnd"
        />
        <YAxis
          stroke="#71717a"
          tick={{ fill: '#71717a', fontSize: 11 }}
          label={{ value: '$', position: 'insideLeft', fill: '#71717a', fontSize: 11 }}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: '11px', color: '#71717a' }}
          iconType="line"
        />
        {/* Price line (strongest) */}
        {visible.price && (
          <Line
            type="monotone"
            dataKey="price"
            stroke="#e4e4e7"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 5, fill: '#e4e4e7' }}
            name="Price"
          />
        )}
        {/* 200d SMA */}
        {visible.sma200 && (
          <Line
            type="monotone"
            dataKey="sma200"
            stroke="#22c55e"
            strokeWidth={1.5}
            strokeDasharray="5 5"
            dot={false}
            activeDot={{ r: 3, fill: '#22c55e' }}
            name="200d SMA"
          />
        )}
        {/* 50w SMA */}
        {visible.sma50w && (
          <Line
            type="monotone"
            dataKey="sma50w"
            stroke="#f59e0b"
            strokeWidth={1.5}
            strokeDasharray="3 3"
            dot={false}
            activeDot={{ r: 3, fill: '#f59e0b' }}
            name="50w SMA"
          />
        )}
        {/* 50w EMA */}
        {visible.ema50w && (
          <Line
            type="monotone"
            dataKey="ema50w"
            stroke="#8b5cf6"
            strokeWidth={1.5}
            strokeDasharray="2 2"
            dot={false}
            activeDot={{ r: 3, fill: '#8b5cf6' }}
            name="50w EMA"
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
