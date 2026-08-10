import { prisma } from "@/lib/prisma";
import { computeScoreboardForDay, type ScoreboardUserRow } from "@/lib/scoreboard-day";
import { getMetricDefinition } from "@/lib/dashboard/metric-catalog";
import { resolveDashboardPeriod } from "@/lib/dashboard/resolve-period";
import { evaluateTargetProgress } from "@/lib/dashboard/targets";
import { LEAD_STATUS_LABELS, LEAD_STATUSES, type LeadStatus } from "@/lib/lead-status";
import type {
  DashboardWidgetConfig,
  MetricSeriesPoint,
  WidgetMetricResult,
} from "@/lib/dashboard/types";

type AggUser = {
  userId: string;
  name: string;
  username: string;
  meetings: number;
  conversations: number;
  contacts: number;
  talkSeconds: number;
  loginSeconds: number;
  dialerSeconds: number;
  /** Sum of talk-based conversation counts for avg (approx via talkSeconds days) */
  talkConversationDays: number;
};

type AggCampaign = {
  campaignId: string | null;
  campaignName: string;
  meetings: number;
  conversations: number;
  contacts: number;
  talkSeconds: number;
  dialerSeconds: number;
};

function emptyUser(row: ScoreboardUserRow): AggUser {
  return {
    userId: row.userId,
    name: row.name,
    username: row.username,
    meetings: 0,
    conversations: 0,
    contacts: 0,
    talkSeconds: 0,
    loginSeconds: 0,
    dialerSeconds: 0,
    talkConversationDays: 0,
  };
}

function buyRate(meetings: number, conversations: number): number {
  if (conversations <= 0) return 0;
  return Math.round((meetings / conversations) * 1000) / 10;
}

function avgTalk(talkSeconds: number, conversations: number): number {
  return conversations > 0 ? Math.round(talkSeconds / conversations) : 0;
}

function matchesUserFilter(userId: string, filters?: DashboardWidgetConfig["filters"]): boolean {
  const ids = filters?.userIds;
  if (!ids || ids.length === 0) return true;
  return ids.includes(userId);
}

function matchesCampaignFilter(
  campaignId: string | null,
  filters?: DashboardWidgetConfig["filters"],
): boolean {
  const ids = filters?.campaignIds;
  if (!ids || ids.length === 0) return true;
  if (campaignId == null) return false;
  return ids.includes(campaignId);
}

async function loadScoreboards(dayKeys: string[]): Promise<Map<string, ScoreboardUserRow[]>> {
  const map = new Map<string, ScoreboardUserRow[]>();
  // Sekventielt for at undgå at mætte DB — måneder er max ~31.
  for (const dayKey of dayKeys) {
    const board = await computeScoreboardForDay(dayKey);
    map.set(dayKey, board.rows);
  }
  return map;
}

function aggregateUsers(
  boards: Map<string, ScoreboardUserRow[]>,
  dayKeys: string[],
  filters?: DashboardWidgetConfig["filters"],
): AggUser[] {
  const byId = new Map<string, AggUser>();
  for (const dayKey of dayKeys) {
    for (const row of boards.get(dayKey) ?? []) {
      if (!matchesUserFilter(row.userId, filters)) continue;
      const agg = byId.get(row.userId) ?? emptyUser(row);
      agg.meetings += row.meetings;
      agg.conversations += row.conversations;
      agg.contacts += row.contacts;
      agg.talkSeconds += row.talkSeconds;
      agg.loginSeconds += row.loginSeconds;
      agg.dialerSeconds += row.dialerSeconds;
      if (row.avgConversationSeconds > 0 && row.talkSeconds > 0) {
        // Estimér talk-samtaler fra gns: talkSeconds / avg ≈ count
        const est = Math.round(row.talkSeconds / row.avgConversationSeconds);
        agg.talkConversationDays += Math.max(1, est);
      }
      byId.set(row.userId, agg);
    }
  }
  return [...byId.values()];
}

