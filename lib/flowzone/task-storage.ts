import type { ZoneTask } from "./zones";

/**
 * FlowZone-opgaver gemmes i databasen pr. bruger, så en admin kan se andres FlowZone.
 * Før det lå de i browseren; dem flytter `takeLegacyTasks` med over første gang.
 */
const LEGACY_STORAGE_KEY = "flowzone-tasks";

const toDate = (value: unknown): Date | undefined => (value ? new Date(value as string) : undefined);

function revive(raw: ZoneTask): ZoneTask {
  return {
    ...raw,
    deadline: new Date(raw.deadline),
    createdAt: new Date(raw.createdAt),
    scheduledTime: toDate(raw.scheduledTime),
    nextDueDate: toDate(raw.nextDueDate),
    overwriteDate: toDate(raw.overwriteDate),
    recurrencePattern: raw.recurrencePattern
      ? { ...raw.recurrencePattern, endDate: toDate(raw.recurrencePattern.endDate) }
      : undefined,
    scheduleOverride: raw.scheduleOverride
      ? {
          ...raw.scheduleOverride,
          startTime: new Date(raw.scheduleOverride.startTime),
          endTime: new Date(raw.scheduleOverride.endTime),
        }
      : undefined,
  };
}

const tasksUrl = (userId: string) => `/api/flowzone/tasks?userId=${encodeURIComponent(userId)}`;

export async function fetchTasks(userId: string): Promise<ZoneTask[]> {
  const res = await fetch(tasksUrl(userId), { cache: "no-store" });
  if (!res.ok) throw new Error("Kunne ikke hente opgaver");
  const { tasks } = (await res.json()) as { tasks: ZoneTask[] };
  return tasks.map(revive);
}

/** Sender kun ændrede og slettede opgaver. */
export async function saveTaskChanges(userId: string, upserts: ZoneTask[], deletes: string[]): Promise<void> {
  const res = await fetch(tasksUrl(userId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ upserts, deletes }),
  });
  if (!res.ok) throw new Error("Kunne ikke gemme opgaver");
}

/** Opgaver der stadig ligger i browseren fra før databasen. De fjernes når de er hentet. */
export function takeLegacyTasks(): ZoneTask[] {
  try {
    const saved = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    return saved ? (JSON.parse(saved) as ZoneTask[]).map(revive) : [];
  } catch {
    return [];
  }
}

export function clearLegacyTasks(): void {
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Blokeret lagring: intet at rydde.
  }
}
