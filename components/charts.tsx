"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface LineSeries {
  key: string;
  color: string;
  dashed?: boolean;
}

export function LineChartCard({
  title,
  data,
  series,
  referenceLines = [],
  height = 260,
}: {
  title: string;
  data: Record<string, unknown>[];
  series: LineSeries[];
  referenceLines?: { y: number; label: string; color?: string }[];
  height?: number;
}) {
  return (
    <div className="card p-4">
      <h4 className="mb-2 text-sm font-semibold text-slate-300">{title}</h4>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1d2f4d" />
          <XAxis dataKey="period" stroke="#64748b" fontSize={11} />
          <YAxis stroke="#64748b" fontSize={11} />
          <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #1d2f4d" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeDasharray={s.dashed ? "5 5" : undefined} dot={false} strokeWidth={2} />
          ))}
          {referenceLines.map((r, i) => (
            <ReferenceLine key={i} y={r.y} stroke={r.color ?? "#f43f5e"} strokeDasharray="6 4" label={{ value: r.label, fill: r.color ?? "#f43f5e", fontSize: 10 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarChartCard({
  title,
  data,
  xKey,
  series,
  height = 260,
}: {
  title: string;
  data: Record<string, unknown>[];
  xKey: string;
  series: { key: string; color: string }[];
  height?: number;
}) {
  return (
    <div className="card p-4">
      <h4 className="mb-2 text-sm font-semibold text-slate-300">{title}</h4>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1d2f4d" />
          <XAxis dataKey={xKey} stroke="#64748b" fontSize={11} />
          <YAxis stroke="#64748b" fontSize={11} />
          <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #1d2f4d" }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
