import type {
  DashboardGroupBy,
  DashboardPeriod,
  DashboardViz,
  PerformanceIndex,
} from "@/lib/dashboard/types";

export type MetricUnit = "count" | "percent" | "seconds" | "rank";

export type MetricDefinition = {
  id: string;
  label: string;
  description: string;
  unit: MetricUnit;
  /** Scoreboard-felt eller særskilt beregning */
  source:
    | "scoreboard.meetings"
    | "scoreboard.conversations"
    | "scoreboard.contacts"
    | "scoreboard.buyRatePct"
    | "scoreboard.talkSeconds"
    | "scoreboard.loginSeconds"
    | "scoreboard.dialerSeconds"
    | "scoreboard.avgConversationSeconds"
    | "scoreboard.rank_meetings"
    | "leads.total"
    | "leads.by_status"
    | "target.meetings_per_active_day";
  periods: DashboardPeriod[];
  groupBy: DashboardGroupBy[];
  viz: DashboardViz[];
  category: "seller" | "campaign" | "leads" | "goal";
};

export const METRIC_CATALOG: MetricDefinition[] = [
  {
    id: "meetings",
    label: "Møder",
    description: "Bookede møder via udfald (samme regel som scoreboard).",
    unit: "count",
    source: "scoreboard.meetings",
    periods: ["today", "this_week", "this_month"],
    groupBy: ["none", "seller", "campaign", "day"],
    viz: ["kpi", "table", "bar", "line", "leaderboard", "progress"],
    category: "seller",
  },
  {
    id: "conversations",
    label: "Samtaler",
    description: "Opkald med mindst 20 sekunders forbundet tale (eller udfalds-fallback).",
    unit: "count",
    source: "scoreboard.conversations",
    periods: ["today", "this_week", "this_month"],
    groupBy: ["none", "seller", "campaign", "day"],
    viz: ["kpi", "table", "bar", "line", "leaderboard"],
    category: "seller",
  },
  {
    id: "contacts",
    label: "Kontakter",
    description: "Opkaldsforsøg (max ét pr. lead pr. 2 timer).",
    unit: "count",
    source: "scoreboard.contacts",
    periods: ["today", "this_week", "this_month"],
    groupBy: ["none", "seller", "campaign", "day"],
    viz: ["kpi", "table", "bar", "line", "leaderboard"],
    category: "seller",
  },
  {
    id: "buyrate",
    label: "Buyrate",
    description: "Møder pr. samtale i procent.",
    unit: "percent",
    source: "scoreboard.buyRatePct",
    periods: ["today", "this_week", "this_month"],
    groupBy: ["none", "seller", "campaign"],
    viz: ["kpi", "table", "bar", "leaderboard"],
    category: "seller",
  },
  {
    id: "talk_seconds",
    label: "Taletid",
    description: "Samlet forbundet taletid i sekunder.",
    unit: "seconds",
    source: "scoreboard.talkSeconds",
    periods: ["today", "this_week", "this_month"],
    groupBy: ["none", "seller", "campaign", "day"],
    viz: ["kpi", "table", "bar", "line"],
    category: "seller",
  },
  {
    id: "login_seconds",
    label: "Login-tid",
    description: "Tid med Allio-fanen synlig (målt eller estimeret).",
    unit: "seconds",
    source: "scoreboard.loginSeconds",
    periods: ["today", "this_week", "this_month"],
    groupBy: ["none", "seller", "day"],
    viz: ["kpi", "table", "bar", "line"],
    category: "seller",
  },
  {
    id: "dialer_seconds",
    label: "Dialer-tid",
    description: "Tid på kampagne-arbejdsside / aktiv VoIP-linje.",
    unit: "seconds",
    source: "scoreboard.dialerSeconds",
    periods: ["today", "this_week", "this_month"],
    groupBy: ["none", "seller", "campaign", "day"],
    viz: ["kpi", "table", "bar", "line"],
    category: "seller",
  },
  {
    id: "avg_conversation",
    label: "Gns. samtale",
    description: "Gennemsnitlig taletid pr. talk-baseret samtale.",
    unit: "seconds",
    source: "scoreboard.avgConversationSeconds",
    periods: ["today", "this_week", "this_month"],
    groupBy: ["none", "seller", "campaign"],
    viz: ["kpi", "table", "bar"],
    category: "seller",
  },
  {
    id: "rank_meetings",
    label: "Rangering (møder)",
    description: "Placering efter antal møder i perioden.",
    unit: "rank",
    source: "scoreboard.rank_meetings",
    periods: ["today", "this_week", "this_month"],
    groupBy: ["seller"],
    viz: ["leaderboard", "table"],
    category: "seller",
  },
  {
    id: "leads_total",
    label: "Leads i alt",
    description: "Nuværende antal leads (snapshot — ikke historisk).",
    unit: "count",
    source: "leads.total",
    periods: ["today"],
    groupBy: ["none", "campaign", "lead_status"],
    viz: ["kpi", "table", "bar", "donut"],
    category: "leads",
  },
  {
    id: "leads_by_status",
    label: "Leads pr. status",
    description: "Fordeling af nuværende lead-status (snapshot).",
    unit: "count",
    source: "leads.by_status",
    periods: ["today"],
    groupBy: ["lead_status", "campaign"],
    viz: ["table", "bar", "donut"],
    category: "leads",
  },
  {
    id: "meetings_target",
    label: "Mødemål",
    description: "Møder mod mål (standard: 3 pr. aktiv login-dag).",
    unit: "count",
    source: "target.meetings_per_active_day",
    periods: ["today", "this_week", "this_month"],
    groupBy: ["none", "seller"],
    viz: ["progress", "kpi", "table", "bar"],
    category: "goal",
  },
];

export function getMetricDefinition(id: string): MetricDefinition | undefined {
  return METRIC_CATALOG.find((m) => m.id === id);
}

export const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  today: "I dag",
  this_week: "Denne uge",
  this_month: "Denne måned",
};

export const GROUP_BY_LABELS: Record<DashboardGroupBy, string> = {
  none: "Ingen (total)",
  seller: "Sælger",
  campaign: "Kampagne",
  day: "Dag",
  lead_status: "Lead-status",
};

export const VIZ_LABELS: Record<DashboardViz, string> = {
  kpi: "KPI-tal",
  table: "Tabel",
  bar: "Søjlediagram",
  line: "Linjediagram",
  donut: "Donut",
  progress: "Mål / fremskridt",
  leaderboard: "Leaderboard",
};

export function performanceIndex(
  pct: number,
  redBelow = 80,
  yellowBelow = 100,
): PerformanceIndex {
  if (pct < redBelow) return "red";
  if (pct < yellowBelow) return "yellow";
  return "green";
}

export const INDEX_LABELS: Record<PerformanceIndex, string> = {
  red: "Under mål",
  yellow: "Tæt på mål",
  green: "På eller over mål",
};
