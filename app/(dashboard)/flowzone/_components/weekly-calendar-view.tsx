"use client";

import React from 'react';
import { Card } from './ui';
import { Badge } from './ui';
import { Clock, ChevronLeft, ChevronRight, Users, Mail, BookOpen, Target, Star, Zap, Coffee, Shuffle, Pen, Video, MapPin, Car } from 'lucide-react';
import { Button } from './ui';
import { ZoneTask, DAILY_ZONES } from '@/lib/flowzone/zones';
import { getZoneLayout, formatFixedTime, getFixedTaskLabel } from '@/lib/flowzone/zone-layout';
import { WeekendPanel } from './weekend-panel';
import { isWeekendDay } from '@/lib/flowzone/zone-manager';
import { ZoneAssigner } from '@/lib/flowzone/zone-assignment';
import { DanishTimeManager } from '@/lib/flowzone/danish-time';
import { format } from 'date-fns';
import { da } from 'date-fns/locale';

const PRIORITY_LABELS: Record<string, string> = { high: 'Høj', medium: 'Mellem', low: 'Lav' };

interface WeeklyCalendarViewProps {
  tasks: ZoneTask[];
  zoneAssigner: ZoneAssigner;
  onTaskEdit: (task: ZoneTask) => void;
  onTaskComplete?: (taskId: string) => void;
}

