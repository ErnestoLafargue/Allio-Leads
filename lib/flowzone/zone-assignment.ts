import { ZoneTask, TimeZone, TaskType, Priority } from '@/lib/flowzone/zones';
import { zoneManager, parseTimeSlot, isWeekendDay } from './zone-manager';
import { ZoneAssignmentResult, createSingleZoneResult } from './zone-assignment-result';

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

/** Hvor mange dage frem planlæggeren leder efter plads. */
const MAX_PLANNING_DAYS = 120;

const startOfDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const dayKey = (date: Date): string => {
  const d = startOfDay(date);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};


const deadlineDay = (task: ZoneTask): number =>
  task.deadline ? startOfDay(new Date(task.deadline)).getTime() : Number.POSITIVE_INFINITY;

/** Rækkefølge for planlægning: tidligste deadline-dag først, derefter prioritet, derefter oprettelse. */
export const compareZoneTasks = (a: ZoneTask, b: ZoneTask): number =>
  deadlineDay(a) - deadlineDay(b) ||
  PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
  new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();

export interface TaskPlacement {
  zoneId: string;
  date: Date;
}

/**
 * Planlægger alle åbne opgaver frem i tiden fra nu.
 * Opgaverne tages i rækkefølge (deadline, prioritet, oprettelse), og hver opgave
 * lægges i den første zone — i dag eller senere hverdage — der passer til typen og har plads.
 * Zoner der allerede er slut i dag springes over. Weekender planlægges ikke.
 */
export class ZoneAssigner {
  private zones: TimeZone[];
  private now: Date;
  private schedule = new Map<string, ZoneTask[]>(); // `${dayKey}|${zoneId}` → opgaver
  private placements = new Map<string, TaskPlacement>(); // task.id → placering
  private tasks: ZoneTask[];
  private fixedTasks: ZoneTask[]; // møder og manuelt placerede opgaver med fast tidspunkt

  constructor(existingTasks: ZoneTask[] = [], now: Date = new Date()) {
    this.zones = [...zoneManager.getZones()].sort(
      (a, b) => parseTimeSlot(a.timeSlot).start - parseTimeSlot(b.timeSlot).start
    );
    this.now = now;
    this.tasks = existingTasks;
    this.fixedTasks = existingTasks.filter(task => !task.completed && task.scheduleOverride);
    existingTasks
      .filter(task => !task.completed && !task.scheduleOverride && !task.isOverwriteSchedule)
      .sort(compareZoneTasks)
      .forEach(task => this.place(task));
  }

  private place(task: ZoneTask): TaskPlacement {
    const zoneIds = this.getCompatibleZoneIds(task.taskType);
    const nowMinutes = this.now.getHours() * 60 + this.now.getMinutes();
    let firstEmpty: TaskPlacement | null = null;

    for (let offset = 0; offset < MAX_PLANNING_DAYS; offset++) {
      const date = startOfDay(this.now);
      date.setDate(date.getDate() + offset);
      if (isWeekendDay(date)) continue;

      for (const zoneId of zoneIds) {
        const zone = this.zones.find(z => z.id === zoneId)!;
        const slot = parseTimeSlot(zone.timeSlot);
        if (offset === 0 && slot.end <= nowMinutes) continue;
        // En zone der er i gang i dag har kun resten af tiden tilbage, og møder optager tid i zonen.
        const from = offset === 0 ? Math.max(slot.start, nowMinutes) : slot.start;
        const capacity = Math.min(zone.capacity, slot.end - from) - this.getFixedMinutes(date, from, slot.end);

        const used = this.getUsedMinutes(zoneId, date);
        if (!firstEmpty && used === 0) firstEmpty = { zoneId, date };
        if (used + task.estimatedTime <= capacity) {
          return this.commit(task, { zoneId, date });
        }
      }
    }

    // Opgaven er længere end nogen zone: læg den i den første tomme zone, så den vises som overbooket.
    return this.commit(task, firstEmpty ?? { zoneId: zoneIds[zoneIds.length - 1], date: startOfDay(this.now) });
  }

