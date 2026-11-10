import { TimeZone, ZoneTask } from '@/lib/flowzone/zones';
import { parseTimeSlot } from './zone-manager';

/** Placering i procent af zonens højde. */
export interface ZoneArea {
  top: number;
  height: number;
}

export interface FixedTaskBlock extends ZoneArea {
  task: ZoneTask;
  kind: 'meeting' | 'transport-before' | 'transport-after';
  /** Klokkeslæt for blokkens del, fx "09:00–10:00". */
  time: string;
}

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Mødets egne minutter (uden transport). */
export const fixedMinutes = (task: ZoneTask): { start: number; end: number } | null => {
  if (task.scheduleOverride?.startTime && task.scheduleOverride?.endTime) {
    const start = new Date(task.scheduleOverride.startTime);
    const end = new Date(task.scheduleOverride.endTime);
    return { start: start.getHours() * 60 + start.getMinutes(), end: end.getHours() * 60 + end.getMinutes() };
  }
  if (task.overwriteStartHour !== undefined && task.overwriteEndHour !== undefined) {
    return { start: task.overwriteStartHour * 60, end: task.overwriteEndHour * 60 };
  }
  return null;
};

/**
 * Deler en zone op i tid: hvert møde (eller manuelt placeret opgave) får kun sin egen del af zonen,
 * og zonens almindelige indhold vises i det største ledige stykke.
 */
export const getZoneLayout = (zone: TimeZone, fixedTasks: ZoneTask[]): { blocks: FixedTaskBlock[]; freeArea: ZoneArea | null } => {
  const slot = parseTimeSlot(zone.timeSlot);
  const length = slot.end - slot.start;
  const toPercent = (minutes: number) => ((minutes - slot.start) / length) * 100;

  const ranges = fixedTasks
    .flatMap(task => {
      const range = fixedMinutes(task);
      if (!range) return [];
      const buffer = task.travelBufferMinutes ?? 0;
      const parts: { task: ZoneTask; kind: FixedTaskBlock['kind']; start: number; end: number }[] = [
        { task, kind: 'meeting', start: range.start, end: range.end },
      ];
      if (buffer > 0) {
        parts.push({ task, kind: 'transport-before', start: range.start - buffer, end: range.start });
        parts.push({ task, kind: 'transport-after', start: range.end, end: range.end + buffer });
      }
      return parts;
    })
    .map(r => ({ ...r, time: `${hhmm(r.start)}–${hhmm(r.end)}`, start: Math.max(r.start, slot.start), end: Math.min(r.end, slot.end) }))
    .filter(r => r.end > r.start)
    .sort((a, b) => a.start - b.start);

  const blocks = ranges.map(r => ({
    task: r.task,
    kind: r.kind,
    time: r.time,
    top: toPercent(r.start),
    height: toPercent(r.end) - toPercent(r.start),
  }));

  // Største stykke af zonen uden møder
  let best: { start: number; end: number } | null = null;
  let cursor = slot.start;
  for (const r of [...ranges, { start: slot.end, end: slot.end }]) {
    if (r.start > cursor && (!best || r.start - cursor > best.end - best.start)) best = { start: cursor, end: r.start };
    cursor = Math.max(cursor, r.end);
  }

  return {
    blocks,
    freeArea: best ? { top: toPercent(best.start), height: toPercent(best.end) - toPercent(best.start) } : null,
  };
};


/** "10:00–11:00" for et møde eller en manuelt placeret opgave. */
export const formatFixedTime = (task: ZoneTask): string => {
  const range = fixedMinutes(task);
  return range ? `${hhmm(range.start)}–${hhmm(range.end)}` : '';
};

export const getFixedTaskLabel = (task: ZoneTask): string =>
  task.taskType === 'online-meeting' ? 'Online møde' : task.taskType === 'physical-meeting' ? 'Fysisk møde' : 'Manuel tidsplacering';
