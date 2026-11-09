export interface TimeZone {
  id: string;
  name: string;
  timeSlot: string;
  capacity: number; // minutes
  color: string;
  description: string;
  preferredTaskTypes: TaskType[];
  isBreakZone?: boolean; // Non-assignable break zones
}

export type TaskType = 
  | 'deep-work'
  | 'internal-meeting'
  | 'external-meeting' 
  | 'admin'
  | 'quick-wins'
  | 'flex'
  | 'free-work'
  | 'online-meeting'
  | 'physical-meeting';

/** Møder har fast dato og tidspunkt i stedet for estimeret tid, prioritet og deadline. */
export const MEETING_TASK_TYPES: TaskType[] = ['online-meeting', 'physical-meeting'];
export const isMeetingType = (type: TaskType): boolean => MEETING_TASK_TYPES.includes(type);

/** Samme standarder som Allio-Leads (lib/booking/meeting-type-buffers.ts). */
export const ONLINE_MEETING_DURATION_MIN = 60;
export const PHYSICAL_MEETING_DURATION_MIN = 90;
export const PHYSICAL_TRANSPORT_BUFFER_MIN = 60;

export type Priority = 'high' | 'medium' | 'low';

export type EstimatedTime = 15 | 30 | 45 | 60 | 90 | 120 | 180 | 240 | 480;

export type RecurrenceType = 'daily' | 'weekly' | 'monthly' | 'weekdays';

export interface RecurrencePattern {
  type: RecurrenceType;
  interval: number; // every X days/weeks/months
  daysOfWeek?: number[]; // 0-6, Sunday = 0
  endDate?: Date;
  maxOccurrences?: number;
}

export interface ZoneTask {
  id: string;
  title: string;
  estimatedTime: EstimatedTime;
  priority: Priority;
  taskType: TaskType;
  deadline: Date;
  assignedZone?: string;
  scheduledTime?: Date;
  completed: boolean;
  createdAt: Date;
  isRecurring: boolean;
  recurrencePattern?: RecurrencePattern;
  parentTaskId?: string; // for generated instances
  nextDueDate?: Date;
  scheduleOverride?: {
    startTime: Date;
    endTime: Date;
    overrideBreaks?: boolean;
  };
  customPriorityOrder?: number; // For manual drag-and-drop ordering
  
  // Multi-zone task support
  isMultiZone?: boolean;
  multiZoneTaskId?: string; // Links segments of the same task
  segmentIndex?: number; // Which segment this is (0, 1, 2...)
  totalSegments?: number; // Total number of segments
  originalEstimatedTime?: EstimatedTime; // Original task duration before splitting
  segmentDuration?: number; // Duration of this specific segment
  
  // Comments system
  comments?: string[];

  /** Transport før start og efter slut (minutter). Kun fysiske møder. */
  travelBufferMinutes?: number;
  
  // Legacy schedule override properties (for backward compatibility)
  isOverwriteSchedule?: boolean;
  overwriteDate?: Date;
  overwriteStartHour?: number;
  overwriteEndHour?: number;
  overrideBreaks?: boolean;
}

