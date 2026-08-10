/** Fælles typer for dashboard-builder og offentlig TV-visning. */

export type DashboardPeriod = "today" | "this_week" | "this_month";

export type DashboardGroupBy = "none" | "seller" | "campaign" | "day" | "lead_status";

export type DashboardViz =
  | "kpi"
  | "table"
  | "bar"
  | "line"
  | "donut"
  | "progress"
  | "leaderboard";

export type PerformanceIndex = "red" | "yellow" | "green";

export type DashboardLayoutItem = {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
};

export type DashboardTargetConfig = {
  /** Møder (eller anden metric) pr. aktiv login-dag */
  perActiveDay: number;
  /** Under denne % → rød (default 80) */
  redBelowPct?: number;
  /** Under denne % (men ≥ rød) → gul (default 100) */
  yellowBelowPct?: number;
};

export type DashboardWidgetFilters = {
  userIds?: string[];
  campaignIds?: string[];
};

export type DashboardWidgetConfig = {
  id: string;
  title: string;
  metricId: string;
  period: DashboardPeriod;
  groupBy: DashboardGroupBy;
  viz: DashboardViz;
  filters?: DashboardWidgetFilters;
  target?: DashboardTargetConfig;
};

export type MetricSeriesPoint = {
  key: string;
  label: string;
  value: number;
  /** Valgfri sekundær værdi (fx target) */
  secondary?: number;
  index?: PerformanceIndex;
  meta?: Record<string, string | number | boolean | null>;
};

export type WidgetMetricResult = {
  widgetId: string;
  metricId: string;
  label: string;
  unit: "count" | "percent" | "seconds" | "rank";
  /** Primær KPI-værdi (sum/total) */
  value: number;
  /** For progress-widgets */
  targetValue?: number;
  pctOfTarget?: number;
  index?: PerformanceIndex;
  series: MetricSeriesPoint[];
  empty: boolean;
  error?: string;
};

export type DashboardDataPayload = {
  id: string;
  name: string;
  description: string | null;
  refreshSeconds: number;
  layout: DashboardLayoutItem[];
  widgets: DashboardWidgetConfig[];
  results: WidgetMetricResult[];
  generatedAt: string;
};
