"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import GridLayout from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { DashboardWidgetView } from "@/app/components/dashboard-widget-view";
import {
  GROUP_BY_LABELS,
  METRIC_CATALOG,
  PERIOD_LABELS,
  VIZ_LABELS,
  type MetricDefinition,
} from "@/lib/dashboard/metric-catalog";
import { DEFAULT_MEETINGS_PER_ACTIVE_DAY } from "@/lib/dashboard/targets";
import type {
  DashboardLayoutItem,
  DashboardPeriod,
  DashboardViz,
  DashboardWidgetConfig,
  WidgetMetricResult,
} from "@/lib/dashboard/types";

type Meta = {
  metrics: MetricDefinition[];
  users: { id: string; name: string; username: string; role: string }[];
  campaigns: { id: string; name: string; isSystemCampaign: boolean }[];
};

function newWidgetId() {
  return `w_${Math.random().toString(36).slice(2, 10)}`;
}

function defaultWidget(metric: MetricDefinition): DashboardWidgetConfig {
  const viz = (metric.viz[0] ?? "kpi") as DashboardViz;
  return {
    id: newWidgetId(),
    title: metric.label,
    metricId: metric.id,
    period: "today",
    groupBy: metric.groupBy.includes("seller") && viz !== "kpi" ? "seller" : "none",
    viz,
    target:
      metric.id === "meetings_target"
        ? { perActiveDay: DEFAULT_MEETINGS_PER_ACTIVE_DAY }
        : undefined,
  };
}

function nextLayoutItem(layout: DashboardLayoutItem[], id: string): DashboardLayoutItem {
  const maxY = layout.reduce((m, l) => Math.max(m, l.y + l.h), 0);
  return { i: id, x: 0, y: maxY, w: 4, h: 3, minW: 2, minH: 2 };
}

type Props = { dashboardId: string };

