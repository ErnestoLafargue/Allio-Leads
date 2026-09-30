import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PHASES } from "@/lib/call-analysis/schema";
import { isBooked, trainingFocus } from "@/lib/scripts-traening/insights";
import { PHASE_LABELS, clock } from "@/lib/scripts-traening/labels";
import { callScope, getViewer, loadAnalyzedCalls } from "@/lib/scripts-traening/queries";
import { Card, Empty, OutcomeBadge, Score, Stat } from "./_components/ui";

export default async function OverviewPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const scope = callScope(viewer);
  const [calls, benchmark, activeScript, pipeline] = await Promise.all([
    loadAnalyzedCalls(scope),
    loadAnalyzedCalls({ outcomeStatus: "MEETING_BOOKED" }),
    prisma.salesScriptVersion.findFirst({ where: { kind: "WEEKLY", isActive: true }, select: { name: true, version: true, weekKey: true, basedOnCalls: true } }),
    viewer.isAdmin
      ? prisma.callRecording.groupBy({ by: ["pipelineStatus"], _count: { _all: true } })
      : Promise.resolve([]),
  ]);

  const sales = calls.filter((c) => c.result.isSalesConversation);
  const booked = sales.filter(isBooked).length;
  const scores = sales.map((c) => c.scores.overall).filter((v): v is number => v !== null);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const phaseAvg = PHASES.filter((p) => p !== "confirmation")
    .flatMap((p) => {
      const vals = sales.map((c) => c.scores.phases[p]).filter((v): v is number => v !== null);
      return vals.length ? [{ phase: p, avg: vals.reduce((a, b) => a + b, 0) / vals.length }] : [];
    })
    .sort((a, b) => b.avg - a.avg);
  const focus = viewer.isAdmin ? [] : trainingFocus(calls, benchmark, PHASE_LABELS);
  const recent = [...calls].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()).slice(0, 6);
  const count = (s: string) => pipeline.find((p) => p.pipelineStatus === s)?._count._all ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Analyserede salgssamtaler" value={sales.length} hint={`${calls.length - sales.length} uden reel samtale`} />
        <Stat
          label="Møder booket"
          value={sales.length ? `${Math.round((booked / sales.length) * 100)} %` : "–"}
          hint={`${booked} af ${sales.length}`}
        />
        <Stat label="Gennemsnitlig score" value={<Score value={avgScore} size="lg" />} hint="Faser, indvendinger og metrik" />
        <Stat
          label="Største styrke / mulighed"
          value={<span className="text-base">{phaseAvg[0] ? PHASE_LABELS[phaseAvg[0].phase] : "–"}</span>}
          hint={phaseAvg.length ? `Mest at hente: ${PHASE_LABELS[phaseAvg[phaseAvg.length - 1]!.phase]}` : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Seneste samtaler"
          right={
            <Link href="/scripts-og-traening/samtaler" className="text-xs text-stone-500 hover:text-stone-900">
              Se alle →
            </Link>
          }
        >
          {recent.length === 0 ? (
            <Empty>Ingen analyserede samtaler endnu.</Empty>
          ) : (
            <ul className="divide-y divide-stone-100">
              {recent.map((c) => (
                <li key={c.callRecordingId}>
                  <Link href={`/scripts-og-traening/samtaler/${c.callRecordingId}`} className="flex items-center gap-3 py-2 hover:bg-stone-50">
                    <span className="w-10 text-center">
                      <Score value={c.scores.overall} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 text-sm text-stone-800">{c.result.summary}</span>
                      <span className="text-xs text-stone-500">
                        {c.agentName ?? "Ukendt"} · {c.startedAt.toLocaleDateString("da-DK")} · {clock(c.durationSeconds)}
                      </span>
                    </span>
                    <OutcomeBadge status={c.outcomeStatus} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          <Card
            title="Ugens script"
            right={
              <Link href="/scripts-og-traening/scripts" className="text-xs text-stone-500 hover:text-stone-900">
                Åbn →
              </Link>
            }
          >
            {activeScript ? (
              <p className="text-sm text-stone-700">
                <span className="font-semibold">{activeScript.name}</span> (version {activeScript.version}
                {activeScript.weekKey ? `, uge ${activeScript.weekKey}` : ""}) — bygget på {activeScript.basedOnCalls} samtaler.
              </p>
            ) : (
              <Empty>Ugens script er ikke genereret endnu.</Empty>
            )}
          </Card>

          {!viewer.isAdmin ? (
            <Card
              title="Dit fokus lige nu"
              right={
                <Link href="/scripts-og-traening/traening" className="text-xs text-stone-500 hover:text-stone-900">
                  Træning →
                </Link>
              }
            >
              {focus.length === 0 ? (
                <Empty>For få analyserede samtaler til personlige fokusområder endnu.</Empty>
              ) : (
                <ol className="space-y-1 text-sm text-stone-700">
                  {focus.map((f, i) => (
                    <li key={f.key}>
                      {i + 1}. <span className="font-medium">{f.label}</span> — du {f.seller}, bookede møder {f.benchmark}
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          ) : (
            <Card title="Behandling af samtaler">
              <dl className="grid grid-cols-2 gap-2 text-sm">
                {[
                  ["Analyseret", count("ANALYZED")],
                  ["Transskriberet, venter", count("TRANSCRIBED")],
                  ["I kø til transskribering", count("NEW")],
                  ["Uden tale / korte / dubletter", count("NO_SPEECH") + count("SKIPPED_SHORT") + count("SKIPPED_NO_CONVERSATION") + count("SKIPPED_DUPLICATE")],
                  ["Fejl", count("FAILED")],
                ].map(([label, n]) => (
                  <div key={label} className="rounded-lg bg-stone-50 p-2">
                    <dt className="text-xs text-stone-500">{label}</dt>
                    <dd className="font-semibold tabular-nums">{n}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
