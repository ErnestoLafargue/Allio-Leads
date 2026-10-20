"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MedlytListener,
  type MedlytListenerState,
} from "@/app/components/medlyt-listener";

type AgentRow = {
  userId: string;
  name: string;
  username: string;
  status: string;
  campaignId: string | null;
  campaignName: string | null;
  leadId: string | null;
  hasLeadLeg: boolean;
  buttonTone: "green" | "blue" | "ready" | "disabled";
  canStart: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  ready: "Klar",
  ringing: "Ringer",
  talking: "I samtale",
  wrap_up: "Efterbehandling",
  draining: "Afslutter",
  paused: "Pause",
};

export default function MedlytPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [activeTargetUserId, setActiveTargetUserId] = useState<string | null>(null);
  const [stopSignal, setStopSignal] = useState(0);
  const [talkOn, setTalkOn] = useState(true);
  const [listen, setListen] = useState<MedlytListenerState>({
    sessionId: null,
    listening: false,
    negotiating: false,
    problem: null,
    talkReady: false,
  });

  const isAdmin = authStatus === "authenticated" && session?.user.role === "ADMIN";

  useEffect(() => {
    if (authStatus === "loading") return;
    if (!isAdmin) router.replace("/leads");
  }, [authStatus, isAdmin, router]);

  const loadAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/dialer/medlyt/agents");
      const data = (await res.json().catch(() => ({}))) as {
        agents?: AgentRow[];
        error?: string;
      };
      if (!res.ok) {
        setLoadError(data.error || "Kunne ikke hente sælgere.");
        return;
      }
      setAgents(Array.isArray(data.agents) ? data.agents : []);
      setLoadError(null);
    } catch {
      setLoadError("Netværksfejl.");
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void loadAgents();
    const t = window.setInterval(() => void loadAgents(), 2500);
    return () => window.clearInterval(t);
  }, [isAdmin, loadAgents]);

  useEffect(() => {
    if (listen.problem) setActionError(listen.problem);
  }, [listen.problem]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.username.toLowerCase().includes(q) ||
        (a.campaignName?.toLowerCase().includes(q) ?? false),
    );
  }, [agents, query]);

  const startMedlyt = (targetUserId: string) => {
    setActionError(null);
    setBusyUserId(null);
    setTalkOn(true);
    setActiveTargetUserId(targetUserId);
  };

  const stopMedlyt = async () => {
    setBusyUserId(activeTargetUserId);
    setActionError(null);
    try {
      setStopSignal((n) => n + 1);
      setActiveTargetUserId(null);
      setTalkOn(true);
    } catch {
      setActionError("Netværksfejl ved stop.");
    } finally {
      setBusyUserId(null);
    }
  };

  if (authStatus === "loading" || !isAdmin) {
    return <div className="p-6 text-sm text-[var(--muted)]">Indlæser…</div>;
  }

  const talkBtnEnabled = Boolean(activeTargetUserId) && listen.talkReady && busyUserId === null;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">Medlyt</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Hør sælgerens mikrofon mens de er på kampagne — også når de ringer. Når en kunde er på,
          høres samtalen. «Tal til sælger» går direkte til hans headset, ikke gennem Telnyx eller
          kunden.
        </p>
      </header>

      <MedlytListener
        targetUserId={activeTargetUserId}
        stopSignal={stopSignal}
        talkOn={talkOn}
        onStateChange={setListen}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <span
          className={
            listen.listening
              ? "text-emerald-700 dark:text-emerald-400"
              : listen.negotiating
                ? "text-amber-700 dark:text-amber-400"
                : "text-[var(--muted)]"
          }
        >
          Lyt:{" "}
          {listen.listening
            ? "aktiv"
            : listen.negotiating
              ? "forbinder til sælger…"
              : "klar"}
        </span>
        {talkOn && listen.talkReady ? (
          <span className="font-medium text-emerald-700 dark:text-emerald-400">
            Taler til sælger
          </span>
        ) : null}
      </div>

      <label className="mb-3 block">
        <span className="sr-only">Søg sælger</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Søg på navn…"
          className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
        />
      </label>

      {loadError ? <p className="mb-3 text-sm text-red-600">{loadError}</p> : null}
      {actionError ? <p className="mb-3 text-sm text-red-600">{actionError}</p> : null}

      {activeTargetUserId ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-300/60 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-800 dark:bg-emerald-950/40">
          <span>
            Aktiv medlyt på{" "}
            <strong>{agents.find((a) => a.userId === activeTargetUserId)?.name ?? "sælger"}</strong>
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!talkBtnEnabled}
              onClick={() => setTalkOn((v) => !v)}
              title={
                talkOn
                  ? "Slå fra — sælgeren hører dig ikke"
                  : "Slå til — kun sælgeren hører dig (ikke kunden)"
              }
              className={
                talkOn
                  ? "rounded-md bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-700 disabled:opacity-50"
                  : "rounded-md bg-neutral-200 px-3 py-1.5 text-neutral-700 hover:bg-neutral-300 disabled:opacity-50 dark:bg-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-600"
              }
            >
              Tal til sælger
            </button>
            <button
              type="button"
              disabled={busyUserId !== null}
              onClick={() => void stopMedlyt()}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-white hover:bg-neutral-800 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
            >
              Stop medlyt
            </button>
          </div>
        </div>
      ) : null}

      <ul className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)] bg-[var(--surface)]">
        {filtered.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-[var(--muted)]">
            {query.trim()
              ? "Ingen sælgere matcher søgningen."
              : "Ingen sælgere i dialeren lige nu."}
          </li>
        ) : (
          filtered.map((a) => {
            const isActive = activeTargetUserId === a.userId;
            const busy = busyUserId === a.userId;
            const canClick = a.canStart && !isActive && !activeTargetUserId;
            const btnClass =
              a.buttonTone === "green"
                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : a.buttonTone === "blue"
                  ? "bg-sky-600 hover:bg-sky-700 text-white"
                  : a.buttonTone === "ready"
                    ? "bg-amber-600 hover:bg-amber-700 text-white"
                    : "bg-neutral-200 text-neutral-500 cursor-not-allowed dark:bg-neutral-800 dark:text-neutral-500";
            return (
              <li key={a.userId} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate font-medium text-[var(--foreground)]">{a.name}</div>
                  <div className="truncate text-xs text-[var(--muted)]">
                    {STATUS_LABEL[a.status] ?? a.status}
                    {a.campaignName ? ` · ${a.campaignName}` : ""}
                  </div>
                </div>
                {isActive ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void stopMedlyt()}
                    className="shrink-0 rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!canClick || busy}
                    onClick={() => startMedlyt(a.userId)}
                    className={`shrink-0 rounded-md px-3 py-1.5 text-sm disabled:opacity-60 ${btnClass}`}
                  >
                    Start medlyt
                  </button>
                )}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
