"use client";

import type { CallActivity, CallHistory } from "@/lib/flowzone/call-activity";
import { AVERAGE_ACTIVE_DAYS } from "@/lib/flowzone/call-activity";
import { benchmarkCurve, WORKDAY_BLOCK } from "@/lib/flowzone/call-benchmark";
import type { TimeZone } from "@/lib/flowzone/zones";
import { parseTimeSlot } from "@/lib/flowzone/zone-manager";
import { CallBlockChart, type ChartBand } from "./call-block-chart";
import { Dialog, DialogContent, DialogHeader, DialogTitle, cn } from "./ui";

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const fmt = (n: number) => n.toLocaleString("da-DK", { maximumFractionDigits: 1 });

interface DayCallAnalysisProps {
  open: boolean;
  onClose: () => void;
  dayKey: string;
  dayTitle: string;
  dayLabel: string;
  isToday: boolean;
  activity: CallActivity | null;
  history: CallHistory | null;
  zones: TimeZone[];
}

type Row = { label: string; time: string; day: number; average: number; target: number | null; meetings: number; goodConversations: number; strong?: boolean };

/** Opkald og møder i [start, end) ud fra kvarter-tallene. */
function sumRange(values: number[], start: number, end: number, bucket: number) {
  let sum = 0;
  for (let i = Math.floor(start / bucket); i < Math.ceil(end / bucket); i++) sum += values[i] ?? 0;
  return sum;
}

/**
 * Hele dagen 09:00–17:00 i ét vindue: graf med ringeblokke og pauser i baggrunden, nøgletal og en tabel pr. blok.
 * Tallene regnes for hele dagen (ikke blok for blok). Målet for dagen har sit eget gulv og loft (150–200 opkald)
 * og fordeles på kvarterer efter rytmen på de bedste salgsdage, så guldlinjen følger dagen.
 */
