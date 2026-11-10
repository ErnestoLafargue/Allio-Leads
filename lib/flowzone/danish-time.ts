import { format, toZonedTime, fromZonedTime } from 'date-fns-tz';
import { addDays, addWeeks, addMonths, isBefore, isAfter } from 'date-fns';
import { da } from 'date-fns/locale';

const DANISH_TIMEZONE = 'Europe/Copenhagen';

export class DanishTimeManager {
  static getDanishTime(): Date {
    return toZonedTime(new Date(), DANISH_TIMEZONE);
  }

  static toDanishTime(date: Date): Date {
    return toZonedTime(date, DANISH_TIMEZONE);
  }

  static fromDanishTime(date: Date): Date {
    return fromZonedTime(date, DANISH_TIMEZONE);
  }

  static formatDanishTime(date: Date, formatString: string = 'HH:mm'): string {
    return format(toZonedTime(date, DANISH_TIMEZONE), formatString, { 
      timeZone: DANISH_TIMEZONE,
      locale: da
    });
  }

  static getDanishHours(date?: Date): number {
    const danishTime = date ? this.toDanishTime(date) : this.getDanishTime();
    return parseInt(this.formatDanishTime(danishTime, 'H'));
  }

  static getDanishMinutes(date?: Date): number {
    const danishTime = date ? this.toDanishTime(date) : this.getDanishTime();
    return parseInt(this.formatDanishTime(danishTime, 'm'));
  }

  static getDanishSeconds(date?: Date): number {
    const danishTime = date ? this.toDanishTime(date) : this.getDanishTime();
    return parseInt(this.formatDanishTime(danishTime, 's'));
  }

  static getDanishTotalMinutes(date?: Date): number {
    const danishTime = date ? this.toDanishTime(date) : this.getDanishTime();
    const hours = parseInt(this.formatDanishTime(danishTime, 'H'));
    const minutes = parseInt(this.formatDanishTime(danishTime, 'm'));
    return hours * 60 + minutes;
  }

  static isDanishSameDay(date1: Date, date2: Date): boolean {
    const danish1 = this.toDanishTime(date1);
    const danish2 = this.toDanishTime(date2);
    return danish1.toDateString() === danish2.toDateString();
  }

  static getDanishDateString(date: Date): string {
    return this.formatDanishTime(date, 'yyyy-MM-dd');
  }

  static getTimezoneDisplay(): string {
    const now = this.getDanishTime();
    const offset = parseInt(this.formatDanishTime(now, 'xxx'));
    return offset === 1 ? 'CET' : 'CEST';
  }
}
