import { ZoneTask } from '@/lib/flowzone/zones';

/** Tidsrum i millisekunder, [start, end). */
export interface TimeBlock {
  start: number;
  end: number;
}

export interface FixedIntervals {
  body: TimeBlock;
  transports: TimeBlock[];
}

const MINUTE = 60 * 1000;

/** Møde (eller manuelt placeret opgave) + transport før og efter. */
export const getFixedIntervals = (task: Pick<ZoneTask, 'scheduleOverride' | 'travelBufferMinutes'>): FixedIntervals | null => {
  if (!task.scheduleOverride?.startTime || !task.scheduleOverride?.endTime) return null;
  const start = new Date(task.scheduleOverride.startTime).getTime();
  const end = new Date(task.scheduleOverride.endTime).getTime();
  const buffer = (task.travelBufferMinutes ?? 0) * MINUTE;
  return {
    body: { start, end },
    transports: buffer > 0 ? [{ start: start - buffer, end: start }, { start: end, end: end + buffer }] : [],
  };
};

const overlaps = (a: TimeBlock, b: TimeBlock) => a.start < b.end && a.end > b.start;

export interface MeetingConflict {
  task: ZoneTask;
  /** 'meeting' = mødet rammer den anden opgave/transport; 'transport' = vores transport rammer et andet møde. */
  reason: 'meeting' | 'transport';
}

/**
 * Samme regel som Allio-Leads (canBookMeetingAt):
 * - Mødet må ikke overlappe andres møde eller transport.
 * - Egen transport må ikke overlappe andres møde. Transport må gerne overlappe transport.
 */
export const findMeetingConflicts = (
  candidate: Pick<ZoneTask, 'scheduleOverride' | 'travelBufferMinutes'>,
  existingTasks: ZoneTask[],
  ignoreTaskId?: string,
): MeetingConflict[] => {
  const mine = getFixedIntervals(candidate);
  if (!mine) return [];
  const conflicts: MeetingConflict[] = [];
  for (const task of existingTasks) {
    if (task.completed || task.id === ignoreTaskId) continue;
    const other = getFixedIntervals(task);
    if (!other) continue;
    if ([other.body, ...other.transports].some(b => overlaps(mine.body, b))) {
      conflicts.push({ task, reason: 'meeting' });
    } else if (mine.transports.some(t => overlaps(t, other.body))) {
      conflicts.push({ task, reason: 'transport' });
    }
  }
  return conflicts;
};

/** Optagede tidsrum på en dag (møde + transport), sorteret. Bruges til at vise hvad der er optaget. */
export const getBusyBlocksForDay = (tasks: ZoneTask[], day: Date, ignoreTaskId?: string) => {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const dayEnd = dayStart + 24 * 60 * MINUTE;
  return tasks
    .filter(task => !task.completed && task.id !== ignoreTaskId)
    .map(task => ({ task, intervals: getFixedIntervals(task) }))
    .filter((x): x is { task: ZoneTask; intervals: FixedIntervals } => x.intervals !== null)
    .map(({ task, intervals }) => ({
      task,
      start: Math.min(intervals.body.start, ...intervals.transports.map(t => t.start)),
      end: Math.max(intervals.body.end, ...intervals.transports.map(t => t.end)),
    }))
    .filter(b => b.start < dayEnd && b.end > dayStart)
    .sort((a, b) => a.start - b.start);
};
