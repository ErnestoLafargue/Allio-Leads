import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CALL_TYPE_LABELS, NEXT_STEP_LABELS, PITCH_LABELS, clock } from "@/lib/scripts-traening/labels";
import { callScope, getCallDetail, getViewer } from "@/lib/scripts-traening/queries";
import { CallReview } from "../../_components/call-review";
import { OutcomeBadge, Score } from "../../_components/ui";

export default async function CallDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const { id } = await params;
  const { t } = await searchParams;
  const call = await getCallDetail(id, callScope(viewer));
  if (!call) notFound();

  const a = call.analysis;
  const m = a?.scores.metrics;
  const audioSrc = call.playbackUrl ?? `/api/call-recordings/${call.id}/audio`;
  const initialT = t && Number.isFinite(Number(t)) ? Number(t) : null;

  return (
    <div className="space-y-4">
      <Link href="/scripts-og-traening/samtaler" className="text-sm text-stone-500 hover:text-stone-900">
        ← Alle samtaler
      </Link>

      <section className="rounded-xl border border-stone-200/90 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">{call.lead?.companyName ?? "Ukendt kunde"}</h2>
            <p className="mt-0.5 text-sm text-stone-600">
              {call.agent?.name ?? "Ukendt sælger"} · {call.startedAt.toLocaleString("da-DK", { dateStyle: "medium", timeStyle: "short" })} ·{" "}
              {clock(call.durationSeconds)} · {call.channels === "dual" ? "stereo" : "mono"}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <OutcomeBadge status={call.outcomeStatus} />
              {a ? (
                <>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700">
                    {CALL_TYPE_LABELS[a.result.callType] ?? a.result.callType}
                  </span>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700">
                    {PITCH_LABELS[a.result.pitch.version] ?? a.result.pitch.version}
                  </span>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-700">
                    Næste skridt: {NEXT_STEP_LABELS[a.result.nextStep.type] ?? a.result.nextStep.type}
                  </span>
                </>
              ) : null}
            </div>
          </div>
          {a ? (
            <div className="text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Samlet score</p>
              <Score value={a.overallScore} size="lg" />
              <p className="text-xs text-stone-400">beregnet ud fra faser, indvendinger og metrik</p>
            </div>
          ) : null}
        </div>
        {a ? (
          <>
            <p className="mt-3 text-sm text-stone-800">{a.result.summary}</p>
            {m ? (
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div className="rounded-lg bg-stone-50 p-2">
                  <dt className="text-xs text-stone-500">Sælgerens taletid</dt>
                  <dd className="font-semibold tabular-nums">{m.agentTalkRatio === null ? "–" : `${Math.round(m.agentTalkRatio * 100)} %`}</dd>
                </div>
                <div className="rounded-lg bg-stone-50 p-2">
                  <dt className="text-xs text-stone-500">Spørgsmål (åbne)</dt>
                  <dd className="font-semibold tabular-nums">
                    {m.agentQuestions} ({m.agentOpenQuestions})
                  </dd>
                </div>
                <div className="rounded-lg bg-stone-50 p-2">
                  <dt className="text-xs text-stone-500">Længste monolog</dt>
                  <dd className="font-semibold tabular-nums">{m.longestAgentMonologueSeconds} s</dd>
                </div>
                <div className="rounded-lg bg-stone-50 p-2">
                  <dt className="text-xs text-stone-500">Close-forsøg</dt>
                  <dd className="font-semibold tabular-nums">{a.result.closeAttempts.length}</dd>
                </div>
              </dl>
            ) : null}
            <p className="mt-2 text-[11px] text-stone-400">
              Analyse {a.source === "api" ? "via API" : "i Claude-session"} ({a.model}) · {a.createdAt.toLocaleDateString("da-DK")}
              {a.warnings.length ? ` · ${a.warnings.length} citater kunne ikke genfindes og er fjernet` : ""}
            </p>
          </>
        ) : null}
      </section>

      <CallReview audioSrc={audioSrc} initialT={initialT} segments={call.segments} analysis={a?.result ?? null} />
    </div>
  );
}
