"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui';
import { Button } from './ui';
import { Input } from './ui';
import { Label } from './ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui';
import { Calendar } from './ui';
import { Popover, PopoverContent, PopoverTrigger } from './ui';
import { Checkbox } from './ui';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui';
import { CalendarIcon, Clock, Target, Users, UserCheck, Mail, BookOpen, MapPin, Repeat, Zap, Coffee, Shuffle, Pen, Settings, ChevronLeft, ChevronRight, Plus, MessageSquare, ChevronDown, Video, Truck } from 'lucide-react';
import { format } from 'date-fns';
import { da } from 'date-fns/locale';
import { cn } from './ui';
import { DanishTimeManager } from '@/lib/flowzone/danish-time';
import { 
  ZoneTask, 
  TaskType, 
  Priority, 
  EstimatedTime,
  RecurrencePattern,
  TASK_TYPE_OPTIONS,
  ESTIMATED_TIME_OPTIONS,
  PRIORITY_OPTIONS,
  isMeetingType,
  ONLINE_MEETING_DURATION_MIN,
  PHYSICAL_MEETING_DURATION_MIN,
  PHYSICAL_TRANSPORT_BUFFER_MIN
} from '@/lib/flowzone/zones';
import { findMeetingConflicts, getBusyBlocksForDay } from '@/lib/flowzone/meeting-blocks';
import { useCustomZones } from '@/lib/flowzone/use-custom-zones';
import { ZoneAssigner } from '@/lib/flowzone/zone-assignment';
import { RecurrenceSettings } from './recurrence-settings';

interface TaskInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTaskCreate: (task: Omit<ZoneTask, 'id' | 'createdAt' | 'completed' | 'assignedZone'>) => void;
  onTaskUpdate?: (task: ZoneTask) => void;
  editingTask?: ZoneTask;
  existingTasks: ZoneTask[];
}

