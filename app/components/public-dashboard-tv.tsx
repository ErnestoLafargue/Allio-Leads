"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import GridLayout from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { DashboardWidgetView } from "@/app/components/dashboard-widget-view";
import type {
  DashboardLayoutItem,
  DashboardWidgetConfig,
  WidgetMetricResult,
} from "@/lib/dashboard/types";

type Payload = {
  name: string;
  description: string | null;
  refreshSeconds: number;
  layout: DashboardLayoutItem[];
  widgets: DashboardWidgetConfig[];
  results: WidgetMetricResult[];
  generatedAt: string;
};

export function PublicDashboardTv({ token }: { token: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(1280);
  const [rowHeight, setRowHeight] = useState(64);
  const [lastOkAt, setLastOkAt] = useState<string | null>(null);

  useEffect(() => {
    const update = () => {
      setWidth(window.innerWidth);
      setRowHeight(Math.max(56, Math.floor((window.innerHeight - 120) / 12)));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/d/${encodeURIComponent(token)}`, {
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as Payload & { error?: string };
      if (!res.ok) {
        setData((prev) => {
          if (!prev) setError(j.error ?? "Dashboard kunne ikke hentes");
          return prev;
        });
        return;
      }
      setData(j);
      setLastOkAt(j.generatedAt);
      setError(null);
    } catch {
      setData((prev) => {
        if (!prev) setError("Netværksfejl — prøver igen…");
        return prev;
      });
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const seconds = Math.max(10, data?.refreshSeconds ?? 30);
    const id = window.setInterval(() => {
      void load();
    }, seconds * 1000);
    return () => window.clearInterval(id);
  }, [data?.refreshSeconds, load]);

  const resultById = useMemo(
    () => new Map((data?.results ?? []).map((r) => [r.widgetId, r])),
    [data?.results],
  );

  if (error && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-950 px-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold text-stone-100">Dashboard utilgængeligt</h1>
          <p className="mt-2 text-stone-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-950 text-stone-400">
        Indlæser dashboard…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      <header className="flex items-end justify-between gap-4 border-b border-stone-800 px-6 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-500">
            Allio Leads
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-white">{data.name}</h1>
          {data.description ? (
            <p className="mt-1 text-sm text-stone-400">{data.description}</p>
          ) : null}
        </div>
        <p className="text-xs text-stone-500 tabular-nums">
          Opdateret{" "}
          {lastOkAt
            ? new Date(lastOkAt).toLocaleTimeString("da-DK", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })
            : "—"}
        </p>
      </header>
      <main className="p-4">
        {data.widgets.length === 0 ? (
          <p className="px-4 py-20 text-center text-stone-500">
            Dette dashboard har ingen widgets endnu.
          </p>
        ) : (
          <GridLayout
            className="layout"
            layout={data.layout}
            width={Math.max(320, width - 32)}
            gridConfig={{ cols: 12, rowHeight }}
            dragConfig={{ enabled: false }}
            resizeConfig={{ enabled: false, handles: [] }}
          >
            {data.widgets.map((w) => (
              <div key={w.id} className="h-full">
                <DashboardWidgetView tv widget={w} result={resultById.get(w.id)} />
              </div>
            ))}
          </GridLayout>
        )}
      </main>
    </div>
  );
}