function aggregateCampaigns(
  boards: Map<string, ScoreboardUserRow[]>,
  dayKeys: string[],
  filters?: DashboardWidgetConfig["filters"],
): AggCampaign[] {
  const byKey = new Map<string, AggCampaign>();
  for (const dayKey of dayKeys) {
    for (const row of boards.get(dayKey) ?? []) {
      if (!matchesUserFilter(row.userId, filters)) continue;
      for (const c of row.campaigns) {
        if (!matchesCampaignFilter(c.campaignId, filters)) continue;
        const k = c.campaignId ?? "\0none";
        const agg = byKey.get(k) ?? {
          campaignId: c.campaignId,
          campaignName: c.campaignName,
          meetings: 0,
          conversations: 0,
          contacts: 0,
          talkSeconds: 0,
          dialerSeconds: 0,
        };
        agg.meetings += c.meetings;
        agg.conversations += c.conversations;
        agg.contacts += c.contacts;
        agg.talkSeconds += c.talkSeconds;
        agg.dialerSeconds += c.dialerSeconds;
        byKey.set(k, agg);
      }
    }
  }
  return [...byKey.values()];
}

function scoreboardValue(
  source: string,
  u: {
    meetings: number;
    conversations: number;
    contacts: number;
    talkSeconds: number;
    loginSeconds: number;
    dialerSeconds: number;
    talkConversationDays?: number;
  },
): number {
  switch (source) {
    case "scoreboard.meetings":
      return u.meetings;
    case "scoreboard.conversations":
      return u.conversations;
    case "scoreboard.contacts":
      return u.contacts;
    case "scoreboard.buyRatePct":
      return buyRate(u.meetings, u.conversations);
    case "scoreboard.talkSeconds":
      return u.talkSeconds;
    case "scoreboard.loginSeconds":
      return u.loginSeconds;
    case "scoreboard.dialerSeconds":
      return u.dialerSeconds;
    case "scoreboard.avgConversationSeconds":
      return avgTalk(u.talkSeconds, u.talkConversationDays ?? 0);
    default:
      return 0;
  }
}

async function activeDaysByUser(
  dayKeys: string[],
  userIds?: string[],
): Promise<Map<string, number>> {
  const rows = await prisma.userLoginDay.findMany({
    where: {
      dayKey: { in: dayKeys },
      ...(userIds && userIds.length ? { userId: { in: userIds } } : {}),
    },
    select: { userId: true, dayKey: true },
  });
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(r.userId, (map.get(r.userId) ?? 0) + 1);
  }
  return map;
}

