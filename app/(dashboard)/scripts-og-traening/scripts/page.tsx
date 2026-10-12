import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { SeedScriptContent, WeeklyScript } from "@/lib/sales-scripts/schema";
import { OBJECTION_LABELS, PHASE_LABELS } from "@/lib/scripts-traening/labels";
import { callScope, getViewer } from "@/lib/scripts-traening/queries";
import { Empty } from "../_components/ui";
import { rollbackScriptAction } from "./actions";

/** Eksempler fra samtaler; sælgere kan kun åbne deres egne — kollegers vises uden link. */
function EvidenceLinks({ ids, canOpen }: { ids: string[]; canOpen: ReadonlySet<string> }) {
  if (!ids.length) return null;
  const chip = "rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-500";
  return (
    <span className="ml-1 inline-flex gap-1 align-middle">
      {ids.map((id, i) =>
        canOpen.has(id) ? (
          <Link key={id} href={`/scripts-og-traening/samtaler/${id}`} className={`${chip} hover:bg-stone-200`} title="Hør eksemplet">
            eks. {i + 1}
          </Link>
        ) : (
          <span key={id} className={chip} title="Eksempel fra en kollegas samtale">
            eks. {i + 1}
          </span>
        ),
      )}
    </span>
  );
}

/** Ugens titel uden «Ugens script – uge 39:»-præfikset. */
function headline(title: string): string {
  return title.replace(/^ugens script\s*[–-]\s*uge\s*\d+\s*:\s*/i, "");
}

function Chevron() {
  return (
    <svg className="h-4 w-4 shrink-0 text-stone-400 transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.06l3.71-3.83a.75.75 0 1 1 1.08 1.04l-4.25 4.39a.75.75 0 0 1-1.08 0L5.21 8.27a.75.75 0 0 1 .02-1.06Z"
      />
    </svg>
  );
}

