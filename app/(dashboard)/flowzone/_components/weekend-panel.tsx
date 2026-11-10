"use client";

import React from 'react';
import { Badge } from './ui';
import { Button } from './ui';
import { Car, CheckCircle2, Clock, Coffee, LogIn, MapPin, Video } from 'lucide-react';
import { ZoneTask } from '@/lib/flowzone/zones';
import { ZoneAssigner } from '@/lib/flowzone/zone-assignment';
import { getBusyBlocksForDay } from '@/lib/flowzone/meeting-blocks';
import { useTimeClock } from '@/lib/use-time-clock';
import { format } from 'date-fns';

const PRIORITY_LABELS: Record<string, string> = { high: 'Høj', medium: 'Mellem', low: 'Lav' };
const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-800 border-red-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-green-100 text-green-800 border-green-200',
};

interface WeekendPanelProps {
  date: Date;
  tasks: ZoneTask[];
  zoneAssigner: ZoneAssigner;
  onTaskEdit?: (task: ZoneTask) => void;
  onTaskComplete?: (taskId: string) => void;
  compact?: boolean;
}

/**
 * Weekenden er ét samlet felt uden zoner og uden ringeopgaver.
 * Stempler man ind på dagen, vises de næste opgaver fra toppen af planen.
 * Det man når, er fuldført og forsvinder derfor fra næste uges plan.
 */
export const WeekendPanel: React.FC<WeekendPanelProps> = ({ date, tasks, zoneAssigner, onTaskEdit, onTaskComplete, compact }) => {
  // Allio-Leads' egen stempling afgør, om man er på arbejde i weekenden
  const { status } = useTimeClock();
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const clockedInToday = isToday && status?.clockedIn === true;

  const meetings = getBusyBlocksForDay(tasks, date);
  const nextTasks = clockedInToday ? zoneAssigner.getWeekendTasks() : [];
  const text = compact ? 'text-xs' : 'text-sm';

  return (
    <div className={`h-full rounded-md border-2 border-dashed border-violet-200 bg-violet-50/60 ${compact ? 'p-2' : 'p-4'} overflow-y-auto`}>
      <div className="flex items-center space-x-2 mb-2">
        <Coffee className="h-4 w-4 text-violet-500" />
        <span className={`${text} font-semibold text-violet-800`}>Weekend</span>
      </div>
      <p className={`${compact ? 'text-[11px]' : 'text-xs'} text-violet-700 mb-3`}>Ingen zoner og ingen opkald</p>

      {meetings.length > 0 && (
        <div className="space-y-1 mb-3">
          {meetings.map(({ task }) => {
            const buffer = task.travelBufferMinutes ?? 0;
            const start = task.scheduleOverride ? new Date(task.scheduleOverride.startTime) : null;
            const end = task.scheduleOverride ? new Date(task.scheduleOverride.endTime) : null;
            const transport = (from: Date, to: Date, label: string) => (
              <div
                className="bg-[repeating-linear-gradient(135deg,#f1f5f9_0,#f1f5f9_6px,#e2e8f0_6px,#e2e8f0_12px)] border-2 border-dashed border-slate-300 rounded p-1.5 cursor-pointer"
                onClick={() => onTaskEdit?.(task)}
                title={`${label} «${task.title}»`}
              >
                <div className="flex items-center space-x-1">
                  <Car className="h-3 w-3 text-slate-500" />
                  <span className="text-xs font-medium truncate">{label}</span>
                </div>
                <div className="text-xs text-slate-500">{format(from, 'HH:mm')}–{format(to, 'HH:mm')}</div>
              </div>
            );
            return (
              <div key={task.id} className="space-y-1">
                {buffer > 0 && start && transport(new Date(start.getTime() - buffer * 60000), start, 'Transport til møde')}
                <div
                  className="bg-gradient-to-r from-orange-100 to-amber-100 border border-orange-300 rounded p-1.5 cursor-pointer"
                  onClick={() => onTaskEdit?.(task)}
                >
                  <div className="flex items-center space-x-1">
                    {task.taskType === 'online-meeting' ? <Video className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                    <span className="text-xs font-medium truncate">{task.title}</span>
                  </div>
                  {start && end && (
                    <div className="text-xs text-orange-700">
                      {format(start, 'HH:mm')}–{format(end, 'HH:mm')}
                    </div>
                  )}
                </div>
                {buffer > 0 && end && transport(end, new Date(end.getTime() + buffer * 60000), 'Transport fra møde')}
              </div>
            );
          })}
        </div>
      )}

      {clockedInToday ? (
        <div className="space-y-2">
          <p className={`${text} font-medium text-violet-900`}>Næste opgaver</p>
          {nextTasks.length === 0 && <p className="text-xs text-violet-700">Ingen udestående opgaver</p>}
          {nextTasks.map(task => (
            <div
              key={task.id}
              className="bg-white/90 border border-violet-100 rounded-md p-2 cursor-pointer hover:bg-white"
              onClick={() => onTaskEdit?.(task)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-gray-800 truncate">{task.title}</span>
                {onTaskComplete && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 shrink-0"
                    title="Fuldfør"
                    aria-label="Fuldfør"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTaskComplete(task.id);
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  </Button>
                )}
              </div>
              <div className="flex items-center justify-between mt-1">
                <Badge className={`text-[10px] px-1.5 py-0 ${PRIORITY_COLORS[task.priority] ?? ''}`}>
                  {PRIORITY_LABELS[task.priority] ?? task.priority}
                </Badge>
                <span className="flex items-center space-x-1 text-[11px] text-gray-500">
                  <Clock className="h-3 w-3" />
                  <span>{task.estimatedTime} min</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : isToday ? (
        <p className="text-xs text-violet-700 flex items-center space-x-1">
          <LogIn className="h-3 w-3" />
          <span>Stempl ind for at få dine næste opgaver frem</span>
        </p>
      ) : null}
    </div>
  );
};