  private commit(task: ZoneTask, placement: TaskPlacement): TaskPlacement {
    const key = `${dayKey(placement.date)}|${placement.zoneId}`;
    this.schedule.set(key, [...(this.schedule.get(key) ?? []), task]);
    this.placements.set(task.id, placement);

    const zone = this.zones.find(z => z.id === placement.zoneId);
    task.assignedZone = placement.zoneId;
    if (zone) {
      const start = parseTimeSlot(zone.timeSlot).start;
      const scheduled = new Date(placement.date);
      scheduled.setHours(Math.floor(start / 60), start % 60, 0, 0);
      task.scheduledTime = scheduled;
    }
    return placement;
  }

  /** Zoner der må tage opgavetypen, i tidsrækkefølge. */
  private getCompatibleZoneIds(taskType: TaskType): string[] {
    const assignable = this.zones.filter(zone => !zone.isBreakZone);
    const preferred = assignable.filter(zone => zone.preferredTaskTypes.includes(taskType)).map(z => z.id);
    if (preferred.length > 0) return preferred;
    const flex = assignable.find(z => z.id === 'flex-work') ?? assignable[assignable.length - 1];
    return flex ? [flex.id] : [];
  }

  /** Minutter i tidsrummet [from, to) på dagen, der er optaget af møder og manuelt placerede opgaver. */
  private getFixedMinutes(date: Date, from: number, to: number): number {
    return this.fixedTasks.reduce((sum, task) => {
      const start = new Date(task.scheduleOverride!.startTime);
      const end = new Date(task.scheduleOverride!.endTime);
      if (dayKey(start) !== dayKey(date)) return sum;
      const buffer = task.travelBufferMinutes ?? 0; // transport optager også tiden
      const s = start.getHours() * 60 + start.getMinutes() - buffer;
      const e = end.getHours() * 60 + end.getMinutes() + buffer;
      return sum + Math.max(0, Math.min(e, to) - Math.max(s, from));
    }, 0);
  }

  private getUsedMinutes(zoneId: string, date: Date): number {
    return (this.schedule.get(`${dayKey(date)}|${zoneId}`) ?? []).reduce((sum, t) => sum + t.estimatedTime, 0);
  }

  /** Fortæller hvor en ny opgave havner, når hele planen lægges om med den. Ændrer ikke de eksisterende opgaver. */
  assignTaskToZone(task: ZoneTask): ZoneAssignmentResult {
    if (task.scheduleOverride) return createSingleZoneResult('');
    const preview = new ZoneAssigner([...this.tasks.map(t => ({ ...t })), { ...task }], this.now);
    const placement = preview.getPlacement(task.id);
    if (!placement) return createSingleZoneResult('flex-work');
    return { ...createSingleZoneResult(placement.zoneId), scheduledDate: placement.date };
  }

  assignTaskToZoneSimple(task: ZoneTask): string {
    return this.assignTaskToZone(task).assignedZone || 'flex-work';
  }

  /**
   * Opgaver til en weekenddag, hvor man har stemplet ind: de øverste fra planen,
   * uden ringeopgaver (vi ringer ikke i weekenden) og uden møder.
   */
  getWeekendTasks(): ZoneTask[] {
    return this.tasks
      .filter(task => !task.completed && !task.scheduleOverride && !task.isOverwriteSchedule && task.taskType !== 'deep-work')
      .sort(compareZoneTasks);
  }

  getPlacement(taskId: string): TaskPlacement | undefined {
    return this.placements.get(taskId);
  }

  /** Opgaver i zonen på dagen (standard: i dag), i planlagt rækkefølge. */
  getZoneTasks(zoneId: string, date: Date = this.now): ZoneTask[] {
    return this.schedule.get(`${dayKey(date)}|${zoneId}`) ?? [];
  }

  getZoneUtilization(zoneId: string, date: Date = this.now): number {
    const zone = this.zones.find(z => z.id === zoneId);
    if (!zone || zone.isBreakZone) return 0;
    const slot = parseTimeSlot(zone.timeSlot);
    return ((this.getUsedMinutes(zoneId, date) + this.getFixedMinutes(date, slot.start, slot.end)) / zone.capacity) * 100;
  }
}
