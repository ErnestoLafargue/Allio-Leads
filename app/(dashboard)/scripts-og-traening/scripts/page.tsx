import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { SeedScriptContent, WeeklyScript } from "@/lib/sales-scripts/schema";
import { OBJECTION_LABELS, PHASE_LABELS } from "@/lib/scripts-traening/labels";
import { callScope, getViewer } from "@/lib/scripts-traening/queries";
import { Card, Empty } from "../_components/ui";
import { rollbackScriptAction } from "./actions";

/** Eksempler fra samtaler; sælgere kan kun åbne deres egne — kollegers vises uden link. */
function EvidenceLinks({ ids, canOpen }: { ids: string[]; canOpen: ReadonlySet<string> }) {
  if (!ids.length) return null;
  const chip = "rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-600";
  return (
    <span className="ml-1 inline-flex gap-1">
      {ids.map((id, i) =>
        canOpen.has(id) ? (
          <Link
            key={id}
            href={`/scripts-og-traening/samtaler/${id}`}
            className={`${chip} hover:bg-stone-200`}
            title="Eksempel fra en rigtig samtale"
          >
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
    <div className="space-y-4">
      {script && active ? (
        <>
          <Card title={`Ugens script — ${script.title}`}>
            <p className="text-xs text-stone-500">
              Version {active.version}
              {active.weekKey ? ` · uge ${active.weekKey}` : ""} · bygget på {active.basedOnCalls} salgssamtaler ·{" "}
              {active.generatedBy === "api" ? "genereret automatisk via API" : "genereret i Claude-session"} ·{" "}
              {active.publishedAt?.toLocaleDateString("da-DK")}
            </p>
            <p className="mt-2 text-sm text-stone-800">{script.summary}</p>
          </Card>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              {script.sections.map((s) => (
                <Card key={s.key} title={`${PHASE_LABELS[s.key]} — ${s.title}`}>
                  <ol className="space-y-2">
                    {s.lines.map((l, i) => (
                      <li key={i} className="rounded-lg bg-stone-50 p-2.5">
                        <p className="text-sm text-stone-900">“{l.text}”</p>
                        {l.note || l.evidenceCalls.length ? (
                          <p className="mt-1 text-xs text-stone-500">
                            {l.note}
                            <EvidenceLinks ids={l.evidenceCalls} canOpen={canOpen} />
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                  <p className="mt-2 text-xs text-stone-500">📊 {s.evidence}</p>
                </Card>
              ))}
            </div>
            <div className="space-y-4">
              <Card title="Indvendinger">
                <ul className="space-y-3">
                  {script.objections.map((o, i) => (
                    <li key={i} className="rounded-lg bg-stone-50 p-2.5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{OBJECTION_LABELS[o.category]}</p>
                      <p className="mt-0.5 text-sm text-stone-700">Kunden: “{o.customerSays}”</p>
                      <p className="mt-1 text-sm font-medium text-stone-900">“{o.response}”</p>
                      <p className="mt-1 text-xs text-stone-500">
                        📊 {o.evidence}
                        <EvidenceLinks ids={o.evidenceCalls} canOpen={canOpen} />
                      </p>
                    </li>
                  ))}
                </ul>
              </Card>
              {script.changes.length ? (
                <Card title="Ændret siden sidst">
                  <ul className="space-y-1.5 text-sm text-stone-700">
                    {script.changes.map((c, i) => (
                      <li key={i}>
                        <span className="font-medium">{c.what}</span> — {c.why}
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}
              {script.caveats.length ? (
                <Card title="For få data til at konkludere">
                  <ul className="list-inside list-disc space-y-1 text-sm text-stone-600">
                    {script.caveats.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </Card>
              ) : null}
            </div>
          </div>
        </>
      ) : (
        <Empty>Ugens script er ikke genereret endnu.</Empty>
      )}

      <Card title="Versioner af ugens script">
        {weekly.length === 0 ? (
          <Empty>Ingen versioner endnu.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-stone-500">
                <th className="pb-1 font-medium">Version</th>
                <th className="pb-1 font-medium">Uge</th>
                <th className="pb-1 font-medium">Udgivet</th>
                <th className="pb-1 font-medium">Samtaler</th>
                <th className="pb-1 font-medium">Status</th>
                <th className="pb-1" />
              </tr>
            </thead>
            <tbody>
              {weekly.map((w) => (
                <tr key={w.id} className="border-t border-stone-100">
                  <td className="py-1.5">{w.version}</td>
                  <td className="py-1.5">{w.weekKey ?? "–"}</td>
                  <td className="py-1.5">{w.publishedAt?.toLocaleString("da-DK", { dateStyle: "short", timeStyle: "short" }) ?? "–"}</td>
                  <td className="py-1.5 tabular-nums">{w.basedOnCalls}</td>
                  <td className="py-1.5">
                    {w.isActive ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Aktiv</span>
                    ) : w.rolledBackAt ? (
                      <span className="text-xs text-stone-500">Rullet tilbage</span>
                    ) : (
                      <span className="text-xs text-stone-500">Tidligere</span>
                    )}
                  </td>
                  <td className="py-1.5 text-right">
                    {viewer.isAdmin && !w.isActive ? (
                      <form action={rollbackScriptAction}>
                        <input type="hidden" name="id" value={w.id} />
                        <button type="submit" className="rounded-md border border-stone-300 px-2 py-1 text-xs text-stone-700 hover:bg-stone-100">
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
      </Card>

      <Card title="Tidligere pitches">
        {seeds.length === 0 ? (
          <Empty>Ingen historiske pitches indlæst.</Empty>
        ) : (
          <div className="space-y-2">
            {seeds.map((s) => (
              <details key={s.id} className="rounded-lg border border-stone-200 bg-stone-50 p-2.5">
                <summary className="cursor-pointer text-sm font-medium text-stone-900">{s.name}</summary>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-stone-700">
                  {(s.content as unknown as SeedScriptContent).text}
                </pre>
              </details>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
