"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type CampaignRow = {
  id: string;
  name: string;
  systemCampaignType: string | null;
};

type SellerRow = {
  id: string;
  name: string;
  username: string;
  role: string;
};

export function CampaignAssignPanel() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [sellers, setSellers] = useState<SellerRow[]>([]);
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<Set<string>>(new Set());
  const [selectedSellerIds, setSelectedSellerIds] = useState<Set<string>>(new Set());
  const [inspectUserId, setInspectUserId] = useState<string | null>(null);
  const [inspectedCampaignIds, setInspectedCampaignIds] = useState<Set<string>>(new Set());
  const [intersectionUsers, setIntersectionUsers] = useState<SellerRow[]>([]);
  const [campaignSearch, setCampaignSearch] = useState("");
  const [sellerSearch, setSellerSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isAdmin = session?.user.role === "ADMIN";
  const campaignFocus = selectedCampaignIds.size > 0;

  useEffect(() => {
    if (status === "loading") return;
    if (status !== "authenticated" || session?.user.role !== "ADMIN") {
      router.replace("/kampagner");
    }
  }, [status, session?.user.role, router]);

  const loadBase = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cRes, uRes] = await Promise.all([
        fetch("/api/campaigns"),
        fetch("/api/users"),
      ]);
      if (!cRes.ok) throw new Error("Kunne ikke hente kampagner");
      if (!uRes.ok) throw new Error("Kunne ikke hente brugere");
      const cJson = (await cRes.json()) as CampaignRow[] | { campaigns?: CampaignRow[] };
      const campaignsList = Array.isArray(cJson)
        ? cJson
        : Array.isArray(cJson.campaigns)
          ? cJson.campaigns
          : [];
      setCampaigns(
        campaignsList.map((c) => ({
          id: c.id,
          name: c.name,
          systemCampaignType: c.systemCampaignType ?? null,
        })),
      );
      const uJson = (await uRes.json()) as SellerRow[] | { users?: SellerRow[] };
      const usersList = Array.isArray(uJson) ? uJson : Array.isArray(uJson.users) ? uJson.users : [];
      setSellers(usersList.filter((u) => u.role === "SELLER"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Noget gik galt");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void loadBase();
  }, [isAdmin, loadBase]);

  const refreshIntersection = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      setIntersectionUsers([]);
      return;
    }
    const res = await fetch(
      `/api/campaign-assignments?campaignIds=${encodeURIComponent(ids.join(","))}`,
    );
    if (!res.ok) {
      setIntersectionUsers([]);
      return;
    }
    const j = (await res.json()) as { users?: SellerRow[] };
    setIntersectionUsers(Array.isArray(j.users) ? j.users : []);
  }, []);

  useEffect(() => {
    if (!campaignFocus) return;
    void refreshIntersection([...selectedCampaignIds]);
  }, [campaignFocus, selectedCampaignIds, refreshIntersection]);

  const loadInspectUser = useCallback(async (userId: string) => {
    const res = await fetch(`/api/campaign-assignments?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) {
      setInspectedCampaignIds(new Set());
      return;
    }
    const j = (await res.json()) as { campaignIds?: string[] };
    setInspectedCampaignIds(new Set(Array.isArray(j.campaignIds) ? j.campaignIds : []));
  }, []);

  function toggleCampaign(id: string) {
    setInspectUserId(null);
    setInspectedCampaignIds(new Set());
    setSelectedSellerIds(new Set());
    setSelectedCampaignIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearCampaignSelection() {
    setSelectedCampaignIds(new Set());
    setSelectedSellerIds(new Set());
    setIntersectionUsers([]);
  }

  async function onInspectSeller(userId: string) {
    clearCampaignSelection();
    setInspectUserId(userId);
    setSelectedSellerIds(new Set([userId]));
    await loadInspectUser(userId);
  }

  function toggleSellerInCampaignFocus(id: string) {
    setSelectedSellerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCampaignInInspect(id: string) {
    setSelectedCampaignIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runAction(action: "assign" | "unassign") {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const campaignIds = [...selectedCampaignIds];
      const userIds =
        selectedSellerIds.size > 0
          ? [...selectedSellerIds]
          : inspectUserId
            ? [inspectUserId]
            : [];

      if (campaignIds.length === 0 || userIds.length === 0) {
        setError("Vælg mindst én kampagne og én sælger");
        return;
      }

      const res = await fetch("/api/campaign-assignments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignIds, userIds, action }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof j.error === "string" ? j.error : "Kunne ikke opdatere tildeling");
        return;
      }

      setNotice(action === "assign" ? "Sælgere tildelt." : "Tildeling fjernet.");
      if (!inspectUserId) {
        setSelectedSellerIds(new Set());
      }

      if (selectedCampaignIds.size > 0 && !inspectUserId) {
        await refreshIntersection([...selectedCampaignIds]);
      } else if (inspectUserId) {
        await loadInspectUser(inspectUserId);
        setSelectedCampaignIds(new Set());
      } else {
        await refreshIntersection([...selectedCampaignIds]);
      }
    } finally {
      setBusy(false);
    }
  }

  const filteredCampaigns = useMemo(() => {
    const q = campaignSearch.trim().toLocaleLowerCase("da");
    if (!q) return campaigns;
    return campaigns.filter((c) => c.name.toLocaleLowerCase("da").includes(q));
  }, [campaigns, campaignSearch]);

  const intersectionIdSet = useMemo(
    () => new Set(intersectionUsers.map((u) => u.id)),
    [intersectionUsers],
  );

  const addableSellers = useMemo(() => {
    const q = sellerSearch.trim().toLocaleLowerCase("da");
    if (!q) return [];
    return sellers.filter((u) => {
      if (campaignFocus && intersectionIdSet.has(u.id)) return false;
      return (
        u.name.toLocaleLowerCase("da").includes(q) ||
        u.username.toLocaleLowerCase("da").includes(q)
      );
    });
  }, [sellers, sellerSearch, campaignFocus, intersectionIdSet]);

  const filteredIntersection = useMemo(() => {
    const q = sellerSearch.trim().toLocaleLowerCase("da");
    if (!q) return intersectionUsers;
    return intersectionUsers.filter(
      (u) =>
        u.name.toLocaleLowerCase("da").includes(q) ||
        u.username.toLocaleLowerCase("da").includes(q),
    );
  }, [intersectionUsers, sellerSearch]);

  const inspectSeller = sellers.find((s) => s.id === inspectUserId) ?? null;

  if (status === "loading" || !isAdmin) {
    return <p className="text-sm text-stone-600">Indlæser…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Uddel kampagner</h1>
          <p className="mt-1 max-w-2xl text-sm text-stone-600">
            Kampagner har fokus. Markér én eller flere kampagner for at se sælgere på dem alle
            (fællesmængde), eller ryd kampagnevalg og søg en sælger for at se hans kampagner.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void runAction("assign")}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            Tildel →
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runAction("unassign")}
            className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50"
          >
            ← Fjern
          </button>
        </div>
      </div>

      <p className="text-xs text-stone-500">
        Fokus:{" "}
        {campaignFocus
          ? `${selectedCampaignIds.size} kampagne${selectedCampaignIds.size === 1 ? "" : "r"}`
          : inspectUserId
            ? `sælger ${inspectSeller?.name ?? "…"}`
            : "ingen — vælg kampagner eller søg en sælger"}
      </p>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}

      {loading ? (
        <p className="text-sm text-stone-600">Henter data…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Venstre: kampagner */}
          <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-stone-900">Kampagner</h2>
              {selectedCampaignIds.size > 0 ? (
                <button
                  type="button"
                  onClick={clearCampaignSelection}
                  className="text-xs font-medium text-stone-600 hover:text-stone-900"
                >
                  Ryd valg
                </button>
              ) : null}
            </div>
            <input
              type="search"
              value={campaignSearch}
              onChange={(e) => setCampaignSearch(e.target.value)}
              placeholder="Søg kampagne…"
              className="mb-3 w-full rounded-md border border-stone-200 px-3 py-2 text-sm"
            />
            <ul className="max-h-[28rem] space-y-1 overflow-auto">
              {filteredCampaigns.map((c) => {
                const checked = selectedCampaignIds.has(c.id);
                const assignedToInspect =
                  !campaignFocus && inspectUserId != null && inspectedCampaignIds.has(c.id);
                return (
                  <li key={c.id}>
                    <label
                      className={[
                        "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                        checked || assignedToInspect ? "bg-emerald-50 text-emerald-950" : "hover:bg-stone-50",
                      ].join(" ")}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          if (inspectUserId && selectedCampaignIds.size === 0) {
                            setSelectedCampaignIds(new Set([c.id]));
                            return;
                          }
                          if (inspectUserId && !campaignFocus) {
                            toggleCampaignInInspect(c.id);
                            return;
                          }
                          if (inspectUserId && campaignFocus) {
                            toggleCampaignInInspect(c.id);
                            return;
                          }
                          toggleCampaign(c.id);
                        }}
                        className="rounded border-stone-300"
                      />
                      <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                      {assignedToInspect ? (
                        <span className="shrink-0 text-[10px] uppercase tracking-wide text-emerald-700">
                          tildelt
                        </span>
                      ) : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Højre: sælgere */}
          <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold text-stone-900">Sælgere</h2>
            <p className="mb-3 text-xs text-stone-500">
              {campaignFocus
                ? "Øverst: på alle valgte kampagner. Nedenunder: søg for at tilføje flere."
                : "Søg og klik en sælger for at se hans kampagner (ryd kampagnevalg først)."}
            </p>
            <input
              type="search"
              value={sellerSearch}
              onChange={(e) => setSellerSearch(e.target.value)}
              placeholder="Søg sælger…"
              className="mb-3 w-full rounded-md border border-stone-200 px-3 py-2 text-sm"
            />

            {campaignFocus ? (
              <div className="space-y-4">
                <div>
                  <p className="mb-1 text-xs font-medium text-stone-700">
                    På alle valgte ({filteredIntersection.length})
                  </p>
                  <ul className="max-h-40 space-y-1 overflow-auto rounded-md border border-stone-100 p-2">
                    {filteredIntersection.length === 0 ? (
                      <li className="text-xs text-stone-500">Ingen fælles sælgere</li>
                    ) : (
                      filteredIntersection.map((u) => (
                        <li key={u.id}>
                          <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-stone-50">
                            <input
                              type="checkbox"
                              checked={selectedSellerIds.has(u.id)}
                              onChange={() => toggleSellerInCampaignFocus(u.id)}
                              className="rounded border-stone-300"
                            />
                            <span className="truncate">
                              {u.name}{" "}
                              <span className="text-stone-400">({u.username})</span>
                            </span>
                          </label>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-stone-700">Tilføj sælger</p>
                  <ul className="max-h-52 space-y-1 overflow-auto rounded-md border border-stone-100 p-2">
                    {addableSellers.length === 0 ? (
                      <li className="text-xs text-stone-500">
                        {sellerSearch.trim() ? "Ingen match" : "Søg for at finde sælgere at tildele"}
                      </li>
                    ) : (
                      addableSellers.map((u) => (
                        <li key={u.id}>
                          <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-stone-50">
                            <input
                              type="checkbox"
                              checked={selectedSellerIds.has(u.id)}
                              onChange={() => toggleSellerInCampaignFocus(u.id)}
                              className="rounded border-stone-300"
                            />
                            <span className="truncate">
                              {u.name}{" "}
                              <span className="text-stone-400">({u.username})</span>
                            </span>
                          </label>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            ) : (
              <ul className="max-h-[28rem] space-y-1 overflow-auto">
                {sellers
                  .filter((u) => {
                    const q = sellerSearch.trim().toLocaleLowerCase("da");
                    if (!q) return true;
                    return (
                      u.name.toLocaleLowerCase("da").includes(q) ||
                      u.username.toLocaleLowerCase("da").includes(q)
                    );
                  })
                  .map((u) => {
                    const active = inspectUserId === u.id;
                    return (
                      <li key={u.id}>
                        <button
                          type="button"
                          onClick={() => void onInspectSeller(u.id)}
                          className={[
                            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                            active ? "bg-emerald-50 text-emerald-950" : "hover:bg-stone-50",
                          ].join(" ")}
                        >
                          <span className="truncate font-medium">{u.name}</span>
                          <span className="truncate text-stone-400">({u.username})</span>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
