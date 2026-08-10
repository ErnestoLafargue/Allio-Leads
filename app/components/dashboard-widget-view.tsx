"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { INDEX_LABELS } from "@/lib/dashboard/metric-catalog";
import type { DashboardWidgetConfig, WidgetMetricResult } from "@/lib/dashboard/types";

const INDEX_CLASS = {
  red: "bg-red-100 text-red-800 border-red-200",
  yellow: "bg-amber-100 text-amber-900 border-amber-200",
  green: "bg-emerald-100 text-emerald-800 border-emerald-200",
} as const;

const CHART_COLORS = ["#1c1917", "#57534e", "#a8a29e", "#78716c", "#44403c", "#292524"];

function formatValue(value: number, unit: WidgetMetricResult["unit"]): string {
  if (unit === "percent") return `${value}%`;
  if (unit === "rank") return `#${value}`;
  if (unit === "seconds") {
    const totalMinutes = Math.round(value / 60);
    if (totalMinutes < 1) return `${Math.round(value)} s`;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return h > 0 ? `${h} t ${m} m` : `${m} m`;
  }
  return String(Math.round(value * 10) / 10);
}

type Props = {
  widget: DashboardWidgetConfig;
  result?: WidgetMetricResult;
  tv?: boolean;
  loading?: boolean;
};