export function DayCallAnalysis({ open, onClose, dayKey, dayTitle, dayLabel, isToday, activity, history, zones }: DayCallAnalysisProps) {
  const bucket = activity?.bucketMinutes ?? 15;
  const { start, end } = WORKDAY_BLOCK;

  const callingZones = zones.filter((z) => !z.isBreakZone && z.preferredTaskTypes.includes("deep-work"));
  // Målet for hele dagen (som hvis man ringede hele dagen), fordelt på kvarterer efter dagens rytme
  const curve = history ? benchmarkCurve(history, dayKey, WORKDAY_BLOCK, activity?.average) : null;
  const dayTarget = curve?.benchmark ?? null;
  const targetIn = (from: number, to: number) => {
    if (!curve) return null;
    let sum = 0;
    for (let i = Math.floor(from / bucket); i < Math.ceil(to / bucket); i++) sum += curve.perBucket.get(i) ?? 0;
    return Math.round(sum);
  };

  const bands: ChartBand[] = zones
    .map((z) => ({ z, slot: parseTimeSlot(z.timeSlot) }))
    .filter(({ z, slot }) => slot.start < end && slot.end > start && (z.isBreakZone || callingZones.includes(z)))
    .map(({ z, slot }) => ({
      start: Math.max(slot.start, start),
      end: Math.min(slot.end, end),
      label: z.isBreakZone ? "Pause" : z.name.replace("Ringeblok ", "Blok "),
      kind: z.isBreakZone ? ("break" as const) : ("calling" as const),
    }));

  const benchmarkAt = (minute: number) => curve?.perBucket.get(Math.floor(minute / bucket)) ?? null;

  // Nøgletal for hele dagen
  const dayCalls = activity ? sumRange(activity.day, start, end, bucket) : 0;
  const avgCalls = activity ? sumRange(activity.average, start, end, bucket) : 0;
  const dayMeetings = activity ? sumRange(activity.meetings, start, end, bucket) : 0;
  const dayGoodConversations = activity ? sumRange(activity.goodConversations, start, end, bucket) : 0;
  const previousDays = history
    ? Object.keys(history.days).filter((k) => k < dayKey).sort().reverse().slice(0, AVERAGE_ACTIVE_DAYS)
    : [];
  const avgMeetings = previousDays.length
    ? previousDays.reduce((sum, k) => sum + (history?.meetings[k] ?? 0), 0) / previousDays.length
    : 0;
  const callsDiffPct = avgCalls > 0 ? Math.round(((dayCalls - avgCalls) / avgCalls) * 100) : null;

  // Hvornår blev der ringet: første og sidste kvarter med opkald, og kvarterer uden opkald ind imellem
  const quarters = activity ? activity.day.slice(start / bucket, end / bucket) : [];
  const firstIdx = quarters.findIndex((n) => n > 0);
  const lastIdx = quarters.length - 1 - [...quarters].reverse().findIndex((n) => n > 0);
  const idleQuarters = firstIdx >= 0 ? quarters.slice(firstIdx, lastIdx + 1).filter((n) => n === 0).length : 0;
  const bestIdx = quarters.reduce((best, n, i) => (n > (quarters[best] ?? 0) ? i : best), 0);

  // Tabel: hver ringeblok, tiden uden for blokkene og hele dagen
  const rows: Row[] = [];
  let blockCalls = 0;
  let blockAvg = 0;
  let blockMeetings = 0;
  let blockGood = 0;
  let blockTarget = 0;
  for (const z of callingZones) {
    const slot = parseTimeSlot(z.timeSlot);
    const row: Row = {
      label: z.name,
      time: `${hhmm(slot.start)}–${hhmm(slot.end)}`,
      day: activity ? sumRange(activity.day, slot.start, slot.end, bucket) : 0,
      average: activity ? sumRange(activity.average, slot.start, slot.end, bucket) : 0,
      target: targetIn(slot.start, slot.end),
      meetings: activity ? sumRange(activity.meetings, slot.start, slot.end, bucket) : 0,
      goodConversations: activity ? sumRange(activity.goodConversations, slot.start, slot.end, bucket) : 0,
    };
    blockCalls += row.day;
    blockAvg += row.average;
    blockMeetings += row.meetings;
    blockGood += row.goodConversations;
    blockTarget += row.target ?? 0;
    rows.push(row);
  }
  rows.push({
    label: "Uden for ringeblokkene",
    time: `${hhmm(start)}–${hhmm(end)}`,
    day: dayCalls - blockCalls,
    average: Math.round((avgCalls - blockAvg) * 10) / 10,
    target: dayTarget ? dayTarget.target - blockTarget : null,
    meetings: dayMeetings - blockMeetings,
    goodConversations: dayGoodConversations - blockGood,
  });
  rows.push({
    label: "Hele dagen",
    time: `${hhmm(start)}–${hhmm(end)}`,
    day: dayCalls,
    average: avgCalls,
    target: dayTarget?.target ?? null,
    meetings: dayMeetings,
    goodConversations: dayGoodConversations,
    strong: true,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dagsanalyse – {dayTitle}</DialogTitle>
          <p className="text-sm text-stone-500">
            Dine opkald 09:00–17:00 pr. kvarter. Gennemsnittet er dine seneste {activity?.averageDays || AVERAGE_ACTIVE_DAYS} ringedage.
          </p>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <Kpi label={`Opkald ${isToday ? "i dag" : dayLabel}`} value={activity ? String(dayCalls) : "–"} sub={callsDiffPct === null ? "" : `${callsDiffPct >= 0 ? "+" : ""}${callsDiffPct}% mod gns.`} tone={callsDiffPct === null ? undefined : callsDiffPct >= 0 ? "good" : "bad"} />
          <Kpi label="Gns. opkald" value={activity?.averageDays ? fmt(avgCalls) : "–"} sub={`${activity?.averageDays ?? 0} ringedage`} />
          <Kpi
            label={dayTarget?.source === "personal" ? "Dit mål for dagen" : "Mål for dagen"}
            value={dayTarget ? String(dayTarget.target) : "–"}
            sub={dayTarget ? (dayCalls >= dayTarget.target ? "Nået" : `${dayTarget.target - dayCalls} tilbage`) : ""}
            tone={dayTarget && dayCalls >= dayTarget.target ? "good" : undefined}
          />
          <Kpi label="Møder booket" value={activity ? String(dayMeetings) : "–"} sub={previousDays.length ? `Gns. ${fmt(avgMeetings)} pr. dag` : ""} tone={dayMeetings > avgMeetings && dayMeetings > 0 ? "good" : undefined} />
          <Kpi label="Gode samtaler (8+ min)" value={activity ? String(dayGoodConversations) : "–"} sub="Samtaler på 8 min eller mere" />
          <Kpi label="Møder pr. 100 opkald" value={dayCalls ? fmt((dayMeetings / dayCalls) * 100) : "–"} />
        </div>

        <div className="mt-4 h-80">
          <CallBlockChart
            start={start}
            end={end}
            activity={activity}
            error={null}
            isToday={isToday}
            dayLabel={isToday ? "I dag" : dayLabel}
            benchmark={dayTarget}
            title="Opkald pr. 15 min – hele dagen"
            bands={bands}
            benchmarkAt={benchmarkAt}
            showGoodConversationsLegend
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="overflow-x-auto rounded-md border border-stone-200 lg:col-span-2">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs text-stone-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Periode</th>
                  <th className="px-3 py-2 text-right font-medium">{isToday ? "I dag" : dayLabel}</th>
                  <th className="px-3 py-2 text-right font-medium">Gns.</th>
                  <th className="px-3 py-2 text-right font-medium">Forskel</th>
                  <th className="px-3 py-2 text-right font-medium">Mål</th>
                  <th className="px-3 py-2 text-right font-medium">Gode samtaler</th>
                  <th className="px-3 py-2 text-right font-medium">Møder</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const diff = r.day - r.average;
                  return (
                    <tr key={r.label} className={cn("border-t border-stone-100", r.strong && "bg-stone-50 font-semibold")}>
                      <td className="px-3 py-2">
                        <div className="text-stone-900">{r.label}</div>
                        {!r.strong && r.label !== "Uden for ringeblokkene" && <div className="text-xs text-stone-500">{r.time}</div>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-stone-900">{r.day}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-stone-600">{fmt(r.average)}</td>
                      <td className={cn("px-3 py-2 text-right tabular-nums", diff >= 0 ? "text-green-700" : "text-red-600")}>
                        {diff >= 0 ? "+" : ""}
                        {fmt(diff)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-stone-600">
                        {r.target === null ? "–" : (
                          <span className={r.day >= r.target ? "text-green-700" : undefined}>{r.target}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-stone-900">{r.goodConversations || "–"}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-stone-900">{r.meetings || "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="space-y-2 rounded-md border border-stone-200 p-3 text-sm">
            <div className="text-xs font-medium uppercase tracking-wide text-stone-500">Dagens rytme</div>
            {firstIdx < 0 ? (
              <p className="text-stone-500">Ingen opkald mellem 09:00 og 17:00.</p>
            ) : (
              <>
                <Fact label="Første opkald" value={`ca. ${hhmm(start + firstIdx * bucket)}`} />
                <Fact label="Sidste opkald" value={`ca. ${hhmm(start + (lastIdx + 1) * bucket)}`} />
                <Fact label="Bedste kvarter" value={`${hhmm(start + bestIdx * bucket)} · ${quarters[bestIdx]} opkald`} />
                <Fact label="Kvarterer uden opkald" value={`${idleQuarters} (${idleQuarters * bucket} min)`} hint="Mellem første og sidste opkald — pauser, møder og lange samtaler" />
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-md border border-stone-200 bg-white p-3">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-stone-900">{value}</div>
      {sub && <div className={cn("mt-0.5 text-xs", tone === "good" ? "text-green-700" : tone === "bad" ? "text-red-600" : "text-stone-500")}>{sub}</div>}
    </div>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3" title={hint}>
      <span className="text-stone-500">{label}</span>
      <span className="font-medium tabular-nums text-stone-900">{value}</span>
    </div>
  );
}
