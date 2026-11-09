"use client";

import { Bar, CartesianGrid, ComposedChart, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CallActivity } from "@/lib/flowzone/call-activity";
import type { BlockBenchmark } from "@/lib/flowzone/call-benchmark";

const DAY_COLOR = "#16a34a"; // grøn: den valgte dag
const AVERAGE_COLOR = "#2563eb"; // blå: eget gennemsnit
const BENCHMARK_COLOR = "#ca8a04"; // guld: mål
const MEETING_COLOR = "#eab308"; // guld: møder booket
const GOOD_CONVERSATION_COLOR = "#8b5cf6"; // lilla: gode samtaler (8+ min)
const AXIS_COLOR = "#78716c";
const GRID_COLOR = "#e7e5e4";

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const formatCount = (n: number) => n.toLocaleString("da-DK", { maximumFractionDigits: 1 });

/** Baggrundsfelt i grafen, fx en ringeblok eller en pause (minutter efter midnat). */
export type ChartBand = { start: number; end: number; label: string; kind: "calling" | "break" };

interface CallBlockChartProps {
  /** Tidsrummet grafen viser, i minutter efter midnat. */
  start: number;
  end: number;
  activity: CallActivity | null;
  error: string | null;
  isToday: boolean;
  dayLabel: string;
  benchmark: BlockBenchmark | null;
  /** Overskrift øverst i grafen. */
  title?: string;
  /** Felter i baggrunden (bruges i dagsanalysen). */
  bands?: ChartBand[];
  /** Gør grafen klikbar, fx for at åbne dagsanalysen. */
  onOpen?: () => void;
  /** Guldlinjens værdi pr. kvarter. Standard: målet fordelt jævnt over hele tidsrummet. */
  benchmarkAt?: (minute: number) => number | null;
  /** Vis "Gode samtaler" i forklaringen øverst (kun i dagsanalysen; søjlerne vises altid). */
  showGoodConversationsLegend?: boolean;
}

/**
 * Opkald pr. kvarter i en ringeblok: den valgte dag (grøn), eget gennemsnit (blå) og mål (guld, stiplet).
 * Lave søjler i bunden viser møder (guld) og gode samtaler på 8+ min (lilla), placeret i kvarteret
 * hvor opkaldet startede — det forklarer de huller i opkaldene, hvor man sidder i en lang samtale.
 */