export function DashboardBuilder({ dashboardId }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [publicPath, setPublicPath] = useState("");
  const [publicEnabled, setPublicEnabled] = useState(true);
  const [refreshSeconds, setRefreshSeconds] = useState(30);
  const [layout, setLayout] = useState<DashboardLayoutItem[]>([]);
  const [widgets, setWidgets] = useState<DashboardWidgetConfig[]>([]);
  const [results, setResults] = useState<WidgetMetricResult[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(1200);

  useEffect(() => {
    const el = document.getElementById("dashboard-builder-canvas");
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(Math.floor(w));
    });
    ro.observe(el);
    setWidth(Math.floor(el.clientWidth) || 1200);
    return () => ro.disconnect();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashRes, metaRes] = await Promise.all([
        fetch(`/api/admin/dashboards/${encodeURIComponent(dashboardId)}`),
        fetch("/api/admin/dashboards/meta"),
      ]);
      const dashJ = (await dashRes.json().catch(() => ({}))) as {
        dashboard?: {
          name: string;
          description: string | null;
          publicPath: string;
          publicEnabled: boolean;
          refreshSeconds: number;
          layout: DashboardLayoutItem[];
          widgets: DashboardWidgetConfig[];
        };
        results?: WidgetMetricResult[];
        error?: string;
      };
      const metaJ = (await metaRes.json().catch(() => ({}))) as Meta & { error?: string };
      if (!dashRes.ok || !dashJ.dashboard) {
        setError(dashJ.error ?? "Kunne ikke hente dashboard");
        return;
      }
      if (!metaRes.ok) {
        setError(metaJ.error ?? "Kunne ikke hente katalog");
        return;
      }
      setName(dashJ.dashboard.name);
      setDescription(dashJ.dashboard.description ?? "");
      setPublicPath(dashJ.dashboard.publicPath);
      setPublicEnabled(dashJ.dashboard.publicEnabled);
      setRefreshSeconds(dashJ.dashboard.refreshSeconds);
      setLayout(dashJ.dashboard.layout);
      setWidgets(dashJ.dashboard.widgets);
      setResults(dashJ.results ?? []);
      setMeta({
        metrics: metaJ.metrics ?? METRIC_CATALOG,
        users: metaJ.users ?? [],
        campaigns: metaJ.campaigns ?? [],
      });
      if (dashJ.dashboard.widgets[0]) setSelectedId(dashJ.dashboard.widgets[0].id);
    } finally {
      setLoading(false);
    }
  }, [dashboardId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = widgets.find((w) => w.id === selectedId) ?? null;
  const selectedDef = selected
    ? (meta?.metrics ?? METRIC_CATALOG).find((m) => m.id === selected.metricId)
    : undefined;
  const resultById = useMemo(
    () => new Map(results.map((r) => [r.widgetId, r])),
    [results],
  );

  function addMetric(metricId: string) {
    const def = (meta?.metrics ?? METRIC_CATALOG).find((m) => m.id === metricId);
    if (!def) return;
    const w = defaultWidget(def);
    setWidgets((prev) => [...prev, w]);
    setLayout((prev) => [...prev, nextLayoutItem(prev, w.id)]);
    setSelectedId(w.id);
  }

  function updateSelected(patch: Partial<DashboardWidgetConfig>) {
    if (!selectedId) return;
    setWidgets((prev) =>
      prev.map((w) => (w.id === selectedId ? { ...w, ...patch } : w)),
    );
  }

  function removeSelected() {
    if (!selectedId) return;
    setWidgets((prev) => prev.filter((w) => w.id !== selectedId));
    setLayout((prev) => prev.filter((l) => l.i !== selectedId));
    setSelectedId(null);
  }

  function duplicateSelected() {
    if (!selected) return;
    const copy: DashboardWidgetConfig = {
      ...selected,
      id: newWidgetId(),
      title: `${selected.title} (kopi)`,
      filters: selected.filters ? { ...selected.filters } : undefined,
      target: selected.target ? { ...selected.target } : undefined,
    };
    setWidgets((prev) => [...prev, copy]);
    setLayout((prev) => [...prev, nextLayoutItem(prev, copy.id)]);
    setSelectedId(copy.id);
  }

  async function save(andRefresh = true) {
    setSaving(true);
    setHint(null);
    try {
      const res = await fetch(`/api/admin/dashboards/${encodeURIComponent(dashboardId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || null,
          publicEnabled,
          refreshSeconds,
          layout,
          widgets,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        dashboard?: { publicPath: string };
        error?: string;
      };
      if (!res.ok) {
        setHint(j.error ?? "Gem fejlede");
        return;
      }
      if (j.dashboard) setPublicPath(j.dashboard.publicPath);
      setHint("Gemt");
      if (andRefresh) await load();
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-stone-500">Indlæser builder…</p>;
  }
  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error}{" "}
        <Link href="/dashboards" className="underline">
          Tilbage
        </Link>
      </div>
    );
  }

  const categories = [
    { id: "seller", label: "Sælger" },
    { id: "campaign", label: "Kampagne" },
    { id: "leads", label: "Leads" },
    { id: "goal", label: "Mål" },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Link href="/dashboards" className="text-xs font-medium text-stone-500 hover:underline">
            ← Alle dashboards
          </Link>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full max-w-xl rounded-md border border-stone-300 px-3 py-2 text-lg font-semibold text-stone-900 shadow-sm"
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Valgfri beskrivelse"
            className="w-full max-w-xl rounded-md border border-stone-200 px-3 py-1.5 text-sm text-stone-700"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-stone-600">
            <input
              type="checkbox"
              checked={publicEnabled}
              onChange={(e) => setPublicEnabled(e.target.checked)}
            />
            Offentlig URL
          </label>
          <label className="flex items-center gap-1 text-xs text-stone-600">
            Opdater
            <input
              type="number"
              min={10}
              max={300}
              value={refreshSeconds}
              onChange={(e) => setRefreshSeconds(Number(e.target.value) || 30)}
              className="w-14 rounded border border-stone-300 px-1 py-0.5"
            />
            s
          </label>
          <a
            href={publicPath}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
          >
            Åbn offentlig
          </a>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save(true)}
            className="rounded-md bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-800 disabled:opacity-40"
          >
            {saving ? "Gemmer…" : "Gem"}
          </button>
        </div>
      </div>
      {hint ? <p className="text-sm text-stone-600">{hint}</p> : null}
      {publicPath ? (
        <p className="font-mono text-[11px] text-stone-400">
          Offentlig URL: {typeof window !== "undefined" ? window.location.origin : ""}
          {publicPath}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[14rem_1fr_18rem]">
        {/* Palette */}
        <aside className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            Tilføj widget
          </h2>
          <div className="mt-3 space-y-3">
            {categories.map((cat) => {
              const metrics = (meta?.metrics ?? METRIC_CATALOG).filter((m) => m.category === cat.id);
              if (!metrics.length) return null;
              return (
                <div key={cat.id}>
                  <p className="text-[11px] font-semibold text-stone-700">{cat.label}</p>
                  <ul className="mt-1 space-y-1">
                    {metrics.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => addMetric(m.id)}
                          className="w-full rounded-md border border-stone-200 px-2 py-1.5 text-left text-xs text-stone-700 hover:bg-stone-50"
                          title={m.description}
                        >
                          {m.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Canvas */}
        <div
          id="dashboard-builder-canvas"
          className="min-h-[32rem] rounded-xl border border-dashed border-stone-300 bg-stone-50/80 p-2"
        >
          {widgets.length === 0 ? (
            <p className="px-4 py-16 text-center text-sm text-stone-500">
              Tilføj en widget fra venstre panel for at starte.
            </p>
          ) : (
            <GridLayout
              className="layout"
              layout={layout}
              width={width}
              gridConfig={{ cols: 12, rowHeight: 48 }}
              dragConfig={{ handle: ".dashboard-drag-handle" }}
              onLayoutChange={(next) => {
                setLayout(
                  next.map((l) => ({
                    i: l.i,
                    x: l.x,
                    y: l.y,
                    w: l.w,
                    h: l.h,
                    minW: 2,
                    minH: 2,
                  })),
                );
              }}
            >
              {widgets.map((w) => (
                <div
                  key={w.id}
                  className={[
                    "relative h-full overflow-hidden rounded-xl",
                    selectedId === w.id ? "ring-2 ring-stone-800" : "",
                  ].join(" ")}
                  onClick={() => setSelectedId(w.id)}
                >
                  <div className="dashboard-drag-handle absolute left-0 right-0 top-0 z-10 h-6 cursor-move bg-gradient-to-b from-stone-900/10 to-transparent" />
                  <div className="h-full pt-1">
                    <DashboardWidgetView widget={w} result={resultById.get(w.id)} />
                  </div>
                </div>
              ))}
            </GridLayout>
          )}
        </div>

        {/* Config */}
        <aside className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            Widget-indstillinger
          </h2>
          {!selected || !selectedDef ? (
            <p className="mt-3 text-xs text-stone-500">Vælg en widget på canvas.</p>
          ) : (
            <div className="mt-3 space-y-3 text-sm">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-stone-600">Titel</span>
                <input
                  value={selected.title}
                  onChange={(e) => updateSelected({ title: e.target.value })}
                  className="w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-stone-600">Metrik</span>
                <select
                  value={selected.metricId}
                  onChange={(e) => {
                    const def = (meta?.metrics ?? METRIC_CATALOG).find((m) => m.id === e.target.value);
                    if (!def) return;
                    updateSelected({
                      metricId: def.id,
                      title: selected.title || def.label,
                      viz: def.viz.includes(selected.viz) ? selected.viz : def.viz[0],
                      groupBy: def.groupBy.includes(selected.groupBy)
                        ? selected.groupBy
                        : def.groupBy[0],
                      period: def.periods.includes(selected.period)
                        ? selected.period
                        : def.periods[0],
                      target:
                        def.id === "meetings_target"
                          ? selected.target ?? { perActiveDay: DEFAULT_MEETINGS_PER_ACTIVE_DAY }
                          : undefined,
                    });
                  }}
                  className="w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                >
                  {(meta?.metrics ?? METRIC_CATALOG).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-stone-600">Periode</span>
                <select
                  value={selected.period}
                  onChange={(e) =>
                    updateSelected({ period: e.target.value as DashboardPeriod })
                  }
                  className="w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                >
                  {selectedDef.periods.map((p) => (
                    <option key={p} value={p}>
                      {PERIOD_LABELS[p]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-stone-600">Gruppér</span>
                <select
                  value={selected.groupBy}
                  onChange={(e) =>
                    updateSelected({
                      groupBy: e.target.value as DashboardWidgetConfig["groupBy"],
                    })
                  }
                  className="w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                >
                  {selectedDef.groupBy.map((g) => (
                    <option key={g} value={g}>
                      {GROUP_BY_LABELS[g]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-stone-600">Visualisering</span>
                <select
                  value={selected.viz}
                  onChange={(e) =>
                    updateSelected({ viz: e.target.value as DashboardViz })
                  }
                  className="w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                >
                  {selectedDef.viz.map((v) => (
                    <option key={v} value={v}>
                      {VIZ_LABELS[v]}
                    </option>
                  ))}
                </select>
              </label>
              {selected.metricId === "meetings_target" ? (
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-stone-600">
                    Møder pr. aktiv dag
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={selected.target?.perActiveDay ?? DEFAULT_MEETINGS_PER_ACTIVE_DAY}
                    onChange={(e) =>
                      updateSelected({
                        target: {
                          ...selected.target,
                          perActiveDay: Math.max(1, Number(e.target.value) || 3),
                        },
                      })
                    }
                    className="w-full rounded-md border border-stone-300 px-2 py-1.5 text-sm"
                  />
                </label>
              ) : null}
              <label className="block space-y-1">
                <span className="text-xs font-medium text-stone-600">Sælgere (valgfri)</span>
                <select
                  multiple
                  value={selected.filters?.userIds ?? []}
                  onChange={(e) => {
                    const ids = [...e.target.selectedOptions].map((o) => o.value);
                    updateSelected({
                      filters: {
                        ...selected.filters,
                        userIds: ids.length ? ids : undefined,
                      },
                    });
                  }}
                  className="h-28 w-full rounded-md border border-stone-300 px-2 py-1.5 text-xs"
                >
                  {(meta?.users ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-stone-600">Kampagner (valgfri)</span>
                <select
                  multiple
                  value={selected.filters?.campaignIds ?? []}
                  onChange={(e) => {
                    const ids = [...e.target.selectedOptions].map((o) => o.value);
                    updateSelected({
                      filters: {
                        ...selected.filters,
                        campaignIds: ids.length ? ids : undefined,
                      },
                    });
                  }}
                  className="h-28 w-full rounded-md border border-stone-300 px-2 py-1.5 text-xs"
                >
                  {(meta?.campaigns ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => duplicateSelected()}
                  className="rounded-md border border-stone-200 px-2 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50"
                >
                  Duplikér
                </button>
                <button
                  type="button"
                  onClick={() => removeSelected()}
                  className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                  Fjern
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void save(true)}
                  className="rounded-md bg-stone-900 px-2 py-1 text-xs font-semibold text-white hover:bg-stone-800 disabled:opacity-40"
                >
                  Gem & opdatér
                </button>
              </div>
              <p className="text-[11px] text-stone-500">{selectedDef.description}</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
