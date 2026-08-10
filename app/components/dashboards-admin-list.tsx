"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type DashboardRow = {
  id: string;
  name: string;
  description: string | null;
  publicToken: string;
  publicEnabled: boolean;
  publicPath: string;
  refreshSeconds: number;
  updatedAt: string;
  createdBy: { id: string; name: string } | null;
};

export function DashboardsAdminList() {
  const [rows, setRows] = useState<DashboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/dashboards");
      const j = (await res.json().catch(() => ({}))) as {
        dashboards?: DashboardRow[];
        error?: string;
      };
      if (!res.ok) {
        setError(j.error ?? "Kunne ikke hente dashboards");
        setRows([]);
        return;
      }
      setRows(j.dashboards ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createDashboard() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setHint(null);
    try {
      const res = await fetch("/api/admin/dashboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        dashboard?: { id: string };
        error?: string;
      };
      if (!res.ok || !j.dashboard) {
        setHint(j.error ?? "Kunne ikke oprette");
        return;
      }
      setNewName("");
      window.location.href = `/dashboards/${j.dashboard.id}/rediger`;
    } finally {
      setCreating(false);
    }
  }

  async function duplicate(id: string) {
    setBusyId(id);
    setHint(null);
    try {
      const res = await fetch(`/api/admin/dashboards/${encodeURIComponent(id)}/duplicate`, {
        method: "POST",
      });
      const j = (await res.json().catch(() => ({}))) as {
        dashboard?: { id: string };
        error?: string;
      };
      if (!res.ok) {
        setHint(j.error ?? "Kunne ikke duplikere");
        return;
      }
      await load();
      setHint("Dashboard duplikeret");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Slet dashboardet «${name}»? Dette kan ikke fortrydes.`)) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/dashboards/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setHint(j.error ?? "Kunne ikke slette");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function togglePublic(row: DashboardRow) {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/admin/dashboards/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicEnabled: !row.publicEnabled }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setHint(j.error ?? "Kunne ikke opdatere");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function copyUrl(path: string) {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setHint("Offentlig URL kopieret");
    } catch {
      setHint(url);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-sm">
          <span className="font-medium text-stone-700">Nyt dashboard</span>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void createDashboard();
            }}
            placeholder="Fx Salg — storskærm"
            className="rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-900 shadow-sm focus:border-stone-500 focus:outline-none"
          />
        </label>
        <button
          type="button"
          disabled={creating || !newName.trim()}
          onClick={() => void createDashboard()}
          className="inline-flex h-10 items-center rounded-md bg-stone-900 px-4 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-40"
        >
          {creating ? "Opretter…" : "Tilføj dashboard"}
        </button>
      </div>

      {hint ? <p className="text-sm text-stone-600">{hint}</p> : null}
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-stone-500">Henter…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-10 text-center text-sm text-stone-600">
          Ingen dashboards endnu. Opret det første ovenfor.
        </p>
      ) : (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/dashboards/${row.id}/rediger`}
                    className="truncate text-sm font-semibold text-stone-900 hover:underline"
                  >
                    {row.name}
                  </Link>
                  <span
                    className={[
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      row.publicEnabled
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-stone-100 text-stone-600",
                    ].join(" ")}
                  >
                    {row.publicEnabled ? "Offentlig" : "Lukket"}
                  </span>
                </div>
                {row.description ? (
                  <p className="mt-0.5 truncate text-xs text-stone-500">{row.description}</p>
                ) : null}
                <p className="mt-1 font-mono text-[11px] text-stone-400">{row.publicPath}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Link
                  href={`/dashboards/${row.id}/rediger`}
                  className="rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
                >
                  Rediger
                </Link>
                <a
                  href={row.publicPath}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50"
                >
                  Åbn offentlig
                </a>
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => void copyUrl(row.publicPath)}
                  className="rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40"
                >
                  Kopiér URL
                </button>
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => void togglePublic(row)}
                  className="rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40"
                >
                  {row.publicEnabled ? "Deaktivér" : "Aktivér"}
                </button>
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => void duplicate(row.id)}
                  className="rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-40"
                >
                  Duplikér
                </button>
                <button
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => void remove(row.id, row.name)}
                  className="rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
                >
                  Slet
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