export const TaskInputModal: React.FC<TaskInputModalProps> = ({
  isOpen,
  onClose,
  onTaskCreate,
  onTaskUpdate,
  editingTask,
  existingTasks,
}) => {
  const { zones } = useCustomZones();
  const isEditing = !!editingTask;
  const [title, setTitle] = useState('');
  const [deadline, setDeadline] = useState<Date>(new Date());
  const [estimatedTime, setEstimatedTime] = useState<EstimatedTime>(30);
  const [priority, setPriority] = useState<Priority>('medium');
  const [taskType, setTaskType] = useState<TaskType>('deep-work');
  const [predictedZone, setPredictedZone] = useState<string>('');
  const [predictedDate, setPredictedDate] = useState<Date | undefined>(undefined);
  const [multiZonePreview, setMultiZonePreview] = useState<string>('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<RecurrencePattern>({
    type: 'daily',
    interval: 1,
  });

  // Updated overwrite schedule states
  const [isOverwriteSchedule, setIsOverwriteSchedule] = useState(false);
  const [overwriteStartDateTime, setOverwriteStartDateTime] = useState<Date>(() => {
    // Default to next hour
    const now = new Date();
    now.setHours(now.getHours() + 1, 0, 0, 0);
    return now;
  });
  const [overwriteEndDateTime, setOverwriteEndDateTime] = useState<Date>(() => {
    // Default to 2 hours from now
    const later = new Date();
    later.setHours(later.getHours() + 2, 0, 0, 0);
    return later;
  });
  const [overrideBreaks, setOverrideBreaks] = useState(false);

  // Møder: fast dato og tidspunkt
  const [meetingDate, setMeetingDate] = useState<Date>(new Date());
  const [meetingStart, setMeetingStart] = useState('10:00');
  const [meetingEnd, setMeetingEnd] = useState('11:00');
  const [travelBuffer, setTravelBuffer] = useState(0);
  const isMeeting = isMeetingType(taskType);

  const toMinutes = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };
  const fromMinutes = (minutes: number) => {
    const clamped = Math.max(0, Math.min(minutes, 23 * 60 + 59));
    return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
  };
  const atTime = (time: string) => {
    const d = new Date(meetingDate);
    d.setHours(Math.floor(toMinutes(time) / 60), toMinutes(time) % 60, 0, 0);
    return d;
  };

  /** Vælger mødetype og sætter standardlængde og transport som i Allio-Leads. */
  const chooseMeetingType = (type: TaskType) => {
    const physical = type === 'physical-meeting';
    setTaskType(type);
    setMeetingEnd(fromMinutes(toMinutes(meetingStart) + (physical ? PHYSICAL_MEETING_DURATION_MIN : ONLINE_MEETING_DURATION_MIN)));
    setTravelBuffer(physical ? PHYSICAL_TRANSPORT_BUFFER_MIN : 0);
  };

  const meetingCandidate = useMemo(() => ({
    scheduleOverride: { startTime: atTime(meetingStart), endTime: atTime(meetingEnd) },
    travelBufferMinutes: taskType === 'physical-meeting' ? travelBuffer : 0,
  }), [meetingDate, meetingStart, meetingEnd, travelBuffer, taskType]);

  const meetingConflicts = useMemo(
    () => (isMeeting ? findMeetingConflicts(meetingCandidate, existingTasks, editingTask?.id) : []),
    [isMeeting, meetingCandidate, existingTasks, editingTask?.id]
  );

  const busyToday = useMemo(
    () => (isMeeting ? getBusyBlocksForDay(existingTasks, meetingDate, editingTask?.id) : []),
    [isMeeting, existingTasks, meetingDate, editingTask?.id]
  );

  // Comment states
  const [comments, setComments] = useState<string[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);

  // Initialize form with editing task data
  React.useEffect(() => {
    if (isEditing && editingTask) {
      setTitle(editingTask.title);
      setDeadline(editingTask.deadline);
      setEstimatedTime(editingTask.estimatedTime);
      setPriority(editingTask.priority);
      setTaskType(editingTask.taskType);
      setIsRecurring(editingTask.isRecurring);
      setRecurrencePattern(editingTask.recurrencePattern || { type: 'daily', interval: 1 });
      setComments(editingTask.comments || []);
      
      if (isMeetingType(editingTask.taskType) && editingTask.scheduleOverride) {
        const start = new Date(editingTask.scheduleOverride.startTime);
        const end = new Date(editingTask.scheduleOverride.endTime);
        setMeetingDate(start);
        setMeetingStart(format(start, 'HH:mm'));
        setMeetingEnd(format(end, 'HH:mm'));
        setTravelBuffer(editingTask.travelBufferMinutes ?? 0);
        setIsOverwriteSchedule(false);
      } else if (editingTask.scheduleOverride) {
        setIsOverwriteSchedule(true);
        setOverwriteStartDateTime(editingTask.scheduleOverride.startTime);
        setOverwriteEndDateTime(editingTask.scheduleOverride.endTime);
        setOverrideBreaks(editingTask.scheduleOverride.overrideBreaks || false);
      } else {
        setIsOverwriteSchedule(false);
      }
    } else {
      // Reset form for creating new task
      setTitle('');
      setDeadline(new Date());
      setEstimatedTime(30);
      setPriority('medium');
      setTaskType('deep-work');
      setIsRecurring(false);
      setRecurrencePattern({ type: 'daily', interval: 1 });
      setComments([]);
      setIsOverwriteSchedule(false);
      setNewComment('');
      setMeetingDate(new Date());
      setMeetingStart('10:00');
      setMeetingEnd('11:00');
      setTravelBuffer(0);
    }
  }, [isEditing, editingTask, isOpen]);

  // Predict zone assignment when inputs change
  useEffect(() => {
    if (title && taskType && estimatedTime && !isMeetingType(taskType)) {
      const mockTask: Omit<ZoneTask, 'id' | 'createdAt' | 'completed' | 'assignedZone'> = {
        title,
        deadline,
        estimatedTime,
        priority,
        taskType,
        isRecurring: false,
      };
      
      const zoneAssigner = new ZoneAssigner(existingTasks);
      const tempTask = { ...mockTask, id: 'temp', createdAt: new Date(), completed: false };
      const assignmentResult = zoneAssigner.assignTaskToZone(tempTask);
      
      if (assignmentResult.isMultiZone && assignmentResult.previewText) {
        setPredictedZone('');
        setMultiZonePreview(assignmentResult.previewText);
      } else {
        setPredictedZone(assignmentResult.assignedZone || 'flex-work');
        setPredictedDate(assignmentResult.scheduledDate);
        setMultiZonePreview('');
      }
    }
  }, [title, taskType, estimatedTime, priority, deadline, existingTasks]);

  const getTaskIcon = (type: TaskType) => {
    switch (type) {
      case 'internal-meeting': return <Users className="h-4 w-4" />;
      case 'external-meeting': return <UserCheck className="h-4 w-4" />;
      case 'deep-work': return <Target className="h-4 w-4" />;
      case 'admin': return <Mail className="h-4 w-4" />;
      case 'quick-wins': return <Zap className="h-4 w-4" />;
      case 'flex': return <Shuffle className="h-4 w-4" />;
      case 'free-work': return <Pen className="h-4 w-4" />;
      case 'online-meeting': return <Video className="h-4 w-4" />;
      case 'physical-meeting': return <MapPin className="h-4 w-4" />;
      default: return <Target className="h-4 w-4" />;
    }
  };

  const getPredictedZoneInfo = () => {
    const zone = zones.find(z => z.id === predictedZone);
    return zone || zones[0];
  };

  // Helper functions for datetime formatting
  const formatDateTimeForInput = (date: Date) => {
    try {
      // For datetime-local input, we need to format in local time
      // The input will be interpreted as local time by the browser
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const formatted = `${year}-${month}-${day}T${hours}:${minutes}`;
      console.log('📅 DEBUG: formatDateTimeForInput:', { date, formatted });
      return formatted;
    } catch (error) {
      console.error('❌ DEBUG: Error formatting datetime for input:', error);
      return '';
    }
  };

  const handleDateTimeChange = (value: string, isStart: boolean) => {
    console.log('📅 DEBUG: DateTime change:', { value, isStart });
    
    try {
      if (!value) return;
      
      // Parse the datetime-local value directly
      // The browser interprets this as local time, which is what we want
      const inputDate = new Date(value);
      console.log('📅 DEBUG: Parsed input date:', inputDate);
      
      // Validate the date
      if (isNaN(inputDate.getTime())) {
        console.error('❌ DEBUG: Invalid date parsed from input');
        return;
      }
      
      if (isStart) {
        setOverwriteStartDateTime(inputDate);
        console.log('📅 DEBUG: Set start datetime:', inputDate);
        
        // Auto-set end time to 1 hour later if end is before start
        if (inputDate >= overwriteEndDateTime) {
          const autoEndTime = new Date(inputDate.getTime() + 60 * 60 * 1000); // +1 hour
          setOverwriteEndDateTime(autoEndTime);
          console.log('📅 DEBUG: Auto-set end datetime:', autoEndTime);
        }
      } else {
        setOverwriteEndDateTime(inputDate);
        console.log('📅 DEBUG: Set end datetime:', inputDate);
      }
    } catch (error) {
      console.error('❌ DEBUG: Error parsing datetime:', error);
    }
  };

  const addComment = () => {
    if (newComment.trim()) {
      setComments(prev => [...prev, newComment.trim()]);
      setNewComment('');
    }
  };

  const removeComment = (index: number) => {
    setComments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      console.warn('📝 DEBUG: Title is required');
      return;
    }

    if (isMeeting) {
      const toDate = (time: string) => {
        const [h, m] = time.split(':').map(Number);
        const d = new Date(meetingDate);
        d.setHours(h, m, 0, 0);
        return d;
      };
      const startTime = toDate(meetingStart);
      const endTime = toDate(meetingEnd);
      if (startTime >= endTime) {
        alert('Mødet skal slutte efter det starter');
        return;
      }
      if (meetingConflicts.length > 0) {
        alert('Tidspunktet er optaget. Vælg et andet tidspunkt.');
        return;
      }
      const minutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);
      const validTimes = ESTIMATED_TIME_OPTIONS.map(o => o.value);
      const meetingData = {
        title: title.trim(),
        deadline: startTime,
        estimatedTime: (validTimes.find(t => t >= minutes) ?? validTimes[validTimes.length - 1]) as EstimatedTime,
        priority: 'high' as Priority,
        taskType,
        isRecurring: false,
        recurrencePattern: undefined,
        nextDueDate: undefined,
        scheduleOverride: { startTime, endTime, overrideBreaks: true },
        travelBufferMinutes: taskType === 'physical-meeting' ? travelBuffer : 0,
        comments: comments.length > 0 ? comments : undefined,
      };
      if (isEditing && editingTask && onTaskUpdate) {
        onTaskUpdate({ ...editingTask, ...meetingData, assignedZone: 'schedule-override' });
      } else {
        onTaskCreate(meetingData);
      }
      onClose();
      return;
    }

    // Validate schedule override if enabled
    if (isOverwriteSchedule) {
      if (overwriteStartDateTime >= overwriteEndDateTime) {
        console.error('❌ DEBUG: Start time must be before end time');
        alert('Starttidspunktet skal ligge før sluttidspunktet');
        return;
      }
      
      const duration = (overwriteEndDateTime.getTime() - overwriteStartDateTime.getTime()) / (1000 * 60);
      if (duration < 15) {
        console.error('❌ DEBUG: Minimum duration is 15 minutes');
        alert('Varigheden skal være mindst 15 minutter');
        return;
      }
    }

    const taskData = {
      title: title.trim(),
      deadline,
      estimatedTime,
      priority,
      taskType,
      isRecurring,
      recurrencePattern: isRecurring ? recurrencePattern : undefined,
      nextDueDate: isRecurring ? deadline : undefined,
      scheduleOverride: isOverwriteSchedule ? {
        startTime: overwriteStartDateTime,
        endTime: overwriteEndDateTime,
        overrideBreaks: overrideBreaks
      } : undefined,
      comments: comments.length > 0 ? comments : undefined,
    };

    try {
      if (isEditing && editingTask && onTaskUpdate) {
        onTaskUpdate({ ...editingTask, ...taskData });
      } else {
        onTaskCreate(taskData);
      }
    } catch (error) {
      console.error('❌ DEBUG: Error saving task:', error);
      alert('Opgaven kunne ikke gemmes. Prøv igen.');
      return;
    }
    
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Rediger opgave' : 'Ny opgave'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Task Title */}
          <div className="space-y-2">
            <Label htmlFor="title" className="text-sm font-medium">Opgave *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Skriv opgavens navn..."
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" className="text-sm font-medium">Beskrivelse</Label>
            <textarea
              id="description"
              className="w-full min-h-[100px] p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical"
              placeholder="Skriv en uddybende beskrivelse (valgfri)..."
            />
          </div>

          {/* Task Type Selection */}
          <div className="space-y-4">
            <Label className="text-sm font-medium">Opgavetype</Label>
            
            {/* Work Tasks Section */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-stone-500">Arbejde</h4>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTaskType('deep-work')}
                  className={cn(
                    "p-3 rounded-lg border text-left transition-all hover:bg-stone-100",
                    taskType === 'deep-work' 
                      ? "border-stone-900 bg-stone-900/5 ring-1 ring-stone-900" 
                      : "border-stone-200 bg-white"
                  )}
                >
                  <div className="flex items-center space-x-2 mb-1">
                    <Target className="h-4 w-4" />
                    <span className="font-medium text-sm">Ring</span>
                  </div>
                  <p className="text-xs text-stone-500">Opkald til leads</p>
                </button>

                <button
                  type="button"
                  onClick={() => setTaskType('quick-wins')}
                  className={cn(
                    "p-3 rounded-lg border text-left transition-all hover:bg-stone-100",
                    taskType === 'quick-wins' 
                      ? "border-stone-900 bg-stone-900/5 ring-1 ring-stone-900" 
                      : "border-stone-200 bg-white"
                  )}
                >
                  <div className="flex items-center space-x-2 mb-1">
                    <Zap className="h-4 w-4" />
                    <span className="font-medium text-sm">Besvar kunder</span>
                  </div>
                  <p className="text-xs text-stone-500">Svar på henvendelser fra kunder</p>
                </button>

                <button
                  type="button"
                  onClick={() => setTaskType('admin')}
                  className={cn(
                    "p-3 rounded-lg border text-left transition-all hover:bg-stone-100",
                    taskType === 'admin' 
                      ? "border-stone-900 bg-stone-900/5 ring-1 ring-stone-900" 
                      : "border-stone-200 bg-white"
                  )}
                >
                  <div className="flex items-center space-x-2 mb-1">
                    <Mail className="h-4 w-4" />
                    <span className="font-medium text-sm">Driv kunder</span>
                  </div>
                  <p className="text-xs text-stone-500">Opfølgning og drift af kunder</p>
                </button>

                <button
                  type="button"
                  onClick={() => setTaskType('external-meeting')}
                  className={cn(
                    "p-3 rounded-lg border text-left transition-all hover:bg-stone-100",
                    taskType === 'external-meeting' 
                      ? "border-stone-900 bg-stone-900/5 ring-1 ring-stone-900" 
                      : "border-stone-200 bg-white"
                  )}
                >
                  <div className="flex items-center space-x-2 mb-1">
                    <Truck className="h-4 w-4" />
                    <span className="font-medium text-sm">Levering</span>
                  </div>
                  <p className="text-xs text-stone-500">Levering til kunder</p>
                </button>

                <button
                  type="button"
                  onClick={() => setTaskType('flex')}
                  className={cn(
                    "p-3 rounded-lg border text-left transition-all hover:bg-stone-100",
                    taskType === 'flex' 
                      ? "border-stone-900 bg-stone-900/5 ring-1 ring-stone-900" 
                      : "border-stone-200 bg-white"
                  )}
                >
                  <div className="flex items-center space-x-2 mb-1">
                    <Shuffle className="h-4 w-4" />
                    <span className="font-medium text-sm">Fleksarbejde</span>
                  </div>
                  <p className="text-xs text-stone-500">Fleksibel arbejdstid</p>
                </button>

                <button
                  type="button"
                  onClick={() => setTaskType('free-work')}
                  className={cn(
                    "p-3 rounded-lg border text-left transition-all hover:bg-stone-100",
                    taskType === 'free-work' 
                      ? "border-stone-900 bg-stone-900/5 ring-1 ring-stone-900" 
                      : "border-stone-200 bg-white"
                  )}
                >
                  <div className="flex items-center space-x-2 mb-1">
                    <Pen className="h-4 w-4" />
                    <span className="font-medium text-sm">Fri arbejdszone</span>
                  </div>
                  <p className="text-xs text-stone-500">Frie arbejdsopgaver</p>
                </button>
              </div>
            </div>

            {/* Meeting Tasks Section */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-stone-500">Møder med kunder</h4>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => chooseMeetingType('online-meeting')}
                  className={cn(
                    "p-3 rounded-lg border text-left transition-all hover:bg-stone-100",
                    taskType === 'online-meeting' 
                      ? "border-stone-900 bg-stone-900/5 ring-1 ring-stone-900" 
                      : "border-stone-200 bg-white"
                  )}
                >
                  <div className="flex items-center space-x-2 mb-1">
                    <Video className="h-4 w-4" />
                    <span className="font-medium text-sm">Online møde</span>
                  </div>
                  <p className="text-xs text-stone-500">1 time, ingen transport</p>
                </button>

                <button
                  type="button"
                  onClick={() => chooseMeetingType('physical-meeting')}
                  className={cn(
                    "p-3 rounded-lg border text-left transition-all hover:bg-stone-100",
                    taskType === 'physical-meeting' 
                      ? "border-stone-900 bg-stone-900/5 ring-1 ring-stone-900" 
                      : "border-stone-200 bg-white"
                  )}
                >
                  <div className="flex items-center space-x-2 mb-1">
                    <MapPin className="h-4 w-4" />
                    <span className="font-medium text-sm">Fysisk møde</span>
                  </div>
                  <p className="text-xs text-stone-500">1,5 time + 1 time transport før og efter</p>
                </button>
              </div>
            </div>
          </div>

          {/* Meeting date & time */}
          {isMeeting && (
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Dato</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(meetingDate, "d. MMM", { locale: da })}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={meetingDate}
                      onSelect={(date) => date && setMeetingDate(date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label htmlFor="meeting-start" className="text-sm font-medium">Start</Label>
                <Input
                  id="meeting-start"
                  type="time"
                  step="300"
                  value={meetingStart}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!value) return;
                    // Flyt sluttiden med, så mødets længde bevares
                    const duration = Math.max(15, toMinutes(meetingEnd) - toMinutes(meetingStart));
                    setMeetingStart(value);
                    setMeetingEnd(fromMinutes(toMinutes(value) + duration));
                  }}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="meeting-end" className="text-sm font-medium">Slut</Label>
                <Input
                  id="meeting-end"
                  type="time"
                  step="300"
                  value={meetingEnd}
                  onChange={(e) => setMeetingEnd(e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          {taskType === 'physical-meeting' && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Transport før og efter</Label>
              <Select value={travelBuffer.toString()} onValueChange={(value) => setTravelBuffer(parseInt(value))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0, 15, 30, 45, 60, 90, 120].map(minutes => (
                    <SelectItem key={minutes} value={minutes.toString()}>
                      {minutes === 0 ? 'Ingen transport' : `${minutes} min`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {travelBuffer > 0 && (
                <p className="text-xs text-stone-500">
                  Optager {fromMinutes(toMinutes(meetingStart) - travelBuffer)}–{fromMinutes(toMinutes(meetingEnd) + travelBuffer)} inkl. transport
                </p>
              )}
            </div>
          )}

          {isMeeting && meetingConflicts.length > 0 && (
            <div className="p-3 rounded-lg border-2 border-red-300 bg-red-50 text-sm text-red-800 space-y-1">
              <p className="font-semibold">Tidspunktet er optaget</p>
              {meetingConflicts.map(({ task, reason }) => (
                <p key={task.id}>
                  {reason === 'meeting' ? 'Mødet rammer' : 'Transporten rammer'} «{task.title}»
                  {task.scheduleOverride && ` (${format(new Date(task.scheduleOverride.startTime), 'HH:mm')}–${format(new Date(task.scheduleOverride.endTime), 'HH:mm')}${task.travelBufferMinutes ? ` + ${task.travelBufferMinutes} min transport` : ''})`}
                </p>
              ))}
            </div>
          )}

          {isMeeting && busyToday.length > 0 && (
            <div className="p-3 rounded-lg border bg-slate-50 text-xs text-slate-600 space-y-1">
              <p className="font-medium text-slate-700">Optaget denne dag</p>
              {busyToday.map(({ task, start, end }) => (
                <p key={task.id}>
                  {format(new Date(start), 'HH:mm')}–{format(new Date(end), 'HH:mm')} · {task.title}
                  {task.travelBufferMinutes ? ' (inkl. transport)' : ''}
                </p>
              ))}
            </div>
          )}

          {!isMeeting && (<>
          {/* Duration & Priority Row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Estimeret tid</Label>
              <Select value={estimatedTime.toString()} onValueChange={(value) => setEstimatedTime(parseInt(value) as EstimatedTime)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESTIMATED_TIME_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value.toString()}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Prioritet</Label>
              <Select value={priority} onValueChange={(value) => setPriority(value as Priority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Due Date */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Deadline</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !deadline && "text-stone-500"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {deadline ? format(deadline, "d. MMM", { locale: da }) : <span>Vælg dato</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={deadline}
                  onSelect={(date) => date && setDeadline(date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Recurring Task Toggle */}
          <div className="flex items-center space-x-3">
            <Checkbox
              id="recurring"
              checked={isRecurring}
              onCheckedChange={(checked) => setIsRecurring(checked as boolean)}
            />
            <Label htmlFor="recurring" className="flex items-center space-x-2 text-sm font-medium cursor-pointer">
              <Repeat className="h-4 w-4" />
              <span>Gør opgaven gentagende</span>
            </Label>
          </div>

          {/* Recurrence Settings */}
          {isRecurring && (
            <RecurrenceSettings
              pattern={recurrencePattern}
              onPatternChange={setRecurrencePattern}
            />
          )}

          {/* Overwrite Schedule Toggle */}
          <div className="flex items-center space-x-3">
            <Checkbox
              id="overwrite-schedule"
              checked={isOverwriteSchedule}
              onCheckedChange={(checked) => setIsOverwriteSchedule(checked as boolean)}
            />
            <Label htmlFor="overwrite-schedule" className="flex items-center space-x-2 text-sm font-medium cursor-pointer">
              <Settings className="h-4 w-4" />
              <span>Manuel tidsplacering</span>
            </Label>
          </div>

          {/* Overwrite Schedule Settings */}
          {isOverwriteSchedule && (
            <div className="p-4 border rounded-lg bg-slate-50 space-y-4">
              {/* Start and End DateTime Row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Starttidspunkt</Label>
                  <div className="relative">
                    <Input
                      type="datetime-local"
                      value={formatDateTimeForInput(overwriteStartDateTime)}
                      onChange={(e) => handleDateTimeChange(e.target.value, true)}
                      className="pl-10"
                      step="60"
                      lang="da-DK"
                    />
                    <CalendarIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Sluttidspunkt</Label>
                  <div className="relative">
                    <Input
                      type="datetime-local"
                      value={formatDateTimeForInput(overwriteEndDateTime)}
                      onChange={(e) => handleDateTimeChange(e.target.value, false)}
                      className="pl-10"
                      step="60"
                      lang="da-DK"
                    />
                    <CalendarIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
                  </div>
                </div>
              </div>

              {/* Also Override Breaks */}
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="override-breaks"
                  checked={overrideBreaks}
                  onCheckedChange={(checked) => setOverrideBreaks(checked as boolean)}
                />
                <Label htmlFor="override-breaks" className="text-sm font-medium cursor-pointer">
                  Tilsidesæt også pauser
                </Label>
              </div>
            </div>
          )}

          </>)}

          {/* Zone Assignment Preview */}
          {(predictedZone || multiZonePreview) && !isOverwriteSchedule && !isMeeting && (
            <div className={`p-4 rounded-lg border-2 ${multiZonePreview ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-300' : getPredictedZoneInfo().color}`}>
              <div className="flex items-center space-x-2 mb-2">
                <MapPin className="h-4 w-4" />
                <span className="font-medium">
                  {multiZonePreview ? 'Fordeles på flere zoner:' : 'Placeres i:'}
                </span>
              </div>
              <div className="text-sm">
                {multiZonePreview ? (
                  <div>
                    <p className="font-semibold text-blue-800">{multiZonePreview}</p>
                    <p className="opacity-75 text-xs mt-1">
                      Opgaven deles op på flere zoner for at optimere arbejdsgangen
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="font-semibold">{getPredictedZoneInfo().name}</p>
                    <p className="opacity-75">
                      {predictedDate ? `${format(predictedDate, 'EEEE d. MMMM', { locale: da })}, ` : ''}{getPredictedZoneInfo().timeSlot}
                    </p>
                  </>
                )}
                {isRecurring && (
                  <p className="text-xs mt-1 opacity-60">
                    Hver forekomst placeres automatisk i den bedste zone
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Overwrite Schedule Preview */}
          {isOverwriteSchedule && !isMeeting && (
            <div className="p-4 rounded-lg border-2 bg-orange-100 border-orange-300 text-orange-800">
              <div className="flex items-center space-x-2 mb-2">
                <Settings className="h-4 w-4" />
                <span className="font-medium">Manuel tidsplacering aktiv:</span>
              </div>
              <div className="text-sm">
                <p className="font-semibold">
                  {DanishTimeManager.formatDanishTime(overwriteStartDateTime, "dd/MM-yyyy HH:mm")} til {DanishTimeManager.formatDanishTime(overwriteEndDateTime, "dd/MM-yyyy HH:mm")}
                </p>
                <p className="opacity-75">
                  Opgaven optager alle ledige pladser i dette tidsrum
                  {overrideBreaks && " (inklusive pauser)"}
                </p>
              </div>
            </div>
          )}

          {/* Comments Section */}
          <Collapsible open={isCommentsOpen} onOpenChange={setIsCommentsOpen}>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="outline" className="w-full justify-between">
                <div className="flex items-center space-x-2">
                  <MessageSquare className="h-4 w-4" />
                  <span>Kommentarer ({comments.length})</span>
                </div>
                <ChevronDown className={cn("h-4 w-4 transition-transform", isCommentsOpen && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 mt-3">
              {/* Existing Comments */}
              {comments.length > 0 && (
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {comments.map((comment, index) => (
                    <div key={index} className="flex items-start justify-between p-2 bg-stone-100 rounded text-sm">
                      <span className="flex-1">{comment}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeComment(index)}
                        className="h-6 w-6 p-0 ml-2"
                      >
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Add New Comment */}
              <div className="flex space-x-2">
                <Input
                  placeholder="Tilføj en kommentar..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addComment()}
                />
                <Button type="button" onClick={addComment} disabled={!newComment.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Submit Button */}
          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Annuller
            </Button>
            <Button 
              type="submit" 
              className="bg-blue-600 hover:bg-blue-700"
              disabled={!title.trim() || (isMeeting && meetingConflicts.length > 0)}
            >
              {isEditing ? 'Gem ændringer' : (isRecurring ? 'Opret gentagende opgave' : 'Ny opgave')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
