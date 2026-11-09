import { TimeZone, DAILY_ZONES } from '@/lib/flowzone/zones';

export interface CustomZoneSettings {
  zones: TimeZone[];
  lastModified: number;
}

class ZoneManager {
  private static STORAGE_KEY = 'customZoneSettings';
  private customSettings: CustomZoneSettings | null = null;

  constructor() {
    this.loadSettings();
  }

  private loadSettings(): void {
    const saved = localStorage.getItem(ZoneManager.STORAGE_KEY);
    if (saved) {
      try {
        this.customSettings = JSON.parse(saved);
      } catch (error) {
        console.warn('Failed to load custom zone settings:', error);
        this.customSettings = null;
      }
    }
  }

  private saveSettings(): void {
    if (this.customSettings) {
      localStorage.setItem(ZoneManager.STORAGE_KEY, JSON.stringify(this.customSettings));
    }
  }

  getZones(): TimeZone[] {
    return this.customSettings?.zones || DAILY_ZONES;
  }

  updateZones(zones: TimeZone[]): void {
    this.customSettings = {
      zones: zones,
      lastModified: Date.now()
    };
    this.saveSettings();
  }

  updateZone(zoneId: string, updates: Partial<TimeZone>): boolean {
    const zones = this.getZones();
    const zoneIndex = zones.findIndex(z => z.id === zoneId);
    
    if (zoneIndex === -1) return false;

    const updatedZones = [...zones];
    updatedZones[zoneIndex] = { ...updatedZones[zoneIndex], ...updates };
    
    this.updateZones(updatedZones);
    return true;
  }

  addZone(zone: TimeZone): void {
    const zones = [...this.getZones(), zone];
    this.updateZones(zones);
  }

  removeZone(zoneId: string): boolean {
    const zones = this.getZones();
    const filteredZones = zones.filter(z => z.id !== zoneId);
    
    if (filteredZones.length === zones.length) return false;
    
    this.updateZones(filteredZones);
    return true;
  }

  reorderZones(fromIndex: number, toIndex: number): void {
    const zones = [...this.getZones()];
    const [moved] = zones.splice(fromIndex, 1);
    zones.splice(toIndex, 0, moved);
    this.updateZones(zones);
  }

  resetToDefaults(): void {
    this.customSettings = null;
    localStorage.removeItem(ZoneManager.STORAGE_KEY);
  }

  hasCustomZones(): boolean {
    return this.customSettings !== null;
  }

  exportSettings(): string {
    return JSON.stringify(this.customSettings || { zones: DAILY_ZONES, lastModified: Date.now() }, null, 2);
  }

  importSettings(settingsJson: string): boolean {
    try {
      const settings = JSON.parse(settingsJson);
      if (settings.zones && Array.isArray(settings.zones)) {
        this.customSettings = settings;
        this.saveSettings();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to import settings:', error);
      return false;
    }
  }

  validateZoneTime(timeSlot: string): boolean {
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])\s*-\s*([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;
    return timeRegex.test(timeSlot);
  }

  checkTimeOverlaps(zones: TimeZone[]): string[] {
    const conflicts: string[] = [];
    
    for (let i = 0; i < zones.length; i++) {
      for (let j = i + 1; j < zones.length; j++) {
        const zone1 = zones[i];
        const zone2 = zones[j];
        
        if (this.zonesOverlap(zone1.timeSlot, zone2.timeSlot)) {
          conflicts.push(`${zone1.name} overlapper med ${zone2.name}`);
        }
      }
    }
    
    return conflicts;
  }

  private zonesOverlap(timeSlot1: string, timeSlot2: string): boolean {
    const parseTime = (slot: string) => {
      const [start, end] = slot.split(' - ');
      const parseTimeStr = (timeStr: string) => {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
      };
      return {
        start: parseTimeStr(start),
        end: parseTimeStr(end)
      };
    };

    const time1 = parseTime(timeSlot1);
    const time2 = parseTime(timeSlot2);

    return !(time1.end <= time2.start || time2.end <= time1.start);
  }
}

export const zoneManager = new ZoneManager();

/** Lørdag eller søndag. */
export const isWeekendDay = (date: Date): boolean => date.getDay() === 0 || date.getDay() === 6;

/** Minutter efter midnat for start og slut af en zone ("9:15 - 10:00"). */
export const parseTimeSlot = (slot: string): { start: number; end: number } => {
  const [start, end] = slot.split(' - ').map(t => {
    const [h, m] = t.trim().split(':').map(Number);
    return h * 60 + m;
  });
  return { start, end };
};

/** Zonen der er aktiv på tidspunktet, ud fra zonernes tidsrum. */
export const getZoneIdAt = (date: Date = new Date()): string | null => {
  if (isWeekendDay(date)) return null; // weekenden har ingen zoner
  const now = date.getHours() * 60 + date.getMinutes();
  const zone = zoneManager.getZones().find(z => {
    const { start, end } = parseTimeSlot(z.timeSlot);
    return now >= start && now < end;
  });
  return zone?.id ?? null;
};

/** Zonernes id'er i tidsrækkefølge. */
export const getZoneOrder = (): string[] =>
  [...zoneManager.getZones()]
    .sort((a, b) => parseTimeSlot(a.timeSlot).start - parseTimeSlot(b.timeSlot).start)
    .map(z => z.id);

/** Om zonen er slut på tidspunktet. */
export const isZonePast = (zone: TimeZone, date: Date = new Date()): boolean =>
  date.getHours() * 60 + date.getMinutes() >= parseTimeSlot(zone.timeSlot).end;
