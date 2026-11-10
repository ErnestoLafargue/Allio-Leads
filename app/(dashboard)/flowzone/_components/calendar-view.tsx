"use client";

import React, { useState } from 'react';
import { Card } from './ui';
import { Badge } from './ui';
import { Button } from './ui';
import { Clock, Users, Mail, BookOpen, Target, Star, ChevronLeft, ChevronRight, Zap, Coffee, Shuffle, Pen, Video, MapPin, Car } from 'lucide-react';
import { ZoneTask, DAILY_ZONES } from '@/lib/flowzone/zones';
import { getZoneLayout, formatFixedTime, getFixedTaskLabel } from '@/lib/flowzone/zone-layout';
import { WeekendPanel } from './weekend-panel';
import { CallBlockChart } from './call-block-chart';
import { DayCallAnalysis } from './day-call-analysis';
import { useCallActivity } from '@/lib/flowzone/use-call-activity';
import { benchmarkForBlock } from '@/lib/flowzone/call-benchmark';
import { isWeekendDay, parseTimeSlot as parseZoneSlot } from '@/lib/flowzone/zone-manager';
import { ZoneAssigner } from '@/lib/flowzone/zone-assignment';
import { DanishTimeManager } from '@/lib/flowzone/danish-time';
import { format } from 'date-fns';
import { da } from 'date-fns/locale';

const PRIORITY_LABELS: Record<string, string> = { high: 'Høj', medium: 'Mellem', low: 'Lav' };

