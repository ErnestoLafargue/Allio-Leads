import { ZoneTask } from '@/lib/flowzone/zones';

export interface ZoneAssignmentResult {
  isMultiZone: boolean;
  assignedZone?: string;
  taskSegments?: ZoneTask[];
  previewText?: string;
  scheduledDate?: Date;
}

export function createSingleZoneResult(zoneId: string): ZoneAssignmentResult {
  return {
    isMultiZone: false,
    assignedZone: zoneId
  };
}

export function createMultiZoneResult(taskSegments: ZoneTask[], previewText: string): ZoneAssignmentResult {
  return {
    isMultiZone: true,
    taskSegments,
    previewText
  };
}