export function DashboardWidgetView({ widget, result, tv = false, loading = false }: Props) {
  const title = widget.title || result?.label || "Widget";
  const pad = tv ? "p-5" : "p-3";
  const titleCls = tv
    ? "text-lg font-semibold text-stone-100"
    : "text-sm font-semibold text-stone-800";
  const cardCls = tv
    ? `flex h-full flex-col overflow-hidden rounded-2xl border border-stone-700 bg-stone-900/90 ${pad}`
    : `flex h-full flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm ${pad}`;

  if (loading && !result) {
    return (
      <div className={cardCls}>
        <h3 className={titleCls}>{title}</h3>
        <p className={tv ? "mt-4 text-stone-400" : "mt-3 text-sm text-stone-500"}>Indlæser…</p>
      </div>
    );
  }

  if (!result || result.error) {
    return (
      <div className={cardCls}>
        <h3 className={titleCls}>{title}</h3>
        <p className={tv ? "mt-4 text-red-300" : "mt-3 text-sm text-red-700"}>
          {result?.error ?? "Ingen data"}
        </p>
      </div>
    );
  }

  if (result.empty && widget.viz !== "progress") {
    return (
      <div className={cardCls}>
        <h3 className={titleCls}>{title}</h3>
        <p className={tv ? "mt-4 text-stone-400" : "mt-3 text-sm text-stone-500"}>
          Ingen data i perioden
        </p>
      </div>
    );
  }

  if (widget.viz === "kpi") {
    return (
      <div className={cardCls}>
        <h3 className={titleCls}>{title}</h3>
        <p
          className={
            tv
              ? "mt-auto text-5xl font-bold tabular-nums text-white"
              : "mt-auto text-3xl font-bold tabular-nums text-stone-900"
          }
        >
          {formatValue(result.value, result.unit)}
        </p>
        <p className={tv ? "mt-1 text-sm text-stone-400" : "mt-1 text-xs text-stone-500"}>
          {result.label}
        </p>
      </div>
    );
  }

  if (widget.viz === "progress") {
    const pct = result.pctOfTarget ?? 0;
    const index = result.index ?? "red";
    return (
      <div className={cardCls}>
        <div className="flex items-start justify-between gap-2">
          <h3 className={titleCls}>{title}</h3>
          <span
            className={[
              "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase",
              INDEX_CLASS[index],
            ].join(" ")}
          >
            {INDEX_LABELS[index]}
          </span>
        </div>
        <p
          className={
            tv
              ? "mt-4 text-4xl font-bold tabular-nums text-white"
              : "mt-3 text-2xl font-bold tabular-nums text-stone-900"
          }
        >
          {formatValue(result.value, "count")}
          <span className={tv ? "text-xl text-stone-400" : "text-base text-stone-400"}>
            {" "}
            / {formatValue(result.targetValue ?? 0, "count")}
          </span>
        </p>
        <div
          className={
            tv
              ? "mt-4 h-3 overflow-hidden rounded-full bg-stone-700"
              : "mt-3 h-2.5 overflow-hidden rounded-full bg-stone-100"
          }
        >
          <div
            className={[
              "h-full rounded-full transition-all",
              index === "green" ? "bg-emerald-500" : index === "yellow" ? "bg-amber-500" : "bg-red-500",
            ].join(" ")}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
        <p className={tv ? "mt-2 text-sm text-stone-400" : "mt-1.5 text-xs text-stone-500"}>
          {pct}% af mål
        </p>
      </div>
    );
  }

  if (widget.viz === "table" || widget.viz === "leaderboard") {
    return (
      <div className={cardCls}>
        <h3 className={titleCls}>{title}</h3>
        <div className="mt-2 min-h-0 flex-1 overflow-auto">
          <table className="w-full text-left">
            <thead>
              <tr
                className={
                  tv
                    ? "text-xs uppercase tracking-wide text-stone-500"
                    : "text-[10px] uppercase tracking-wide text-stone-400"
                }
              >
                {widget.viz === "leaderboard" ? <th className="py-1 pr-2">#</th> : null}
                <th className="py-1 pr-2">Navn</th>
                <th className="py-1 text-right">Værdi</th>
              </tr>
            </thead>
            <tbody>
              {result.series.map((row, idx) => (
                <tr
                  key={row.key}
                  className={
                    tv
                      ? "border-t border-stone-800 text-base text-stone-100"
                      : "border-t border-stone-100 text-sm text-stone-800"
                  }
                >
                  {widget.viz === "leaderboard" ? (
                    <td className="py-1.5 pr-2 tabular-nums text-stone-500">
                      {typeof row.meta?.rank === "number" ? row.meta.rank : idx + 1}
                    </td>
                  ) : null}
                  <td className="py-1.5 pr-2 truncate">{row.label}</td>
                  <td className="py-1.5 text-right tabular-nums font-medium">
                    {formatValue(row.value, result.unit)}
                    {row.secondary != null ? (
                      <span className="text-stone-400"> / {formatValue(row.secondary, "count")}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const chartData = result.series.map((s) => ({
    name: s.label.length > 18 ? `${s.label.slice(0, 16)}…` : s.label,
    value: s.value,
  }));
  const tipStyle = tv
    ? { background: "#1c1917", border: "1px solid #44403c", color: "#fafaf9" }
    : undefined;
  const axisStroke = tv ? "#a8a29e" : "#78716c";

  if (widget.viz === "donut") {
    return (
      <div className={cardCls}>
        <h3 className={titleCls}>{title}</h3>
        <div className="mt-2 min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                innerRadius="45%"
                outerRadius="75%"
                paddingAngle={2}
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  if (widget.viz === "line") {
    return (
      <div className={cardCls}>
        <h3 className={titleCls}>{title}</h3>
        <div className="mt-2 min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={tv ? "#44403c" : "#e7e5e4"} />
              <XAxis dataKey="name" tick={{ fill: axisStroke, fontSize: 11 }} />
              <YAxis tick={{ fill: axisStroke, fontSize: 11 }} />
              <Tooltip contentStyle={tipStyle} />
              <Line type="monotone" dataKey="value" stroke="#fafaf9" strokeWidth={tv ? 3 : 2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // bar default
  return (
    <div className={cardCls}>
      <h3 className={titleCls}>{title}</h3>
      <div className="mt-2 min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={tv ? "#44403c" : "#e7e5e4"} />
            <XAxis dataKey="name" tick={{ fill: axisStroke, fontSize: 11 }} />
            <YAxis tick={{ fill: axisStroke, fontSize: 11 }} />
            <Tooltip contentStyle={tipStyle} />
            <Bar dataKey="value" fill={tv ? "#e7e5e4" : "#1c1917"} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