export const WeeklyCalendarView: React.FC<WeeklyCalendarViewProps> = ({ tasks, zoneAssigner, onTaskEdit, onTaskComplete }) => {
  const days = ['Ma', 'Ti', 'On', 'To', 'Fr', 'Lø', 'Sø'];
  
  // Calculate proportional height based on zone capacity
  const getZoneHeight = (capacity: number): string => {
    const basePixelsPerMinute = 2; // 2px per minute for better scaling
    const minHeight = 90; // Increased minimum height for better text fit
    const maxHeight = 200; // Maximum height to prevent oversized zones
    
    const calculatedHeight = capacity * basePixelsPerMinute;
    const finalHeight = Math.max(minHeight, Math.min(maxHeight, calculatedHeight));
    
    return `${finalHeight}px`;
  };

  const getTaskTypeIcon = (taskType: string) => {
    switch (taskType) {
      case 'setup':
        return <Clock className="h-3 w-3" />;
      case 'internal-meeting':
      case 'client-meeting':
        return <Users className="h-3 w-3" />;
      case 'admin':
        return <Mail className="h-3 w-3" />;
      case 'quick-wins':
        return <Zap className="h-3 w-3" />;
      case 'lunch':
        return <Coffee className="h-3 w-3" />;
      case 'learning':
        return <BookOpen className="h-3 w-3" />;
      case 'deep-work':
        return <Target className="h-3 w-3" />;
      case 'flex':
        return <Shuffle className="h-3 w-3" />;
      case 'free-work':
        return <Pen className="h-3 w-3" />;
      case 'online-meeting':
        return <Video className="h-3 w-3" />;
      case 'physical-meeting':
        return <MapPin className="h-3 w-3" />;
      default:
        return <Star className="h-3 w-3" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getCurrentWeekDates = () => {
    const today = DanishTimeManager.getDanishTime();
    const currentDay = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (currentDay === 0 ? 6 : currentDay - 1));
    
    return days.map((_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return date.getDate();
    });
  };

  const parseTimeSlot = (timeSlot: string): { startMinutes: number; endMinutes: number } => {
    if (!timeSlot) {
      return { startMinutes: 0, endMinutes: 0 };
    }
    
    const timeRange = timeSlot.split(' (')[0]; // Remove any additional info in parentheses
    const [start, end] = timeRange.split(' - ');
    
    const parseTime = (timeStr: string): number => {
      if (!timeStr) return 0;
      const [hours, minutes] = timeStr.split(':').map(Number);
      return hours * 60 + minutes;
    };
    
    return {
      startMinutes: parseTime(start),
      endMinutes: parseTime(end)
    };
  };

  const getOverrideTasksForZoneAndDay = (zone: any, dayDate: Date): ZoneTask[] => {
    const zoneTime = parseTimeSlot(zone.timeSlot);
    
    // Filter schedule override tasks for this specific day
    const scheduleOverrideTasks = tasks.filter(task => {
      // Handle new structure
      if (task.scheduleOverride?.startTime) {
        return DanishTimeManager.isDanishSameDay(task.scheduleOverride.startTime, dayDate) && !task.completed;
      }
      // Handle old structure
      if (task.isOverwriteSchedule && task.overwriteDate) {
        return DanishTimeManager.isDanishSameDay(task.overwriteDate, dayDate) && !task.completed;
      }
      return false;
    });
    
    return scheduleOverrideTasks.filter(task => {
      let taskStartMinutes: number;
      let taskEndMinutes: number;
      let overridesBreaks: boolean;
      
      // Handle new structure
      if (task.scheduleOverride?.startTime && task.scheduleOverride?.endTime) {
        taskStartMinutes = DanishTimeManager.getDanishHours(task.scheduleOverride.startTime) * 60 + 
                          DanishTimeManager.getDanishMinutes(task.scheduleOverride.startTime);
        taskEndMinutes = DanishTimeManager.getDanishHours(task.scheduleOverride.endTime) * 60 + 
                        DanishTimeManager.getDanishMinutes(task.scheduleOverride.endTime);
        overridesBreaks = task.scheduleOverride.overrideBreaks || false;
        // Transport før og efter et fysisk møde hører også til mødet
        taskStartMinutes -= task.travelBufferMinutes ?? 0;
        taskEndMinutes += task.travelBufferMinutes ?? 0;
      }
      // Handle old structure
      else if (task.isOverwriteSchedule && task.overwriteStartHour !== undefined && task.overwriteEndHour !== undefined) {
        taskStartMinutes = task.overwriteStartHour * 60;
        taskEndMinutes = task.overwriteEndHour * 60;
        overridesBreaks = task.overrideBreaks || false;
      } else {
        return false;
      }
      
      console.log(`Weekly Override Check for zone ${zone.name} (${zone.timeSlot}):`);
      console.log(`Zone time: ${zoneTime.startMinutes} - ${zoneTime.endMinutes} minutes`);
      console.log(`Task time: ${taskStartMinutes} - ${taskEndMinutes} minutes`);
      console.log(`Task title: "${task.title}"`);
      console.log(`Zone is break: ${zone.isBreakZone}, overrides breaks: ${overridesBreaks}`);
      
      // Check time overlap - zones that actually intersect with the override time
      // Use strict inequality to prevent boundary edge cases
      const hasTimeOverlap = taskStartMinutes < zoneTime.endMinutes && taskEndMinutes > zoneTime.startMinutes;
      console.log(`Has time overlap: ${hasTimeOverlap}`);
      
      // For break zones: only override if explicitly marked as break AND overrideBreaks is true AND there's time overlap
      if (zone.isBreakZone === true) {
        const shouldOverride = overridesBreaks === true && hasTimeOverlap;
        console.log(`Break zone override result: ${shouldOverride}`);
        return shouldOverride;
      }
      
      // For regular zones: only override if there's actual time overlap
      console.log(`Regular zone override result: ${hasTimeOverlap}`);
      return hasTimeOverlap;
    });
  };

  const getWeeklyZoneTasks = () => {
    const weeklyTasks: Record<number, Record<string, ZoneTask[]>> = {};
    const today = DanishTimeManager.getDanishTime();
    const currentDay = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (currentDay === 0 ? 6 : currentDay - 1));
    
    days.forEach((_, dayIndex) => {
      weeklyTasks[dayIndex] = {};
      DAILY_ZONES.forEach(zone => {
        weeklyTasks[dayIndex][zone.id] = [];
      });
      
      // Calculate the date for this day
      const dayDate = new Date(monday);
      dayDate.setDate(monday.getDate() + dayIndex);
      
      // Get all tasks from zoneAssigner and filter by this day
      DAILY_ZONES.forEach(zone => {
        weeklyTasks[dayIndex][zone.id] = zoneAssigner.getZoneTasks(zone.id, dayDate);
      });
    });
    
    return weeklyTasks;
  };

  const weekDates = getCurrentWeekDates();
  const weeklyZoneTasks = getWeeklyZoneTasks();

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-6 bg-gradient-to-r from-indigo-50 to-blue-50 border-indigo-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-indigo-900">Ugens zoneoverblik</h2>
            <p className="text-sm font-medium text-gray-700">Planlægning i 11 zoner hen over ugen</p>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="icon" className="h-10">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700">Denne uge</p>
              <p className="text-lg font-semibold text-indigo-800">
                {format(DanishTimeManager.getDanishTime(), 'MMMM yyyy', { locale: da })}
              </p>
            </div>
            <Button variant="outline" size="icon" className="h-10">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Weekly Zone Grid */}
      <Card className="p-6 overflow-x-auto">
        <div className="min-w-[1200px]">
          {/* Day Headers */}
          <div className="grid grid-cols-[10rem_repeat(7,minmax(0,1fr))] gap-4 mb-6">
            <div></div> {/* Empty space for zone column */}
            {days.map((day, index) => (
              <div key={day} className="text-center p-3 bg-gray-50 rounded-md border border-gray-100">
                <div className="text-sm font-medium text-gray-700">{day}</div>
                <div className="text-sm text-gray-500">{weekDates[index]}</div>
              </div>
            ))}
          </div>

          {/* Zone Grid with Proportional Heights */}
          <div className="grid grid-cols-[10rem_repeat(7,minmax(0,1fr))] gap-x-4 gap-y-3">
            {DAILY_ZONES.map((zone, zoneIndex) => (
              <div key={zone.id} className="contents">
                {/* Zone Label */}
                <div className="min-w-0" style={{ gridRow: zoneIndex + 1, gridColumn: 1 }}>
                  <div 
                    className={`p-3 rounded-md border border-gray-200 h-full ${zone.color} ${zone.isBreakZone ? 'opacity-60' : ''}`}
                    style={{ height: getZoneHeight(zone.capacity) }}
                  >
                    <div className="text-xs font-medium text-gray-700">{zone.name}</div>
                    <div className="text-xs text-gray-500">{zone.timeSlot.split(' (')[0]}</div>
                    <div className="text-xs text-gray-500 mt-1">{zone.capacity} min</div>
                    {zone.isBreakZone && (
                      <div className="text-xs text-gray-500 italic">Pause</div>
                    )}
                  </div>
                </div>
                
                {/* Day Columns */}
                {days.map((_, dayIndex) => {
                  const dayTasks = weeklyZoneTasks[dayIndex]?.[zone.id] || [];
                  
                  // Calculate the date for this day
                  const today = DanishTimeManager.getDanishTime();
                  const currentDay = today.getDay();
                  const monday = new Date(today);
                  monday.setDate(today.getDate() - (currentDay === 0 ? 6 : currentDay - 1));
                  const dayDate = new Date(monday);
                  dayDate.setDate(monday.getDate() + dayIndex);
                  
                  const overrideTasks = getOverrideTasksForZoneAndDay(zone, dayDate);
                  const hasOverride = overrideTasks.length > 0;
                      const layout = getZoneLayout(zone, overrideTasks);
                  
                  // Debug logging for visual rendering
                  if (overrideTasks.length > 0) {
                    console.log(`VISUAL RENDER: Zone ${zone.name} on day ${dayIndex} has ${overrideTasks.length} override tasks`);
                    console.log(`Override tasks:`, overrideTasks.map(t => ({title: t.title, startTime: t.scheduleOverride?.startTime || 'old structure'})));
                  }
                  
                  // Weekenden er ét felt hen over alle zoner
                  if (isWeekendDay(dayDate)) {
                    if (zoneIndex !== 0) return null;
                    return (
                      <div
                        key={dayIndex}
                        className="relative min-h-0"
                        style={{ gridRow: `1 / span ${DAILY_ZONES.length}`, gridColumn: dayIndex + 2 }}
                      >
                        <div className="absolute inset-0">
                          <WeekendPanel
                            date={dayDate}
                            tasks={tasks}
                            zoneAssigner={zoneAssigner}
                            onTaskEdit={onTaskEdit}
                            onTaskComplete={onTaskComplete}
                            compact
                          />
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={dayIndex} className="relative" style={{ height: getZoneHeight(zone.capacity), gridRow: zoneIndex + 1, gridColumn: dayIndex + 2 }}>
                      {/* Normal zone content */}
                      {layout.freeArea && (
                      <div className="absolute inset-x-0" style={{ top: `${layout.freeArea.top}%`, height: `${layout.freeArea.height}%` }}>
                        {zone.isBreakZone ? (
                          <div 
                            className="h-full border-2 border-dashed border-gray-100 rounded-md text-xs text-gray-500 flex items-center justify-center bg-gray-50"
                            
                          >
                            Pause
                          </div>
                        ) : dayTasks.length > 0 ? (
                          <div 
                            className={`p-2 rounded-md border border-gray-200 h-full ${zone.color} overflow-y-auto`}
                            
                          >
                            {dayTasks.map(task => (
                              <div 
                                key={task.id} 
                                className="bg-white/80 p-2 rounded-md mb-2 last:mb-0 cursor-pointer hover:bg-white transition-all border border-gray-100"
                                onClick={() => onTaskEdit(task)}
                              >
                                <div className="flex items-center space-x-1 mb-1">
                                  {getTaskTypeIcon(task.taskType)}
                                  <span className="text-xs font-medium text-gray-700 truncate">{task.title}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <Badge className={`text-xs px-2 py-1 ${getPriorityColor(task.priority)}`}>
                                    {PRIORITY_LABELS[task.priority] ?? task.priority}
                                  </Badge>
                                  <div className="flex items-center space-x-1 text-xs text-gray-500">
                                    <Clock className="w-2 h-2" />
                                    <span>{task.estimatedTime} min</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div 
                            className="h-full border-2 border-dashed border-gray-100 rounded-md text-xs text-gray-500 flex items-center justify-center"
                            
                          >
                            Ledig
                          </div>
                        )}
                      </div>
                      )}
                      
                      {layout.blocks.map(({ task, kind, time, top, height }) => (
                        <div
                          key={`${task.id}-${kind}`}
                          className={`absolute inset-x-0 z-10 rounded-md ${kind === 'meeting' ? 'bg-gradient-to-r from-orange-100 to-amber-100 border-2 border-orange-300' : 'bg-[repeating-linear-gradient(135deg,#f1f5f9_0,#f1f5f9_6px,#e2e8f0_6px,#e2e8f0_12px)] border-2 border-dashed border-slate-300'} px-1.5 py-1 overflow-hidden cursor-pointer hover:border-orange-400 transition-all`}
                          style={{ top: `${top}%`, height: `${height}%`, minHeight: '28px' }}
                          onClick={() => onTaskEdit(task)}
                          title={kind === 'meeting' ? `${getFixedTaskLabel(task)}: ${task.title} (${formatFixedTime(task)})` : `Transport ${kind === 'transport-before' ? 'til' : 'fra'} «${task.title}» (${time})`}
                        >
                          <div className="flex items-center space-x-1">
                            {kind === 'meeting' ? getTaskTypeIcon(task.taskType) : <Car className="h-3 w-3 text-slate-500" />}
                            <span className="text-xs font-medium truncate">{kind === 'meeting' ? task.title : `Transport ${kind === 'transport-before' ? 'til' : 'fra'} møde`}</span>
                          </div>
                          <div className={`text-xs font-medium truncate ${kind === 'meeting' ? 'text-orange-700' : 'text-slate-500'}`}>
                            {kind === 'meeting' ? `${formatFixedTime(task)} · ${getFixedTaskLabel(task)}` : `${time} · ${task.title}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Weekly Summary */}
      <Card className="p-6 bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200">
        <div className="flex items-start space-x-3">
          <div className="bg-emerald-100 p-2 rounded-lg">
            <Clock className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-semibold text-emerald-800 mb-1">Indsigt i ugens zoner</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-emerald-700">
              <div>
                <span className="font-medium">Fokusarbejde:</span> 4 timer planlagt
              </div>
              <div>
                <span className="font-medium">Møder:</span> 2,5 timer planlagt
              </div>
              <div>
                <span className="font-medium">Admin:</span> 2 timer afsat
              </div>
              <div>
                <span className="font-medium">Læring:</span> 3 timer reserveret
              </div>
            </div>
            <p className="text-xs text-emerald-600 mt-2">
              Zonehøjder svarer til varigheden • Udvidet plan 9:00-22:00
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
};
