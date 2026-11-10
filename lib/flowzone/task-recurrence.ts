import { addDays, addWeeks, addMonths, format, isBefore, isAfter } from 'date-fns';
import { ZoneTask, RecurrencePattern, RecurrenceType } from '@/lib/flowzone/zones';

export class TaskRecurrenceManager {
  static generateNextDueDate(currentDate: Date, pattern: RecurrencePattern): Date | null {
    const { type, interval, daysOfWeek, endDate } = pattern;

    let nextDate: Date;

    switch (type) {
      case 'daily':
        nextDate = addDays(currentDate, interval);
        break;
      
      case 'weekdays':
        nextDate = addDays(currentDate, 1);
        // Skip weekends
        while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
          nextDate = addDays(nextDate, 1);
        }
        break;
      
      case 'weekly':
        if (daysOfWeek && daysOfWeek.length > 0) {
          // Find next occurrence of specified days
          nextDate = new Date(currentDate);
          for (let i = 1; i <= 7; i++) {
            nextDate = addDays(currentDate, i);
            if (daysOfWeek.includes(nextDate.getDay())) {
              break;
            }
          }
        } else {
          nextDate = addWeeks(currentDate, interval);
        }
        break;
      
      case 'monthly':
        nextDate = addMonths(currentDate, interval);
        break;
      
      default:
        return null;
    }

    // Check if we've exceeded the end date
    if (endDate && isAfter(nextDate, endDate)) {
      return null;
    }

    return nextDate;
  }

  static generateRecurringInstances(
    baseTask: Omit<ZoneTask, 'id' | 'createdAt' | 'completed' | 'assignedZone'>,
    pattern: RecurrencePattern,
    maxDays: number = 90
  ): Omit<ZoneTask, 'id' | 'createdAt' | 'completed' | 'assignedZone'>[] {
    const instances: Omit<ZoneTask, 'id' | 'createdAt' | 'completed' | 'assignedZone'>[] = [];
    let currentDate = new Date(baseTask.deadline);
    const endGenerationDate = addDays(new Date(), maxDays);

    while (instances.length < 50) { // Prevent infinite loops
      const nextDate = this.generateNextDueDate(currentDate, pattern);
      
      if (!nextDate || isAfter(nextDate, endGenerationDate)) {
        break;
      }

      if (pattern.maxOccurrences && instances.length >= pattern.maxOccurrences - 1) {
        break;
      }

      instances.push({
        ...baseTask,
        deadline: nextDate,
        nextDueDate: this.generateNextDueDate(nextDate, pattern) ?? undefined,
        parentTaskId: baseTask.parentTaskId || 'recurring-parent'
      });

      currentDate = nextDate;
    }

    return instances;
  }

  static shouldGenerateNewInstance(task: ZoneTask): boolean {
    if (!task.isRecurring || !task.recurrencePattern) return false;
    
    // Generate new instance if completed and it's a recurring task
    return task.completed && !task.parentTaskId;
  }

  static createNextInstance(task: ZoneTask): Omit<ZoneTask, 'id' | 'createdAt' | 'completed' | 'assignedZone'> | null {
    if (!task.recurrencePattern || !task.nextDueDate) return null;

    return {
      title: task.title,
      estimatedTime: task.estimatedTime,
      priority: task.priority,
      taskType: task.taskType,
      deadline: task.nextDueDate,
      isRecurring: true,
      recurrencePattern: task.recurrencePattern,
      parentTaskId: task.parentTaskId || task.id,
      nextDueDate: this.generateNextDueDate(task.nextDueDate, task.recurrencePattern) ?? undefined
    };
  }
}