interface CalendarViewProps {
  tasks: ZoneTask[];
  zoneAssigner: ZoneAssigner;
  onTaskEdit: (task: ZoneTask) => void;
  onTaskComplete?: (taskId: string) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ tasks, zoneAssigner, onTaskEdit, onTaskComplete }) => {
  const getZoneHeight = (capacity: number): string => {
    const basePixelsPerMinute = 2;
    const minHeight = 120; // Further increased minimum height for better text fit
    const maxHeight = 200;
    
    const calculatedHeight = capacity * basePixelsPerMinute;
    const finalHeight = Math.max(minHeight, Math.min(maxHeight, calculatedHeight));
    
    return `${finalHeight}px`;
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

  const getOverrideTasksForZone = (zone: any): ZoneTask[] => {
    const zoneTime = parseTimeSlot(zone.timeSlot);
    
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
      
      // Debug logging
      console.log(`🔍 DEBUG: Checking task "${task.title}" for zone "${zone.name}"`);
      console.log(`  Task time: ${taskStartMinutes} - ${taskEndMinutes} minutes`);
      console.log(`  Zone time: ${zoneTime.startMinutes} - ${zoneTime.endMinutes} minutes`);
      console.log(`  Zone is break: ${zone.isBreakZone}, overrides breaks: ${overridesBreaks}`);
      
      // Check time overlap first
      const hasTimeOverlap = taskStartMinutes < zoneTime.endMinutes && taskEndMinutes > zoneTime.startMinutes;
      console.log(`  Time overlap: ${hasTimeOverlap}`);
      
      // For break zones: require BOTH time overlap AND override breaks
      // For regular zones: only require time overlap
      let result: boolean;
      if (zone.isBreakZone === true) {
        result = hasTimeOverlap && overridesBreaks;
        console.log(`  Break zone: time overlap (${hasTimeOverlap}) AND overrides breaks (${overridesBreaks}) = ${result}`);
      } else {
        result = hasTimeOverlap;
        console.log(`  Regular zone: time overlap = ${result}`);
      }
      console.log(`  Final result: ${result}`);
      
      return result;
    });
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

  const now = DanishTimeManager.getDanishTime();
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const isToday = DanishTimeManager.isDanishSameDay(selectedDate, now);
  const today = selectedDate;
  // Egne opkald pr. kvarter til graferne i ringeblokkene
  const selectedDayKey = format(selectedDate, 'yyyy-MM-dd');
  const { data: callActivity, history: callHistory, error: callError } = useCallActivity(selectedDayKey);
  const [dayAnalysisOpen, setDayAnalysisOpen] = useState(false);
  const isCallingZone = (zone: typeof DAILY_ZONES[number]) => !zone.isBreakZone && zone.preferredTaskTypes.includes('deep-work');
  /** Ringeblokke får mindst plads nok til grafen. */
  const rowHeight = (zone: typeof DAILY_ZONES[number]) =>
    isCallingZone(zone) ? `${Math.max(parseInt(getZoneHeight(zone.capacity)), 220)}px` : getZoneHeight(zone.capacity);

  const shiftDay = (days: number) =>
    setSelectedDate(prev => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + days));
  
  // Filter schedule override tasks for today (handle both old and new structure)
  const scheduleOverrideTasks = tasks.filter(task => {
    // Handle new structure
    if (task.scheduleOverride?.startTime) {
      return DanishTimeManager.isDanishSameDay(task.scheduleOverride.startTime, today) && !task.completed;
    }
    // Handle old structure
    if (task.isOverwriteSchedule && task.overwriteDate) {
      return DanishTimeManager.isDanishSameDay(task.overwriteDate, today) && !task.completed;
    }
    return false;
  });

  console.log('📅 DEBUG CalendarView: Schedule override tasks:', scheduleOverrideTasks);

  return (
    <div className="space-y-6">
      <Card className="p-6 bg-gradient-to-r from-indigo-50 to-blue-50 border-indigo-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-indigo-900">Dagens zoneplan</h2>
            <p className="text-sm font-medium text-gray-700">{isWeekendDay(selectedDate) ? 'Weekend – ingen zoner' : `Planlægning i ${DAILY_ZONES.length} zoner for ${isToday ? 'i dag' : 'dagen'}`}</p>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="icon" className="h-10" onClick={() => shiftDay(-1)} title="Forrige dag" aria-label="Forrige dag">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center">
              {isToday ? (
                <p className="text-sm font-medium text-gray-700">I dag</p>
              ) : (
                <button
                  type="button"
                  className="text-sm font-medium text-indigo-600 hover:underline"
                  onClick={() => setSelectedDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()))}
                >
                  Gå til i dag
                </button>
              )}
              <p className="text-lg font-semibold text-indigo-800">
                {format(today, 'EEEE d. MMMM', { locale: da })}
              </p>
              {isToday && (
                <p className="text-xs text-gray-500">
                  {DanishTimeManager.formatDanishTime(now, 'HH:mm')} dansk tid
                </p>
              )}
            </div>
            <Button variant="outline" size="icon" className="h-10" onClick={() => shiftDay(1)} title="Næste dag" aria-label="Næste dag">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {isWeekendDay(selectedDate) ? (
      <Card className="p-6">
        <div style={{ minHeight: 480 }} className="relative">
          <div className="absolute inset-0">
            <WeekendPanel
              date={selectedDate}
              tasks={tasks}
              zoneAssigner={zoneAssigner}
              onTaskEdit={onTaskEdit}
              onTaskComplete={onTaskComplete}
            />
          </div>
        </div>
      </Card>
      ) : (
      <Card className="p-6">
        <div className="space-y-3">
          {DAILY_ZONES.map(zone => {
            const todayZoneTasks = zoneAssigner.getZoneTasks(zone.id, selectedDate);
            const utilization = zoneAssigner.getZoneUtilization(zone.id, selectedDate);
            
            return (
              <div key={zone.id} className="flex gap-4" style={{ minHeight: rowHeight(zone) }}>
                <div className="w-48">
                  <div 
                    className={`p-3 rounded-md border border-gray-200 h-full ${zone.color} ${zone.isBreakZone ? 'opacity-60' : ''} flex flex-col justify-between`}
                    style={{ height: rowHeight(zone) }}
                  >
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-gray-700 leading-relaxed">{zone.name}</div>
                      <div className="text-xs text-gray-500">{zone.timeSlot ? zone.timeSlot.split(' (')[0] : 'Intet tidspunkt'}</div>
                      <div className="text-xs text-gray-500">{zone.capacity} min</div>
                    </div>
                    <div className="space-y-1 mt-auto">
                      <div className="text-xs font-medium text-gray-700">{Math.round(utilization)}% udnyttet</div>
                      {zone.isBreakZone && (
                        <div className="text-xs text-gray-500 italic">Pause</div>
                      )}
                    </div>
                  </div>
                </div>
                
                {isCallingZone(zone) && (
                  <div className="flex-1 min-w-0" style={{ height: rowHeight(zone) }}>
                    <CallBlockChart
                      {...parseZoneSlot(zone.timeSlot)}
                      onOpen={() => setDayAnalysisOpen(true)}
                      activity={callActivity}
                      error={callError}
                      isToday={isToday}
                      dayLabel={isToday ? 'I dag' : format(selectedDate, 'd. MMM', { locale: da })}
                      benchmark={callHistory ? benchmarkForBlock(callHistory, selectedDayKey, { id: zone.id, ...parseZoneSlot(zone.timeSlot) }) : null}
                    />
                  </div>
                )}

                <div className={`${isCallingZone(zone) ? 'w-72 shrink-0' : 'flex-1'} relative`} style={{ height: rowHeight(zone) }}>
                  {(() => {
                    const overrideTasks = getOverrideTasksForZone(zone);
                    const hasOverride = overrideTasks.length > 0;
                        const layout = getZoneLayout(zone, overrideTasks);
                    
                    return (
                      <>
                        {/* Normal zone content */}
                        {layout.freeArea && (
                        <div className="absolute inset-x-0" style={{ top: `${layout.freeArea.top}%`, height: `${layout.freeArea.height}%` }}>
                          {zone.isBreakZone ? (
                            <div 
                              className="h-full border-2 border-dashed border-slate-100 rounded text-sm text-slate-400 flex items-center justify-center"
                              
                            >
                              <div className="text-center opacity-50">
                                <Coffee className="w-6 h-6 mx-auto mb-1" />
                                <p>Pause</p>
                              </div>
                            </div>
                           ) : todayZoneTasks.length > 0 ? (
                            <div 
                              className={`p-3 rounded-md border border-gray-200 h-full ${zone.color} overflow-y-auto`}
                              
                            >
                              <div className="space-y-3">
                                {todayZoneTasks.map(task => (
                                  <div 
                                    key={task.id} 
                                    className="bg-white/80 p-3 rounded-md border border-gray-100 cursor-pointer hover:bg-white/90 transition-all hover:shadow-sm"
                                    onClick={() => onTaskEdit(task)}
                                  >
                                     <div className="flex items-center justify-between">
                                       <div className="flex items-center space-x-2">
                                         {getTaskTypeIcon(task.taskType)}
                                         <span className="text-sm font-medium text-gray-700">{task.title}</span>
                                         {task.isMultiZone && (
                                           <span className="px-3 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                                             Del {(task.segmentIndex || 0) + 1}/{task.totalSegments || 1}
                                           </span>
                                         )}
                                       </div>
                                       <div className="flex items-center space-x-2">
                                         <Badge className={getPriorityColor(task.priority)}>
                                           {PRIORITY_LABELS[task.priority] ?? task.priority}
                                         </Badge>
                                         <div className="flex items-center space-x-1 text-xs text-gray-500">
                                           <Clock className="w-3 h-3" />
                                           <span>{task.estimatedTime} min</span>
                                         </div>
                                       </div>
                                     </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div 
                              className="h-full border-2 border-dashed border-gray-100 rounded-md text-sm text-gray-500 flex items-center justify-center"
                              
                            >
                              <div className="text-center">
                                <Clock className="w-6 h-6 mx-auto mb-1 opacity-50" />
                                <p>Ledig til opgaver</p>
                              </div>
                            </div>
                          )}
                        </div>
                        )}
                        
                        {layout.blocks.map(({ task, kind, time, top, height }) => (
                        <div
                          key={`${task.id}-${kind}`}
                          className={`absolute inset-x-0 z-10 rounded-md ${kind === 'meeting' ? 'bg-gradient-to-r from-orange-100 to-amber-100 border-2 border-orange-300' : 'bg-[repeating-linear-gradient(135deg,#f1f5f9_0,#f1f5f9_6px,#e2e8f0_6px,#e2e8f0_12px)] border-2 border-dashed border-slate-300'} px-3 py-2 overflow-hidden cursor-pointer hover:border-orange-400 transition-all`}
                          style={{ top: `${top}%`, height: `${height}%`, minHeight: '36px' }}
                          onClick={() => onTaskEdit(task)}
                          title={kind === 'meeting' ? `${getFixedTaskLabel(task)}: ${task.title} (${formatFixedTime(task)})` : `Transport ${kind === 'transport-before' ? 'til' : 'fra'} «${task.title}» (${time})`}
                        >
                          <div className="flex items-center space-x-1">
                            {kind === 'meeting' ? getTaskTypeIcon(task.taskType) : <Car className="h-3 w-3 text-slate-500" />}
                            <span className="text-sm font-medium truncate">{kind === 'meeting' ? task.title : `Transport ${kind === 'transport-before' ? 'til' : 'fra'} møde`}</span>
                          </div>
                          <div className={`text-xs font-medium truncate ${kind === 'meeting' ? 'text-orange-700' : 'text-slate-500'}`}>
                            {kind === 'meeting' ? `${formatFixedTime(task)} · ${getFixedTaskLabel(task)}` : `${time} · ${task.title}`}
                          </div>
                        </div>
                      ))}
                      </>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      )}


      <Card className="p-6 bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200">
        <div className="flex items-start space-x-3">
          <div className="bg-emerald-100 p-2 rounded-lg">
            <Target className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Indsigt i dagens zoner</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-500">
              <div>
                <span className="font-medium text-gray-700">Fokusarbejde:</span> 4 timer afsat
              </div>
              <div>
                <span className="font-medium text-gray-700">Møder:</span> 1,25 timer planlagt
              </div>
              <div>
                <span className="font-medium text-gray-700">Admin:</span> 1 time planlagt
              </div>
              <div>
                <span className="font-medium text-gray-700">Læring:</span> 1,5 timer reserveret
              </div>
            </div>
            <p className="text-xs text-emerald-600 mt-2">
              Zonehøjder svarer til varigheden • Udvidet plan 9:00-22:00
            </p>
          </div>
        </div>
      </Card>

      <DayCallAnalysis
        open={dayAnalysisOpen}
        onClose={() => setDayAnalysisOpen(false)}
        dayKey={selectedDayKey}
        dayTitle={format(selectedDate, 'EEEE d. MMMM', { locale: da })}
        dayLabel={format(selectedDate, 'd. MMM', { locale: da })}
        isToday={isToday}
        activity={callActivity}
        history={callHistory}
        zones={DAILY_ZONES}
      />
    </div>
  );
};