async function computeLeadSnapshot(
  widget: DashboardWidgetConfig,
  defSource: string,
): Promise<WidgetMetricResult> {
  const campaignFilter = widget.filters?.campaignIds;
  const where =
    campaignFilter && campaignFilter.length > 0
      ? { campaignId: { in: campaignFilter } }
      : {};

  if (defSource === "leads.total" && widget.groupBy === "none") {
    const total = await prisma.lead.count({ where });
    return {
      widgetId: widget.id,
      metricId: widget.metricId,
      label: "Leads i alt",
      unit: "count",
      value: total,
      series: [{ key: "total", label: "I alt", value: total }],
      empty: total === 0,
    };
  }

  if (widget.groupBy === "campaign" || defSource === "leads.total") {
    const grouped = await prisma.lead.groupBy({
      by: ["campaignId"],
      where,
      _count: { _all: true },
    });
    const campaignIds = grouped.map((g) => g.campaignId).filter(Boolean) as string[];
    const campaigns = campaignIds.length
      ? await prisma.campaign.findMany({
          where: { id: { in: campaignIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(campaigns.map((c) => [c.id, c.name]));
    const series: MetricSeriesPoint[] = grouped
      .map((g) => ({
        key: g.campaignId ?? "none",
        label: g.campaignId ? nameById.get(g.campaignId) ?? "Slettet kampagne" : "Uden kampagne",
        value: g._count._all,
      }))
      .sort((a, b) => b.value - a.value);
    const value = series.reduce((s, p) => s + p.value, 0);
    return {
      widgetId: widget.id,
      metricId: widget.metricId,
      label: "Leads",
      unit: "count",
      value,
      series,
      empty: series.length === 0,
    };
  }

  // lead_status
  const grouped = await prisma.lead.groupBy({
    by: ["status"],
    where,
    _count: { _all: true },
  });
  const countByStatus = new Map(grouped.map((g) => [g.status, g._count._all]));
  const series: MetricSeriesPoint[] = LEAD_STATUSES.map((st: LeadStatus) => ({
    key: st,
    label: LEAD_STATUS_LABELS[st],
    value: countByStatus.get(st) ?? 0,
  }));
  const value = series.reduce((s, p) => s + p.value, 0);
  return {
    widgetId: widget.id,
    metricId: widget.metricId,
    label: "Leads pr. status",
    unit: "count",
    value,
    series,
    empty: value === 0,
  };
}

function computeOneWidget(
  widget: DashboardWidgetConfig,
  boards: Map<string, ScoreboardUserRow[]>,
  dayKeys: string[],
  activeDays: Map<string, number>,
): WidgetMetricResult {
  const def = getMetricDefinition(widget.metricId);
  if (!def) {
    return {
      widgetId: widget.id,
      metricId: widget.metricId,
      label: widget.title || widget.metricId,
      unit: "count",
      value: 0,
      series: [],
      empty: true,
      error: "Ukendt metrik",
    };
  }

  if (def.source.startsWith("leads.")) {
    // Håndteres async i batch — placeholder bør ikke nås
    return {
      widgetId: widget.id,
      metricId: widget.metricId,
      label: def.label,
      unit: def.unit,
      value: 0,
      series: [],
      empty: true,
      error: "Lead-snapshot kræver separat sti",
    };
  }

  const users = aggregateUsers(boards, dayKeys, widget.filters);

  if (def.source === "target.meetings_per_active_day") {
    if (widget.groupBy === "seller") {
      const series: MetricSeriesPoint[] = users
        .map((u) => {
          const days = activeDays.get(u.userId) ?? 0;
          const progress = evaluateTargetProgress({
            actual: u.meetings,
            activeDays: days,
            target: widget.target,
          });
          return {
            key: u.userId,
            label: u.name,
            value: u.meetings,
            secondary: progress.targetValue,
            index: progress.index,
            meta: {
              activeDays: days,
              pctOfTarget: progress.pctOfTarget,
              remaining: progress.remaining,
            },
          };
        })
        .sort((a, b) => b.value - a.value);
      const actual = series.reduce((s, p) => s + p.value, 0);
      const totalActive = users.reduce((s, u) => s + (activeDays.get(u.userId) ?? 0), 0);
      const totalProgress = evaluateTargetProgress({
        actual,
        activeDays: totalActive,
        target: widget.target,
      });
      return {
        widgetId: widget.id,
        metricId: widget.metricId,
        label: def.label,
        unit: "count",
        value: actual,
        targetValue: totalProgress.targetValue,
        pctOfTarget: totalProgress.pctOfTarget,
        index: totalProgress.index,
        series,
        empty: series.length === 0,
      };
    }

    const filteredIds = widget.filters?.userIds;
    const relevantUsers =
      filteredIds && filteredIds.length
        ? users.filter((u) => filteredIds.includes(u.userId))
        : users;
    const actual = relevantUsers.reduce((s, u) => s + u.meetings, 0);
    const days = relevantUsers.reduce((s, u) => s + (activeDays.get(u.userId) ?? 0), 0);
    const progress = evaluateTargetProgress({
      actual,
      activeDays: days,
      target: widget.target,
    });
    return {
      widgetId: widget.id,
      metricId: widget.metricId,
      label: def.label,
      unit: "count",
      value: actual,
      targetValue: progress.targetValue,
      pctOfTarget: progress.pctOfTarget,
      index: progress.index,
      series: [
        {
          key: "total",
          label: "I alt",
          value: actual,
          secondary: progress.targetValue,
          index: progress.index,
          meta: { activeDays: days, remaining: progress.remaining },
        },
      ],
      empty: false,
    };
  }

  if (def.source === "scoreboard.rank_meetings" || widget.viz === "leaderboard") {
    const series: MetricSeriesPoint[] = [...users]
      .map((u) => ({
        key: u.userId,
        label: u.name,
        value: scoreboardValue(def.source === "scoreboard.rank_meetings" ? "scoreboard.meetings" : def.source, u),
      }))
      .sort((a, b) => b.value - a.value)
      .map((p, idx) => ({ ...p, meta: { rank: idx + 1 } }));
    return {
      widgetId: widget.id,
      metricId: widget.metricId,
      label: def.label,
      unit: def.source === "scoreboard.rank_meetings" ? "rank" : def.unit,
      value: series[0]?.value ?? 0,
      series,
      empty: series.length === 0,
    };
  }

  if (widget.groupBy === "campaign") {
    const campaigns = aggregateCampaigns(boards, dayKeys, widget.filters);
    const series: MetricSeriesPoint[] = campaigns
      .map((c) => ({
        key: c.campaignId ?? "none",
        label: c.campaignName,
        value: scoreboardValue(def.source, {
          ...c,
          loginSeconds: 0,
          talkConversationDays:
            c.talkSeconds > 0 && avgTalk(c.talkSeconds, c.conversations) > 0
              ? Math.max(1, Math.round(c.talkSeconds / Math.max(1, avgTalk(c.talkSeconds, c.conversations))))
              : 0,
        }),
      }))
      .sort((a, b) => b.value - a.value);
    const value =
      def.unit === "percent"
        ? buyRate(
            campaigns.reduce((s, c) => s + c.meetings, 0),
            campaigns.reduce((s, c) => s + c.conversations, 0),
          )
        : series.reduce((s, p) => s + p.value, 0);
    return {
      widgetId: widget.id,
      metricId: widget.metricId,
      label: def.label,
      unit: def.unit,
      value,
      series,
      empty: series.length === 0,
    };
  }

  if (widget.groupBy === "day") {
    const series: MetricSeriesPoint[] = dayKeys.map((dayKey) => {
      const dayUsers = (boards.get(dayKey) ?? []).filter((r) =>
        matchesUserFilter(r.userId, widget.filters),
      );
      const totals = dayUsers.reduce(
        (acc, r) => {
          acc.meetings += r.meetings;
          acc.conversations += r.conversations;
          acc.contacts += r.contacts;
          acc.talkSeconds += r.talkSeconds;
          acc.loginSeconds += r.loginSeconds;
          acc.dialerSeconds += r.dialerSeconds;
          return acc;
        },
        {
          meetings: 0,
          conversations: 0,
          contacts: 0,
          talkSeconds: 0,
          loginSeconds: 0,
          dialerSeconds: 0,
        },
      );
      return {
        key: dayKey,
        label: dayKey,
        value: scoreboardValue(def.source, totals),
      };
    });
    const value =
      def.unit === "percent"
        ? buyRate(
            series.reduce((s, p, i) => {
              const dayUsers = (boards.get(dayKeys[i]!) ?? []).filter((r) =>
                matchesUserFilter(r.userId, widget.filters),
              );
              return s + dayUsers.reduce((a, r) => a + r.meetings, 0);
            }, 0),
            series.reduce((s, p, i) => {
              const dayUsers = (boards.get(dayKeys[i]!) ?? []).filter((r) =>
                matchesUserFilter(r.userId, widget.filters),
              );
              return s + dayUsers.reduce((a, r) => a + r.conversations, 0);
            }, 0),
          )
        : def.unit === "seconds" && def.source === "scoreboard.avgConversationSeconds"
          ? avgTalk(
              users.reduce((s, u) => s + u.talkSeconds, 0),
              users.reduce((s, u) => s + (u.talkConversationDays ?? 0), 0),
            )
          : series.reduce((s, p) => s + p.value, 0);
    return {
      widgetId: widget.id,
      metricId: widget.metricId,
      label: def.label,
      unit: def.unit,
      value,
      series,
      empty: series.every((p) => p.value === 0),
    };
  }

  if (widget.groupBy === "seller") {
    const series: MetricSeriesPoint[] = users
      .map((u) => ({
        key: u.userId,
        label: u.name,
        value: scoreboardValue(def.source, u),
      }))
      .sort((a, b) => b.value - a.value);
    const value =
      def.unit === "percent"
        ? buyRate(
            users.reduce((s, u) => s + u.meetings, 0),
            users.reduce((s, u) => s + u.conversations, 0),
          )
        : def.source === "scoreboard.avgConversationSeconds"
          ? avgTalk(
              users.reduce((s, u) => s + u.talkSeconds, 0),
              users.reduce((s, u) => s + (u.talkConversationDays ?? 0), 0),
            )
          : series.reduce((s, p) => s + p.value, 0);
    return {
      widgetId: widget.id,
      metricId: widget.metricId,
      label: def.label,
      unit: def.unit,
      value,
      series,
      empty: series.length === 0,
    };
  }

  // groupBy none — total
  const totals = users.reduce(
    (acc, u) => {
      acc.meetings += u.meetings;
      acc.conversations += u.conversations;
      acc.contacts += u.contacts;
      acc.talkSeconds += u.talkSeconds;
      acc.loginSeconds += u.loginSeconds;
      acc.dialerSeconds += u.dialerSeconds;
      acc.talkConversationDays += u.talkConversationDays;
      return acc;
    },
    {
      meetings: 0,
      conversations: 0,
      contacts: 0,
      talkSeconds: 0,
      loginSeconds: 0,
      dialerSeconds: 0,
      talkConversationDays: 0,
    },
  );
  const value = scoreboardValue(def.source, totals);
  return {
    widgetId: widget.id,
    metricId: widget.metricId,
    label: def.label,
    unit: def.unit,
    value,
    series: [{ key: "total", label: "I alt", value }],
    empty: value === 0 && users.length === 0,
  };
}

/**
 * Beregn alle widgets i ét batch — deler scoreboard pr. dayKey på tværs af widgets.
 */
export async function computeDashboardWidgetResults(
  widgets: DashboardWidgetConfig[],
  reference = new Date(),
): Promise<WidgetMetricResult[]> {
  if (widgets.length === 0) return [];

  const periodByWidget = new Map(
    widgets.map((w) => [w.id, resolveDashboardPeriod(w.period, reference)] as const),
  );
  const allDayKeys = [...new Set([...periodByWidget.values()].flatMap((p) => p.dayKeys))];
  const boards = await loadScoreboards(allDayKeys);

  const needsActiveDays = widgets.some((w) => {
    const def = getMetricDefinition(w.metricId);
    return def?.source === "target.meetings_per_active_day";
  });
  const activeDays = needsActiveDays
    ? await activeDaysByUser(allDayKeys)
    : new Map<string, number>();

  const results: WidgetMetricResult[] = [];
  for (const widget of widgets) {
    const def = getMetricDefinition(widget.metricId);
    if (def?.source.startsWith("leads.")) {
      results.push(await computeLeadSnapshot(widget, def.source));
      continue;
    }
    const period = periodByWidget.get(widget.id)!;
    results.push(computeOneWidget(widget, boards, period.dayKeys, activeDays));
  }
  return results;
}
