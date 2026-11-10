/**
 * Guldlinjen i FlowZone: et personligt mål for opkald pr. ringeblok.
 *
 * Målet er det tempo, sælgeren havde på sine bedste salgsdage — ikke flest mulige opkald:
 * - Kun de seneste 90 dage før ugens mandag (målet står stille resten af ugen).
 * - Kun hverdage hvor sælgeren ringede mindst 5 gange i blokken og bookede mindst ét møde.
 * - De 10 dage med flest møder (ved lige: færrest opkald, så det effektive tempo vinder).
 * - Median af opkald i blokken på de dage, holdt mellem et gulv og et loft.
 * - Under 5 sådanne dage: det faste mål.
 *
 * Gulvet er det typiske antal opkald på holdets gode mødedage; loftet svarer til ca. 200 opkald om dagen,
 * hvor data viste at samtalerne blev kortere og møderne færre.
 */
import type { CallHistory } from "./call-activity";

export const BENCHMARK_WINDOW_DAYS = 90;
export const BENCHMARK_TOP_DAYS = 10;
export const BENCHMARK_MIN_SALES_DAYS = 5;
export const BENCHMARK_MIN_CALLS_IN_BLOCK = 5;

/** Fast mål (gulv) og loft pr. ringeblok, målt i opkald pr. blok. */
export const BENCHMARK_LIMITS: Record<string, { floor: number; ceiling: number }> = {
  "calling-1": { floor: 47, ceiling: 65 },
  "calling-2": { floor: 42, ceiling: 53 },
  "calling-3": { floor: 20, ceiling: 27 },
  /** Hele arbejdsdagen 09:00–17:00 (dagsanalysen): holdets sweet spot på 150–200 opkald om dagen. */
  workday: { floor: 150, ceiling: 200 },
};

export const WORKDAY_BLOCK: BenchmarkBlock = { id: "workday", start: 9 * 60, end: 17 * 60 };

/** Ukendt (egen) ringeblok: samme tempo pr. minut som Ringeblok 1 (10:15–12:45). */
const limitsFor = (blockId: string, minutes: number) =>
  BENCHMARK_LIMITS[blockId] ?? {
    floor: Math.round((minutes * 47) / 150),
    ceiling: Math.round((minutes * 65) / 150),
  };

export type BenchmarkBlock = { id: string; start: number; end: number };

export type BlockBenchmark = {
  /** Mål for opkald i hele blokken. */
  target: number;
  /** "personal" = ud fra egne salgsdage, "fixed" = det faste mål (for få salgsdage). */
  source: "personal" | "fixed";
  /** Antal salgsdage målet bygger på. */
  salesDays: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const parseDay = (dayKey: string) => new Date(`${dayKey}T12:00:00Z`);
const toDayKey = (d: Date) => d.toISOString().slice(0, 10);

/** Mandagen i ugen for `dayKey` (YYYY-MM-DD). */
export function weekStartKey(dayKey: string): string {
  const d = parseDay(dayKey);
  const offset = (d.getUTCDay() + 6) % 7;
  return toDayKey(new Date(d.getTime() - offset * DAY_MS));
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** De bedste salgsdage for tidsrummet: flest møder, ved lige færrest opkald (det effektive tempo vinder). */
function bestSalesDays(history: Pick<CallHistory, "bucketMinutes" | "days" | "meetings">, dayKey: string, block: BenchmarkBlock) {
  const weekStart = weekStartKey(dayKey);
  const windowStart = toDayKey(new Date(parseDay(weekStart).getTime() - BENCHMARK_WINDOW_DAYS * DAY_MS));
  const firstBucket = Math.floor(block.start / history.bucketMinutes);
  const lastBucket = Math.ceil(block.end / history.bucketMinutes);

  return Object.entries(history.days)
    .filter(([key]) => key >= windowStart && key < weekStart)
    .filter(([key]) => {
      const weekday = parseDay(key).getUTCDay();
      return weekday !== 0 && weekday !== 6;
    })
    .map(([key, buckets]) => {
      let calls = 0;
      for (let i = firstBucket; i < lastBucket; i++) calls += buckets[i] ?? 0;
      return { key, buckets, meetings: history.meetings[key] ?? 0, calls };
    })
    .filter((d) => d.meetings > 0 && d.calls >= BENCHMARK_MIN_CALLS_IN_BLOCK)
    .sort((a, b) => b.meetings - a.meetings || a.calls - b.calls)
    .slice(0, BENCHMARK_TOP_DAYS);
}

export function benchmarkForBlock(
  history: Pick<CallHistory, "bucketMinutes" | "days" | "meetings">,
  dayKey: string,
  block: BenchmarkBlock,
): BlockBenchmark {
  const { floor, ceiling } = limitsFor(block.id, block.end - block.start);
  const salesDays = bestSalesDays(history, dayKey, block);

  if (salesDays.length < BENCHMARK_MIN_SALES_DAYS) {
    return { target: floor, source: "fixed", salesDays: salesDays.length };
  }
  const target = Math.round(Math.min(Math.max(median(salesDays.map((d) => d.calls)), floor), ceiling));
  return { target, source: "personal", salesDays: salesDays.length };
}

/**
 * Målet for tidsrummet fordelt på kvarterer efter dagens rytme, så guldlinjen følger dagen
 * (fx lavere i pauser og højere hvor man plejer at ringe mest) i stedet for at være flad.
 * Rytmen tages fra de bedste salgsdage; har sælgeren for få, bruges `fallbackProfile`
 * (fx eget gennemsnit), og ellers fordeles målet jævnt. Summen af kvartererne er altid målet.
 */
export function benchmarkCurve(
  history: Pick<CallHistory, "bucketMinutes" | "days" | "meetings">,
  dayKey: string,
  block: BenchmarkBlock,
  fallbackProfile?: number[],
): { benchmark: BlockBenchmark; perBucket: Map<number, number> } {
  const benchmark = benchmarkForBlock(history, dayKey, block);
  const bucket = history.bucketMinutes;
  const indexes: number[] = [];
  for (let i = Math.floor(block.start / bucket); i < Math.ceil(block.end / bucket); i++) indexes.push(i);

  const salesDays = benchmark.source === "personal" ? bestSalesDays(history, dayKey, block) : [];
  const weights = indexes.map((i) =>
    salesDays.length
      ? salesDays.reduce((sum, d) => sum + (d.buckets[i] ?? 0), 0)
      : fallbackProfile?.[i] ?? 0,
  );
  const total = weights.reduce((a, b) => a + b, 0);

  const perBucket = new Map<number, number>();
  indexes.forEach((i, n) => {
    const share = total > 0 ? weights[n] / total : 1 / indexes.length;
    perBucket.set(i, Math.round(benchmark.target * share * 10) / 10);
  });
  return { benchmark, perBucket };
}
