import type { DashboardLayoutItem, DashboardWidgetConfig } from "@/lib/dashboard/types";

export function parseDashboardLayout(raw: unknown): DashboardLayoutItem[] {
  if (!Array.isArray(raw)) return [];
  const out: DashboardLayoutItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.i !== "string") continue;
    const x = Number(o.x);
    const y = Number(o.y);
    const w = Number(o.w);
    const h = Number(o.h);
    if (![x, y, w, h].every(Number.isFinite)) continue;
    const row: DashboardLayoutItem = { i: o.i, x, y, w, h };
    if (typeof o.minW === "number") row.minW = o.minW;
    if (typeof o.minH === "number") row.minH = o.minH;
    out.push(row);
  }
  return out;
}

export function parseDashboardWidgets(raw: unknown): DashboardWidgetConfig[] {
  if (!Array.isArray(raw)) return [];
  const out: DashboardWidgetConfig[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.metricId !== "string") continue;
    const period = o.period;
    const groupBy = o.groupBy;
    const viz = o.viz;
    if (period !== "today" && period !== "this_week" && period !== "this_month") continue;
    if (
      groupBy !== "none" &&
      groupBy !== "seller" &&
      groupBy !== "campaign" &&
      groupBy !== "day" &&
      groupBy !== "lead_status"
    ) {
      continue;
    }
    if (
      viz !== "kpi" &&
      viz !== "table" &&
      viz !== "bar" &&
      viz !== "line" &&
      viz !== "donut" &&
      viz !== "progress" &&
      viz !== "leaderboard"
    ) {
      continue;
    }
    const widget: DashboardWidgetConfig = {
      id: o.id,
      title: typeof o.title === "string" ? o.title : "",
      metricId: o.metricId,
      period,
      groupBy,
      viz,
    };
    if (o.filters && typeof o.filters === "object") {
      widget.filters = o.filters as DashboardWidgetConfig["filters"];
    }
    if (o.target && typeof o.target === "object") {
      widget.target = o.target as DashboardWidgetConfig["target"];
    }
    out.push(widget);
  }
  return out;
}