export default async function ScriptsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const [weekly, seeds] = await Promise.all([
    prisma.salesScriptVersion.findMany({ where: { kind: "WEEKLY" }, orderBy: { version: "desc" } }),
    prisma.salesScriptVersion.findMany({ where: { kind: "SEED" }, orderBy: { version: "desc" } }),
  ]);
  const active = weekly.find((w) => w.isActive) ?? null;
  const script = active ? (active.content as unknown as WeeklyScript) : null;
  const evidenceIds = script
    ? [...new Set([...script.sections.flatMap((s) => s.lines.flatMap((l) => l.evidenceCalls)), ...script.objections.flatMap((o) => o.evidenceCalls)])]
    : [];
  const canOpen = new Set(
    viewer.isAdmin
      ? evidenceIds
      : (
          await prisma.callRecording.findMany({
            where: { ...callScope(viewer), id: { in: evidenceIds } },
            select: { id: true },
          })
        ).map((r) => r.id),
  );

  return (
    <div className="space-y-6">
      {script && active ? (
        <>
          <header className="max-w-3xl">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
              Ugens script · uge {active.weekKey?.split("-W")[1] ?? "–"}
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-stone-900">{headline(script.title)}</h2>
            <details className="group mt-2">
              <summary className="flex cursor-pointer list-none items-center gap-1 text-sm text-stone-500 hover:text-stone-700">
                Bygget på {active.basedOnCalls} samtaler — hvorfor ser det sådan ud? <Chevron />
              </summary>
              <div className="mt-2 space-y-3 rounded-xl bg-white p-4 text-sm text-stone-700 ring-1 ring-stone-200">
                <p>{script.summary}</p>
                {script.changes.length ? (
                  <ul className="space-y-1">
                    {script.changes.map((c, i) => (
                      <li key={i}>
                        <span className="font-medium text-stone-900">{c.what}</span> <span className="text-stone-500">— {c.why}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {script.caveats.length ? <p className="text-xs text-stone-500">Forbehold: {script.caveats.join(" ")}</p> : null}
              </div>
            </details>
          </header>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            {/* Manuskriptet: læses fra en ende af som én samtale */}
            <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200 sm:p-8">
              <ol className="space-y-8">
                {script.sections.map((s) => (
                  <li key={s.key}>
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-stone-400">{PHASE_LABELS[s.key]}</p>
                    <div className="space-y-3">
                      {s.lines.map((l, i) => (
                        <div key={i} className="space-y-1.5">
                          <p className="border-l-2 border-emerald-600 pl-3 text-[15px] leading-relaxed text-stone-900">{l.text}</p>
                          {l.customerReply ? (
                            <p className="pl-8 text-sm italic text-stone-500">
                              <span className="not-italic text-stone-400">Kunde: </span>
                              {l.customerReply}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                    <details className="group mt-2">
                      <summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-stone-400 hover:text-stone-600">
                        Hvorfor? <Chevron />
                      </summary>
                      <div className="mt-1.5 space-y-1 text-xs text-stone-500">
                        <p>{s.evidence}</p>
                        {s.lines
                          .filter((l) => l.note)
                          .map((l, i) => (
                            <p key={i}>
                              {l.note}
                              <EvidenceLinks ids={l.evidenceCalls} canOpen={canOpen} />
                            </p>
                          ))}
                      </div>
                    </details>
                  </li>
                ))}
              </ol>
            </article>

            {/* Indvendinger: klik for at se det bedste svar */}
            <aside className="lg:sticky lg:top-6 lg:self-start">
              <h3 className="mb-2 text-sm font-semibold text-stone-900">Indvendinger</h3>
              <div className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
                {script.objections.map((o, i) => (
                  <details key={i} className="group">
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-2 px-4 py-3 hover:bg-stone-50">
                      <span>
                        <span className="block text-sm font-medium text-stone-900">{OBJECTION_LABELS[o.category]}</span>
                        <span className="block text-xs text-stone-500">“{o.customerSays}”</span>
                      </span>
                      <Chevron />
                    </summary>
                    <div className="space-y-2 px-4 pb-4">
                      <p className="border-l-2 border-emerald-600 pl-3 text-sm leading-relaxed text-stone-900">{o.response}</p>
                      <p className="text-[11px] text-stone-400">
                        {o.evidence}
                        <EvidenceLinks ids={o.evidenceCalls} canOpen={canOpen} />
                      </p>
                    </div>
                  </details>
                ))}
              </div>
            </aside>
          </div>
        </>
      ) : (
        <Empty>Ugens script er ikke genereret endnu.</Empty>
      )}

      <div className="space-y-2 text-sm">
        <details className="group rounded-xl bg-white ring-1 ring-stone-200">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-stone-600">
            Versioner af ugens script <Chevron />
          </summary>
          <div className="px-4 pb-4">
            {weekly.length === 0 ? (
              <Empty>Ingen versioner endnu.</Empty>
            ) : (
              <table className="w-full">
                <tbody>
                  {weekly.map((w) => (
                    <tr key={w.id} className="border-t border-stone-100 first:border-0">
                      <td className="py-2 text-stone-900">Version {w.version}</td>
                      <td className="py-2 text-stone-500">{w.weekKey ?? "–"}</td>
                      <td className="py-2 text-stone-500">{w.publishedAt?.toLocaleDateString("da-DK") ?? "–"}</td>
                      <td className="py-2 tabular-nums text-stone-500">{w.basedOnCalls} samtaler</td>
                      <td className="py-2">
                        {w.isActive ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Aktiv</span>
                        ) : (
                          <span className="text-xs text-stone-400">{w.rolledBackAt ? "Rullet tilbage" : "Tidligere"}</span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {viewer.isAdmin && !w.isActive ? (
                          <form action={rollbackScriptAction}>
                            <input type="hidden" name="id" value={w.id} />
                            <button type="submit" className="rounded-md px-2 py-1 text-xs text-stone-600 ring-1 ring-stone-300 hover:bg-stone-100">
                              Gør aktiv igen
                            </button>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </details>

        <details className="group rounded-xl bg-white ring-1 ring-stone-200">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-stone-600">
            Tidligere pitches <Chevron />
          </summary>
          <div className="space-y-2 px-4 pb-4">
            {seeds.length === 0 ? (
              <Empty>Ingen historiske pitches indlæst.</Empty>
            ) : (
              seeds.map((s) => (
                <details key={s.id} className="rounded-lg bg-stone-50 p-3">
                  <summary className="cursor-pointer font-medium text-stone-800">{s.name}</summary>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-stone-700">{(s.content as unknown as SeedScriptContent).text}</pre>
                </details>
              ))
            )}
          </div>
        </details>
      </div>
    </div>
  );
}
