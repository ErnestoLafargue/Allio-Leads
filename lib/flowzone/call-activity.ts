/**
 * FlowZone: opkald pr. 15 minutter for én sælger — valgt dag og gennemsnit af de seneste aktive ringedage.
 * Et opkald = ét opkaldsforsøg (LeadActivityEvent CALL_ATTEMPT), også uden svar.
 */

export const CALL_BUCKET_MINUTES = 15;
export const CALL_BUCKETS_PER_DAY = (24 * 60) / CALL_BUCKET_MINUTES;
/** Gennemsnittet regnes over så mange af de seneste dage, hvor sælgeren ringede. */
export const AVERAGE_ACTIVE_DAYS = 10;
/** En "god samtale" varer mindst så længe. */
export const GOOD_CONVERSATION_SECONDS = 8 * 60;

export type CallActivity = {
  dayKey: string;
  bucketMinutes: number;
  /** Opkald pr. kvarter på den valgte dag (96 kvarterer fra 00:00, dansk tid). */
  day: number[];
  /** Gennemsnitlige opkald pr. kvarter over `averageDays` aktive ringedage før den valgte dag. */
  average: number[];
  /** Møder pr. kvarter på den valgte dag, placeret dér hvor opkaldet der gav mødet startede. */
  meetings: number[];
  /** Gode samtaler (8+ min) pr. kvarter på den valgte dag, placeret dér hvor opkaldet startede. */
  goodConversations: number[];
  averageDays: number;
};

const COPENHAGEN_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Copenhagen",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Dansk dag (YYYY-MM-DD) og kvarter-indeks for et tidspunkt. */
export function copenhagenDayAndBucket(at: Date): { dayKey: string; bucket: number } {
  const parts = Object.fromEntries(COPENHAGEN_PARTS.formatToParts(at).map((p) => [p.type, p.value]));
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return {
    dayKey: `${parts.year}-${parts.month}-${parts.day}`,
    bucket: Math.floor(minutes / CALL_BUCKET_MINUTES),
  };
}

const emptyDay = () => new Array<number>(CALL_BUCKETS_PER_DAY).fill(0);

/** Opkald pr. kvarter pr. dag. Kun dage og kvarterer med opkald er med, så den er lille at sende. */
export type CallHistory = {
  bucketMinutes: number;
  /** dayKey (YYYY-MM-DD, dansk tid) → kvarter-indeks → antal opkald */
  days: Record<string, Record<number, number>>;
  /** dayKey → antal møder sælgeren bookede den dag (bruges til den personlige benchmark). */
  meetings: Record<string, number>;
  /** dayKey → kvarter-indeks → møder, placeret ved starten af det opkald der gav mødet. */
  meetingBuckets: Record<string, Record<number, number>>;
  /** dayKey → kvarter-indeks → gode samtaler (8+ min), placeret ved opkaldets start. */
  goodConversationBuckets: Record<string, Record<number, number>>;
};

/** `meetingTimes`: hvornår opkaldet der endte med et møde startede (eller hvornår mødet blev booket). */
export function buildCallHistory(callTimes: Date[], meetingTimes: Date[] = [], goodConversationTimes: Date[] = []): CallHistory {
  const days: CallHistory["days"] = {};
  const meetings: CallHistory["meetings"] = {};
  const meetingBuckets: CallHistory["meetingBuckets"] = {};
  const goodConversationBuckets: CallHistory["goodConversationBuckets"] = {};
  for (const at of goodConversationTimes) {
    const { dayKey, bucket } = copenhagenDayAndBucket(at);
    const day = (goodConversationBuckets[dayKey] ??= {});
    day[bucket] = (day[bucket] ?? 0) + 1;
  }
  for (const at of meetingTimes) {
    const { dayKey, bucket } = copenhagenDayAndBucket(at);
    meetings[dayKey] = (meetings[dayKey] ?? 0) + 1;
    const day = (meetingBuckets[dayKey] ??= {});
    day[bucket] = (day[bucket] ?? 0) + 1;
  }
  for (const at of callTimes) {
    const { dayKey, bucket } = copenhagenDayAndBucket(at);
    const day = (days[dayKey] ??= {});
    day[bucket] = (day[bucket] ?? 0) + 1;
  }
  return { bucketMinutes: CALL_BUCKET_MINUTES, days, meetings, meetingBuckets, goodConversationBuckets };
}

const toBuckets = (day: Record<number, number> | undefined) => {
  const buckets = emptyDay();
  for (const [bucket, count] of Object.entries(day ?? {})) buckets[Number(bucket)] = count;
  return buckets;
};

/**
 * Dagens opkald pr. kvarter og gennemsnittet over de seneste `AVERAGE_ACTIVE_DAYS` dage før `dayKey`
 * med mindst ét opkald, så fridage og sygedage ikke trækker ned.
 */
export function callActivityForDay(history: CallHistory, dayKey: string): CallActivity {
  const previousDays = Object.keys(history.days)
    .filter((key) => key < dayKey)
    .sort()
    .reverse()
    .slice(0, AVERAGE_ACTIVE_DAYS);

  const average = emptyDay();
  for (const key of previousDays) {
    toBuckets(history.days[key]).forEach((count, i) => (average[i] += count));
  }
  if (previousDays.length > 0) {
    for (let i = 0; i < average.length; i++) {
      average[i] = Math.round((average[i] / previousDays.length) * 10) / 10;
    }
  }

  return {
    dayKey,
    bucketMinutes: history.bucketMinutes,
    day: toBuckets(history.days[dayKey]),
    average,
    averageDays: previousDays.length,
    meetings: toBuckets(history.meetingBuckets?.[dayKey]),
    goodConversations: toBuckets(history.goodConversationBuckets?.[dayKey]),
  };
}

export function buildCallActivity(dayKey: string, callTimes: Date[]): CallActivity {
  return callActivityForDay(buildCallHistory(callTimes), dayKey);
}
