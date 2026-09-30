import { redirect } from "next/navigation";
import {
  MIN_GROUP,
  isLearnable,
  metricComparison,
  objectionStats,
  phaseStats,
  pitchStats,
  signalStats,
  type GroupStat,
} from "@/lib/scripts-traening/insights";
import { OBJECTION_LABELS, PHASE_LABELS, PITCH_LABELS, QUALITY_LABELS, SIGNAL_LABELS } from "@/lib/scripts-traening/labels";
import { callScope, getViewer, loadAnalyzedCalls } from "@/lib/scripts-traening/queries";
import { Card, Empty, Pct, TooFew } from "../_components/ui";

function Rate({ g }: { g: GroupStat | undefined }) {
  if (!g) return <span className="text-stone-300">–</span>;
  if (!g.enoughData) return <TooFew n={g.n} min={MIN_GROUP} />;
  return (
    <span className="tabular-nums">
      <Pct value={g.rate} /> <span className="text-xs text-stone-400">({g.n})</span>
    </span>
  );
}

const find = (xs: GroupStat[], key: string) => xs.find((x) => x.key === key);

export default async function InsightsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const calls = await loadAnalyzedCalls(callScope(viewer));
  const learnable = calls.filter(isLearnable);
  if (learnable.length === 0) {
    return <Empty>Ingen analyserede salgssamtaler med kendt udfald endnu.</Empty>;
  }
  const pitches = pitchStats(calls);
  const objections = objectionStats(calls);
  const signals = signalStats(calls);
  const phases = phaseStats(calls);
  const metrics = metricComparison(calls);

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-600">
        Bygget på {learnable.length} salgssamtaler med kendt udfald. Tallet er andelen, der endte med et booket møde. Grupper med under{" "}
        {MIN_GROUP} samtaler sammenlignes ikke.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Pitch-versioner">
          <table className="w-full text-sm">
            <tbody>
              {pitches.map((p) => (
                <tr key={p.key} className="border-t border-stone-100 first:border-0">
                  <td className="py-1.5 text-stone-700">{PITCH_LABELS[p.key] ?? p.key}</td>
                  <td className="py-1.5 text-right">
                    <Rate g={p} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Bookede vs. ikke-bookede (median)">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-stone-500">
                <th className="pb-1 font-medium" />
                <th className="pb-1 text-right font-medium">Møde booket ({metrics.booked.n})</th>
                <th className="pb-1 text-right font-medium">Ikke booket ({metrics.notBooked.n})</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Samlet score", (s: typeof metrics.booked) => s.overall],
                  ["Sælgerens taletid", (s: typeof metrics.booked) => (s.talkRatio === null ? null : `${Math.round(s.talkRatio * 100)} %`)],
                  ["Åbne spørgsmål", (s: typeof metrics.booked) => s.openQuestions],
                  ["Længste monolog (s)", (s: typeof metrics.booked) => s.longestMonologue],
                  ["Close-forsøg", (s: typeof metrics.booked) => s.closeAttempts],
                ] as const
              ).map(([label, f]) => (
                <tr key={label} className="border-t border-stone-100">
                  <td className="py-1.5 text-stone-700">{label}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {metrics.booked.enoughData ? (f(metrics.booked) ?? "–") : <TooFew n={metrics.booked.n} min={MIN_GROUP} />}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {metrics.notBooked.enoughData ? (f(metrics.notBooked) ?? "–") : <TooFew n={metrics.notBooked.n} min={MIN_GROUP} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card title="Indvendinger — bookingrate efter håndtering">
        {objections.length === 0 ? (
          <Empty>Ingen indvendinger endnu.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-stone-500">
                <th className="pb-1 font-medium">Indvending</th>
                <th className="pb-1 text-right font-medium">Alle</th>
                {(["strong", "ok", "weak", "none"] as const).map((h) => (
                  <th key={h} className="pb-1 text-right font-medium">
                    {QUALITY_LABELS[h]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {objections.map((o) => (
                <tr key={o.key} className="border-t border-stone-100">
                  <td className="py-1.5 text-stone-700">{OBJECTION_LABELS[o.key as keyof typeof OBJECTION_LABELS] ?? o.key}</td>
                  <td className="py-1.5 text-right">
                    <Rate g={o} />
                  </td>
                  {(["strong", "ok", "weak", "none"] as const).map((h) => (
                    <td key={h} className="py-1.5 text-right">
                      <Rate g={find(o.byHandling, h)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Kundesignaler — taget hånd om?">
          {signals.length === 0 ? (
            <Empty>Ingen signaler endnu.</Empty>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-stone-500">
                  <th className="pb-1 font-medium">Signal</th>
                  <th className="pb-1 text-right font-medium">Ja</th>
                  <th className="pb-1 text-right font-medium">Nej</th>
                </tr>
              </thead>
              <tbody>
                {signals.map((s) => (
                  <tr key={s.key} className="border-t border-stone-100">
                    <td className="py-1.5 text-stone-700">
                      {SIGNAL_LABELS[s.key as keyof typeof SIGNAL_LABELS] ?? s.key} <span className="text-xs text-stone-400">({s.n})</span>
                    </td>
                    <td className="py-1.5 text-right">
                      <Rate g={find(s.byAddressed, "ja")} />
                    </td>
                    <td className="py-1.5 text-right">
                      <Rate g={find(s.byAddressed, "nej")} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Faser — bookingrate efter kvalitet">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-stone-500">
                <th className="pb-1 font-medium">Fase</th>
                {(["strong", "ok", "weak", "missing"] as const).map((q) => (
                  <th key={q} className="pb-1 text-right font-medium">
                    {q === "missing" ? "Mangler" : QUALITY_LABELS[q]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {phases.map((p) => (
                <tr key={p.phase} className="border-t border-stone-100">
                  <td className="py-1.5 text-stone-700">{PHASE_LABELS[p.phase]}</td>
                  {(["strong", "ok", "weak", "missing"] as const).map((q) => (
                    <td key={q} className="py-1.5 text-right">
                      <Rate g={find(p.byQuality, q)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
