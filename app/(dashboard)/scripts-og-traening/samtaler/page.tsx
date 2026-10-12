import Link from "next/link";
import { redirect } from "next/navigation";
import { OUTCOME_LABELS, clock } from "@/lib/scripts-traening/labels";
import { CALLS_PAGE_SIZE, callScope, getViewer, listCalls, listSellers } from "@/lib/scripts-traening/queries";
import { Empty, OutcomeBadge, Score } from "../_components/ui";

type Search = { outcome?: string; seller?: string; alle?: string; side?: string };

export default async function CallsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.side ?? 1) || 1);
  const analyzedOnly = sp.alle !== "1";
  const [sellers, { total, rows }] = await Promise.all([
    viewer.isAdmin ? listSellers() : Promise.resolve([]),
    listCalls({
      where: callScope(viewer, sp.seller),
      outcome: sp.outcome ?? null,
      analyzedOnly,
      page,
    }),
  ]);
  const pages = Math.max(1, Math.ceil(total / CALLS_PAGE_SIZE));
  const qs = (patch: Partial<Search>) => {
    const merged = { ...sp, ...patch };
    const p = new URLSearchParams(Object.entries(merged).filter((e): e is [string, string] => !!e[1]));
    return `?${p.toString()}`;
  };

  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-end gap-3 rounded-xl border border-stone-200/90 bg-white p-3 shadow-sm">
        <label className="text-xs text-stone-600">
          Udfald
          <select name="outcome" defaultValue={sp.outcome ?? ""} className="mt-1 block rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm">
            <option value="">Alle</option>
            {["MEETING_BOOKED", "CALLBACK_SCHEDULED", "NOT_INTERESTED", "UNQUALIFIED"].map((o) => (
              <option key={o} value={o}>
                {OUTCOME_LABELS[o]}
              </option>
            ))}
            <option value="NONE">Intet udfald</option>
          </select>
        </label>
        {viewer.isAdmin ? (
          <label className="text-xs text-stone-600">
            Sælger
            <select name="seller" defaultValue={sp.seller ?? ""} className="mt-1 block rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm">
              <option value="">Alle sælgere</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="flex items-center gap-2 pb-1.5 text-sm text-stone-700">
          <input type="checkbox" name="alle" value="1" defaultChecked={!analyzedOnly} className="accent-stone-800" />
          Vis også ikke-analyserede
        </label>
        <button type="submit" className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800">
          Filtrér
        </button>
        <span className="ml-auto pb-1.5 text-xs text-stone-500">{total} samtaler</span>
      </form>

      {rows.length === 0 ? (
        <Empty>Ingen samtaler matcher filtret endnu.</Empty>
      ) : (
        <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200/90 bg-white shadow-sm">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/scripts-og-traening/samtaler/${r.id}`} className="flex items-start gap-4 px-4 py-3 hover:bg-stone-50">
                <div className="w-12 shrink-0 pt-0.5 text-center">
                  <Score value={r.overallScore} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-stone-900">{r.companyName ?? "Ukendt kunde"}</span>
                    <OutcomeBadge status={r.outcomeStatus} />
                  </div>
                  <p className="text-xs text-stone-500">
                    {r.agentName ?? "Ukendt sælger"} · {r.startedAt.toLocaleString("da-DK", { dateStyle: "short", timeStyle: "short" })} ·{" "}
                    {clock(r.durationSeconds)}
                  </p>
                  {r.summary ? <p className="mt-1 line-clamp-2 text-sm text-stone-700">{r.summary}</p> : null}
                </div>
                {r.moments ? (
                  <div className="flex shrink-0 gap-1.5 pt-1 text-xs" title="Godt · kan forbedres · mistet mulighed">
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">{r.moments.strong}</span>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">{r.moments.improve}</span>
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-800">{r.moments.missed}</span>
                  </div>
                ) : (
                  <span className="shrink-0 pt-1 text-xs text-stone-400">ikke analyseret</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <nav className="flex items-center justify-center gap-3 text-sm">
          {page > 1 ? (
            <Link href={qs({ side: String(page - 1) })} className="text-stone-600 hover:text-stone-900">
              ← Forrige
            </Link>
          ) : null}
          <span className="text-stone-500">
            Side {page} af {pages}
          </span>
          {page < pages ? (
            <Link href={qs({ side: String(page + 1) })} className="text-stone-600 hover:text-stone-900">
              Næste →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