export const DAILY_ZONES: TimeZone[] = [
  {
    id: 'arrival-setup',
    name: 'Ankomst & opstart',
    timeSlot: '9:00 - 9:15',
    capacity: 15,
    color: 'bg-green-100 border-green-300 text-green-800',
    description: 'Mød op og få en kop kaffe',
    preferredTaskTypes: []
  },
  {
    id: 'customer-delivery',
    name: 'Levering til kunder',
    timeSlot: '9:15 - 10:00',
    capacity: 45,
    color: 'bg-blue-100 border-blue-300 text-blue-800',
    description: 'Leverancer og opgaver for kunder',
    preferredTaskTypes: ['external-meeting']
  },
  {
    id: 'microbreak-1',
    name: 'Mikropause',
    timeSlot: '10:00 - 10:15',
    capacity: 15,
    color: 'bg-gray-100 border-gray-300 text-gray-800',
    description: 'Kort pause og omstilling',
    preferredTaskTypes: [],
    isBreakZone: true
  },
  {
    id: 'calling-1',
    name: 'Ringeblok 1',
    timeSlot: '10:15 - 12:45',
    capacity: 150,
    color: 'bg-green-100 border-green-300 text-green-800',
    description: 'Opkald til leads',
    preferredTaskTypes: ['deep-work']
  },
  {
    id: 'lunch-break',
    name: 'Frokostpause',
    timeSlot: '12:45 - 13:15',
    capacity: 30,
    color: 'bg-gray-100 border-gray-300 text-gray-800',
    description: 'Frokost',
    preferredTaskTypes: [],
    isBreakZone: true
  },
  {
    id: 'customer-reply',
    name: 'Besvar kunder',
    timeSlot: '13:15 - 13:30',
    capacity: 15,
    color: 'bg-blue-100 border-blue-300 text-blue-800',
    description: 'Svar på henvendelser fra kunder',
    preferredTaskTypes: ['quick-wins']
  },
  {
    id: 'calling-2',
    name: 'Ringeblok 2',
    timeSlot: '13:30 - 15:30',
    capacity: 120,
    color: 'bg-green-100 border-green-300 text-green-800',
    description: 'Opkald til leads',
    preferredTaskTypes: ['deep-work']
  },
  {
    id: 'microbreak-2',
    name: 'Mikropause',
    timeSlot: '15:30 - 15:45',
    capacity: 15,
    color: 'bg-gray-100 border-gray-300 text-gray-800',
    description: 'Kort pause og omstilling',
    preferredTaskTypes: [],
    isBreakZone: true
  },
  {
    id: 'calling-3',
    name: 'Ringeblok 3',
    timeSlot: '15:45 - 16:45',
    capacity: 60,
    color: 'bg-green-100 border-green-300 text-green-800',
    description: 'Opkald til leads',
    preferredTaskTypes: ['deep-work']
  },
  {
    id: 'customer-drive',
    name: 'Driv kunder',
    timeSlot: '16:45 - 19:00',
    capacity: 135,
    color: 'bg-blue-100 border-blue-300 text-blue-800',
    description: 'Opfølgning og drift af kunder',
    preferredTaskTypes: ['admin', 'internal-meeting', 'quick-wins']
  },
  {
    id: 'flex-work',
    name: 'Fleks-zone',
    timeSlot: '19:00 - 22:00',
    capacity: 180,
    color: 'bg-purple-100 border-purple-300 text-purple-800',
    description: 'Fleksibel tid til alt det andet',
    preferredTaskTypes: ['flex', 'free-work', 'admin', 'quick-wins', 'internal-meeting']
  }
];

export const TASK_TYPE_OPTIONS = [
  { value: 'deep-work', label: 'Ring', icon: 'Target' },
  { value: 'internal-meeting', label: 'Internt møde', icon: 'Users' },
  { value: 'external-meeting', label: 'Levering til kunder', icon: 'UserCheck' },
  { value: 'admin', label: 'Driv kunder', icon: 'Mail' },
  { value: 'quick-wins', label: 'Besvar kunder', icon: 'Zap' },
  { value: 'flex', label: 'Fleksarbejde', icon: 'Shuffle' },
  { value: 'free-work', label: 'Fri arbejdszone', icon: 'Pen' },
  { value: 'online-meeting', label: 'Online møde', icon: 'Video' },
  { value: 'physical-meeting', label: 'Fysisk møde', icon: 'MapPin' }
];

export const ESTIMATED_TIME_OPTIONS = [
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 time' },
  { value: 90, label: '1,5 timer' },
  { value: 120, label: '2 timer' },
  { value: 180, label: '3 timer' },
  { value: 240, label: '4 timer' },
  { value: 480, label: '8 timer' }
];

export const PRIORITY_OPTIONS = [
  { value: 'high', label: 'Høj prioritet' },
  { value: 'medium', label: 'Mellem prioritet' },
  { value: 'low', label: 'Lav prioritet' }
];

export const RECURRENCE_OPTIONS = [
  { value: 'daily', label: 'Dagligt' },
  { value: 'weekdays', label: 'Kun hverdage' },
  { value: 'weekly', label: 'Ugentligt' },
  { value: 'monthly', label: 'Månedligt' }
];

export const DAYS_OF_WEEK = [
  { value: 0, label: 'Søndag', short: 'Sø' },
  { value: 1, label: 'Mandag', short: 'Ma' },
  { value: 2, label: 'Tirsdag', short: 'Ti' },
  { value: 3, label: 'Onsdag', short: 'On' },
  { value: 4, label: 'Torsdag', short: 'To' },
  { value: 5, label: 'Fredag', short: 'Fr' },
  { value: 6, label: 'Lørdag', short: 'Lø' }
];
