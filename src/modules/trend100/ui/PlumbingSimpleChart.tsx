/**
 * PlumbingSimpleChart — minimal Recharts line chart for plumbing data
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

export interface PlumbingChartLine {
  dataKey: string;
  stroke: string;
  name?: string;
}

interface PlumbingSimpleChartProps {
  data: Array<{ date: string; [key: string]: string | number }>;
  lines: PlumbingChartLine[];
  height?: number;
}

function formatTickLabel(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name?: string; value?: number; dataKey: string; payload?: Record<string, unknown> }> }) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]?.payload as { date: string } | undefined;
  if (!p) return null;
  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded p-2 shadow-lg">
      <p className="text-xs text-zinc-400 mb-1">{p.date}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="text-sm text-slate-200">
          {entry.name ?? entry.dataKey}: {typeof entry.value === 'number' ? entry.value.toFixed(4) : String(entry.value ?? '—')}
        </p>
      ))}
    </div>
  );
}

export function PlumbingSimpleChart({ data, lines, height = 200 }: PlumbingSimpleChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
        <XAxis
          dataKey="date"
          tickFormatter={formatTickLabel}
          stroke="#71717a"
          tick={{ fill: '#a1a1aa', fontSize: 10 }}
        />
        <YAxis stroke="#71717a" tick={{ fill: '#a1a1aa', fontSize: 10 }} tickFormatter={(v) => v.toFixed(2)} />
        <Tooltip content={<CustomTooltip />} />
        {lines.map((line) => (
          <Line
            key={line.dataKey}
            type="monotone"
            dataKey={line.dataKey}
            stroke={line.stroke}
            name={line.name ?? line.dataKey}
            dot={false}
            strokeWidth={1.5}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
