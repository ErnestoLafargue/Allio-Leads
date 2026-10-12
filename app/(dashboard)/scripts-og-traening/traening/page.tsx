import Link from "next/link";
import { redirect } from "next/navigation";
import { PHASES } from "@/lib/call-analysis/schema";
import { MIN_TRAINING, isBooked, trainingFocus, type AnalyzedCall } from "@/lib/scripts-traening/insights";
import { MOMENT_STYLE, OBJECTION_LABELS, PHASE_LABELS, QUALITY_LABELS, clock } from "@/lib/scripts-traening/labels";
import { getViewer, listSellers, loadAnalyzedCalls } from "@/lib/scripts-traening/queries";
import { Card, Empty, Score, Stat } from "../_components/ui";

function avg(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

function examples(calls: AnalyzedCall[], kinds: ("strong" | "improve" | "missed")[], take: number) {
  return calls
    .flatMap((c) => c.result.moments.filter((m) => kinds.includes(m.kind)).map((m) => ({ call: c, m })))
    .sort((a, b) => b.call.startedAt.getTime() - a.call.startedAt.getTime())
    .slice(0, take);
}

export default async function TrainingPage({ searchParams }: { searchParams: Promise<{ seller?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const { seller } = await searchParams;
  const sellers = viewer.isAdmin ? await listSellers() : [];
  const sellerId = viewer.isAdmin ? (seller ?? sellers[0]?.id ?? viewer.userId) : viewer.userId;
  const sellerName = viewer.isAdmin ? (sellers.find((s) => s.id === sellerId)?.name ?? "Sælger") : viewer.name;

  const [mine, benchmark] = await Promise.all([
    loadAnalyzedCalls({ agentUserId: sellerId }),
    loadAnalyzedCalls({ outcomeStatus: "MEETING_BOOKED" }),
  ]);
  const sales = mine.filter((c) => c.result.isSalesConversation);
  const benchSales = benchmark.filter((c) => c.result.isSalesConversation);
  const focus = trainingFocus(mine, benchmark, PHASE_LABELS);
  const strong = examples(sales, ["strong"], 6);
  const weak = examples(sales, ["missed", "improve"], 8);
  const drills = weak.filter((w) => w.m.betterLine).slice(0, 5);
  const booked = sales.filter(isBooked).length;

  const objectionRows = Object.entries(
    sales
      .flatMap((c) => c.result.objections)
      .reduce<Record<string, Record<string, number>>>((acc, o) => {
        acc[o.category] ??= {};
        acc[o.category]![o.handling] = (acc[o.category]![o.handling] ?? 0) + 1;
        return acc;
      }, {}),
  ).sort((a, b) => Object.values(b[1]).reduce((x, y) => x + y, 0) - Object.values(a[1]).reduce((x, y) => x + y, 0));

  return (
    <div className="space-y-4">
      {viewer.isAdmin ? (
        <form className="flex items-end gap-3 rounded-xl border border-stone-200/90 bg-white p-3 shadow-sm">
          <label className="text-xs text-stone-600">
            Sælger
            <select name="seller" defaultValue={sellerId} className="mt-1 block rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm">
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-800">
            Vis
          </button>
        </form>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={`Salgssamtaler · ${sellerName}`} value={sales.length} />
        <Stat label="Møder booket" value={sales.length ? `${Math.round((booked / sales.length) * 100)} %` : "–"} hint={`${booked} af ${sales.length}`} />
        <Stat label="Gennemsnitlig score" value={<Score value={avg(sales.map((c) => c.scores.overall))} size="lg" />} />
      </div>

      <Card title="Dine 3 vigtigste fokusområder">
        {focus.length === 0 ? (
          <Empty>Der skal mindst {MIN_TRAINING} analyserede salgssamtaler til, før fokusområder beregnes.</Empty>
        ) : (
          <ol className="grid gap-3 md:grid-cols-3">
            {focus.map((f, i) => (
              <li key={f.key} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Fokus {i + 1}</p>
                <p className="mt-0.5 font-semibold text-stone-900">{f.label}</p>
                <p className="mt-1 text-sm text-stone-700">
                  Dit niveau <span className="font-semibold">{f.seller}</span> mod <span className="font-semibold">{f.benchmark}</span> i samtaler
                  der endte med møde ({f.n} samtaler).
                </p>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card title="Faseprofil — dig mod samtaler med booket møde">
        <ul className="space-y-2">
          {PHASES.filter((p) => p !== "confirmation").map((p) => {
            const me = avg(sales.map((c) => c.scores.phases[p]));
            const bench = avg(benchSales.map((c) => c.scores.phases[p]));
            return (
              <li key={p} className="grid grid-cols-[8rem_1fr_3rem] items-center gap-3 text-sm">
                <span className="text-stone-700">{PHASE_LABELS[p]}</span>
                <span className="relative h-2.5 rounded-full bg-stone-100">
                  <span className="absolute inset-y-0 left-0 rounded-full bg-stone-800" style={{ width: `${me ?? 0}%` }} />
                  {bench !== null ? (
                    <span className="absolute -top-1 h-4.5 w-0.5 bg-emerald-500" style={{ left: `${bench}%` }} title={`Bookede møder: ${bench}`} />
                  ) : null}
                </span>
                <Score value={me} />
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-stone-500">Grøn streg = gennemsnit i samtaler, der endte med et booket møde.</p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Dine stærke eksempler">
          {strong.length === 0 ? (
            <Empty>Ingen endnu.</Empty>
          ) : (
            <ul className="space-y-2">
              {strong.map(({ call, m }, i) => (
                <li key={i} className={`rounded-lg border-l-4 p-2.5 ${MOMENT_STYLE.strong.card}`}>
                  <Link href={`/scripts-og-traening/samtaler/${call.callRecordingId}?t=${Math.floor(m.evidence.t)}`} className="block">
                    <p className="text-sm font-semibold text-stone-900">{m.title}</p>
                    <p className="text-sm italic text-stone-700">“{m.evidence.quote}”</p>
                    <p className="text-xs text-stone-500">
                      {call.startedAt.toLocaleDateString("da-DK")} · {clock(m.evidence.t)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Her kan du blive bedre">
          {weak.length === 0 ? (
            <Empty>Ingen endnu.</Empty>
          ) : (
            <ul className="space-y-2">
              {weak.map(({ call, m }, i) => (
                <li key={i} className={`rounded-lg border-l-4 p-2.5 ${MOMENT_STYLE[m.kind].card}`}>
                  <Link href={`/scripts-og-traening/samtaler/${call.callRecordingId}?t=${Math.floor(m.evidence.t)}`} className="block">
                    <p className="text-sm font-semibold text-stone-900">{m.title}</p>
                    <p className="text-sm italic text-stone-700">“{m.evidence.quote}”</p>
                    <p className="text-sm text-stone-700">{m.explanation}</p>
                    <p className="text-xs text-stone-500">
                      {call.startedAt.toLocaleDateString("da-DK")} · {clock(m.evidence.t)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Øvelser: sig disse replikker højt">
          {drills.length === 0 ? (
            <Empty>Ingen forslag endnu.</Empty>
          ) : (
            <ol className="space-y-2 text-sm text-stone-800">
              {drills.map(({ m }, i) => (
                <li key={i} className="rounded-lg bg-stone-50 p-2.5">
                  <p className="text-xs text-stone-500">Situation: {m.title}</p>“{m.betterLine}”
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card title="Dine indvendinger">
          {objectionRows.length === 0 ? (
            <Empty>Ingen indvendinger endnu.</Empty>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-stone-500">
                  <th className="pb-1 font-medium">Indvending</th>
                  {(["strong", "ok", "weak", "none"] as const).map((h) => (
                    <th key={h} className="pb-1 text-right font-medium">
                      {QUALITY_LABELS[h]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {objectionRows.map(([cat, counts]) => (
                  <tr key={cat} className="border-t border-stone-100">
                    <td className="py-1 text-stone-700">{OBJECTION_LABELS[cat as keyof typeof OBJECTION_LABELS] ?? cat}</td>
                    {(["strong", "ok", "weak", "none"] as const).map((h) => (
                      <td key={h} className="py-1 text-right tabular-nums text-stone-700">
                        {counts[h] ?? 0}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