export function CallBlockChart({
  start: rangeStart,
  end: rangeEnd,
  activity,
  error,
  isToday,
  dayLabel,
  benchmark,
  title = "Opkald pr. 15 min",
  bands = [],
  onOpen,
  benchmarkAt,
  showGoodConversationsLegend = false,
}: CallBlockChartProps) {
  const slot = { start: rangeStart, end: rangeEnd };
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const bucket = activity?.bucketMinutes ?? 15;

  // Målet for blokken fordeles jævnt på kvartererne, så guldlinjen viser tempoet man skal holde
  const bucketCount = Math.ceil((slot.end - slot.start) / bucket);
  const benchmarkPerBucket = benchmark ? Math.round((benchmark.target / bucketCount) * 10) / 10 : null;

  const points = [];
  for (let start = slot.start; start < slot.end; start += bucket) {
    const i = Math.floor(start / bucket);
    const notYet = isToday && start > nowMinutes;
    points.push({
      time: hhmm(start),
      range: `${hhmm(start)}–${hhmm(Math.min(start + bucket, slot.end))}`,
      day: activity && !notYet ? activity.day[i] : null,
      average: activity && activity.averageDays > 0 ? activity.average[i] : null,
      benchmark: benchmarkAt ? benchmarkAt(start) : benchmarkPerBucket,
      meetings: activity && activity.meetings[i] > 0 ? activity.meetings[i] : null,
      goodConversations: activity && activity.goodConversations[i] > 0 ? activity.goodConversations[i] : null,
    });
  }

  const dayTotal = points.reduce((sum, p) => sum + (p.day ?? 0), 0);
  const averageTotal = points.reduce((sum, p) => sum + (p.average ?? 0), 0);
  const hasAverage = !!activity && activity.averageDays > 0;
  const meetingTotal = points.reduce((sum, p) => sum + (p.meetings ?? 0), 0);
  const goodConversationTotal = points.reduce((sum, p) => sum + (p.goodConversations ?? 0), 0);
  // Søjlerne holdes lave: højst en fjerdedel af grafens højde
  const eventScaleMax = Math.max(1, ...points.map((p) => Math.max(p.meetings ?? 0, p.goodConversations ?? 0))) * 4;

  return (
    <div
      className={`flex h-full flex-col rounded-md border border-stone-200 bg-white px-3 pb-1 pt-2 ${onOpen ? "cursor-pointer transition-shadow hover:border-stone-300 hover:shadow-sm" : ""}`}
      onClick={onOpen}
      role={onOpen ? "button" : undefined}
      title={onOpen ? "Klik for at se analysen af hele dagen" : undefined}
    >
      <div className="mb-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="text-xs font-medium text-stone-700">{title}</span>
        <div className="flex items-center gap-3 text-xs text-stone-600">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: DAY_COLOR }} />
            {dayLabel} <span className="font-semibold text-stone-900">{activity ? dayTotal : "–"}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: AVERAGE_COLOR }} />
            {activity?.averageDays ? `Gns. ${activity.averageDays} dage` : "Gns."}{" "}
            <span className="font-semibold text-stone-900">{hasAverage ? formatCount(averageTotal) : "–"}</span>
          </span>
          <span className="flex items-center gap-1.5" title="Møder booket — søjlen står hvor salgsopkaldet startede">
            <span className="h-2.5 w-1.5 rounded-sm" style={{ background: MEETING_COLOR }} />
            Møder <span className="font-semibold text-stone-900">{activity ? meetingTotal : "–"}</span>
          </span>
          {showGoodConversationsLegend && (
            <span className="flex items-center gap-1.5" title="Gode samtaler på 8 minutter eller mere — søjlen står hvor opkaldet startede">
              <span className="h-2.5 w-1.5 rounded-sm" style={{ background: GOOD_CONVERSATION_COLOR }} />
              Gode samtaler <span className="font-semibold text-stone-900">{activity ? goodConversationTotal : "–"}</span>
            </span>
          )}
          {benchmark && (
            <span
              className="flex items-center gap-1.5"
              title={
                benchmark.source === "personal"
                  ? `Personligt mål: dit tempo på dine ${benchmark.salesDays} bedste salgsdage (seneste 90 dage)`
                  : "Fast mål — du har endnu under 5 salgsdage i denne blok at regne dit eget mål ud fra"
              }
            >
              <span className="h-2 w-2 rounded-full" style={{ background: BENCHMARK_COLOR }} />
              {benchmark.source === "personal" ? "Dit mål" : "Mål"}{" "}
              <span className="font-semibold text-stone-900">{benchmark.target}</span>
            </span>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {error ? (
          <div className="flex h-full items-center justify-center text-xs text-red-600">{error}</div>
        ) : !activity ? (
          <div className="flex h-full items-center justify-center text-xs text-stone-400">Henter opkald…</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
              <XAxis dataKey="time" tick={{ fill: AXIS_COLOR, fontSize: 11 }} tickLine={false} axisLine={{ stroke: GRID_COLOR }} interval="preserveStartEnd" minTickGap={12} />
              <YAxis yAxisId="calls" allowDecimals={false} tick={{ fill: AXIS_COLOR, fontSize: 11 }} tickLine={false} axisLine={false} width={28} />
              <YAxis yAxisId="events" hide domain={[0, eventScaleMax]} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: "1px solid #e7e5e4", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }}
                labelFormatter={(_, payload) => `Kl. ${payload?.[0]?.payload?.range ?? ""}`}
                formatter={(value, name) => [
                  typeof value === "number" ? formatCount(value) : "–",
                  name === "day" ? dayLabel : name === "benchmark" ? "Mål" : name === "meetings" ? "Møder booket" : name === "goodConversations" ? "Gode samtaler (8+ min)" : "Gennemsnit",
                ]}
              />
              {bands.map((band) => (
                <ReferenceArea
                  key={band.start}
                  yAxisId="calls"
                  x1={hhmm(band.start)}
                  x2={hhmm(Math.max(band.start, band.end - bucket))}
                  fill={band.kind === "calling" ? "#dcfce7" : "#f5f5f4"}
                  fillOpacity={0.6}
                  ifOverflow="extendDomain"
                  label={{ value: band.label, position: "insideTop", fill: AXIS_COLOR, fontSize: 10 }}
                />
              ))}
              <Bar yAxisId="events" dataKey="goodConversations" fill={GOOD_CONVERSATION_COLOR} barSize={8} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              <Bar yAxisId="events" dataKey="meetings" fill={MEETING_COLOR} barSize={8} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              {(benchmarkPerBucket !== null || benchmarkAt) && (
                <Line yAxisId="calls" type="monotone" dataKey="benchmark" stroke={BENCHMARK_COLOR} strokeWidth={2} strokeDasharray="6 4" dot={false} activeDot={false} isAnimationActive={false} />
              )}
              {hasAverage && (
                <Line yAxisId="calls" type="monotone" dataKey="average" stroke={AVERAGE_COLOR} strokeWidth={2} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
              )}
              <Line yAxisId="calls" type="monotone" dataKey="day" stroke={DAY_COLOR} strokeWidth={2.5} dot={{ r: 2.5, fill: DAY_COLOR }} activeDot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
