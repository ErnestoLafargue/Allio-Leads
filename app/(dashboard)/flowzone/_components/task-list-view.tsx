"use client";

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui';
import { Button } from './ui';
import { Input } from './ui';
import { Badge } from './ui';
import { 
  ChevronUp, 
  ChevronDown, 
  Search, 
  CheckCircle2,
  Clock,
  GripVertical
} from 'lucide-react';
import { ZoneTask } from '@/lib/flowzone/zones';
import { format, isAfter, isToday, isBefore } from 'date-fns';
import { da } from 'date-fns/locale';
import { DAILY_ZONES, isMeetingType } from '@/lib/flowzone/zones';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface TaskListViewProps {
  tasks: ZoneTask[];
  onTaskComplete: (taskId: string) => void;
  onTaskReorder?: (reorderedTasks: ZoneTask[]) => void;
}

interface SortableTaskRowProps {
  task: ZoneTask;
  onTaskComplete: (taskId: string) => void;
}

const PRIORITY_LABELS: Record<string, string> = {
  high: 'Høj',
  medium: 'Mellem',
  low: 'Lav',
};

type SortField = 'title' | 'priority' | 'taskType' | 'estimatedTime' | 'deadline' | 'assignedZone' | 'createdAt' | 'custom';
type SortDirection = 'asc' | 'desc';

const SortableTaskRow: React.FC<SortableTaskRowProps> = ({ task, onTaskComplete }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const getPriorityColor = (priority: string) => {
    const colors = {
      high: 'bg-red-100 text-red-800 border-red-200',
      medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      low: 'bg-green-100 text-green-800 border-green-200'
    } as const;
    return colors[priority as keyof typeof colors] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getTaskTypeIcon = (taskType: string) => {
    switch (taskType) {
      case 'deep-work':
        return '🎯';
      case 'internal-meeting':
      case 'external-meeting':
        return '👥';
      case 'admin':
        return '📧';
      case 'quick-wins':
        return '⚡';
      case 'flex':
        return '🔄';
      case 'free-work':
        return '✍️';
      case 'online-meeting':
        return '💻';
      case 'physical-meeting':
        return '🤝';
      default:
        return '📋';
    }
  };

  const getDeadlineStatus = (deadline: Date) => {
    const now = new Date();
    if (isBefore(deadline, now) && !isToday(deadline)) {
      return { color: 'text-red-600', urgent: true };
    }
    if (isToday(deadline)) {
      return { color: 'text-orange-600', urgent: true };
    }
    return { color: 'text-slate-600', urgent: false };
  };

  const deadlineStatus = getDeadlineStatus(task.deadline);

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`group relative bg-white rounded-xl border border-slate-200 p-4 mb-3 transition-all duration-200 hover:shadow-md hover:border-slate-300 ${isDragging ? 'shadow-lg border-blue-300' : ''}`}
    >
      {/* Drag handle */}
      <div
        className="absolute left-2 top-1/2 transform -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4 text-slate-400" />
      </div>

      <div className="flex items-center justify-between">
        {/* Left side - Main content */}
        <div className="flex items-center space-x-4 flex-1 ml-6">
          {/* Complete button */}
          <button
            onClick={() => onTaskComplete(task.id)}
            className="flex-shrink-0 w-6 h-6 rounded-full border-2 border-slate-300 hover:border-green-500 hover:bg-green-50 transition-colors duration-200 flex items-center justify-center group/check"
          >
            <CheckCircle2 className="w-4 h-4 text-transparent group-hover/check:text-green-500 transition-colors" />
          </button>

          {/* Task type icon */}
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-lg">
            {getTaskTypeIcon(task.taskType)}
          </div>

          {/* Task details */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-900 text-lg truncate">{task.title}</h3>
            <div className="flex items-center space-x-3 mt-1">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getPriorityColor(task.priority)}`}>
                {PRIORITY_LABELS[task.priority] ?? task.priority}
              </span>
              
              <div className="flex items-center text-slate-500 text-sm">
                <Clock className="w-4 h-4 mr-1" />
                <span>{task.estimatedTime} min</span>
              </div>
              
              {task.isRecurring && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
                  🔄 Gentagende
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right side - Status and actions */}
        <div className="flex items-center space-x-3">
          {deadlineStatus.urgent && (
            <div className="text-sm font-medium text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
              Næste
            </div>
          )}
          
          <div className={`text-sm ${deadlineStatus.color}`}>
            {task.scheduleOverride && isMeetingType(task.taskType)
              ? `${format(new Date(task.scheduleOverride.startTime), 'd. MMM HH:mm', { locale: da })}–${format(new Date(task.scheduleOverride.endTime), 'HH:mm')}`
              : format(task.deadline, 'd. MMM', { locale: da })}
          </div>
          
          {task.assignedZone && (
            <div className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
              {DAILY_ZONES.find(z => z.id === task.assignedZone)?.name ?? (task.assignedZone === 'schedule-override' ? (isMeetingType(task.taskType) ? (task.taskType === 'online-meeting' ? 'Online møde' : 'Fysisk møde') : 'Manuel tidsplacering') : task.assignedZone.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const TaskListView: React.FC<TaskListViewProps> = ({ tasks, onTaskComplete, onTaskReorder }) => {
  const [sortField, setSortField] = useState<SortField>('deadline');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [searchTerm, setSearchTerm] = useState('');
  const [isCustomOrder, setIsCustomOrder] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Filter only outstanding (incomplete) tasks
  const outstandingTasks = tasks.filter(task => !task.completed);

  const handleSort = (field: SortField) => {
    if (field === 'custom') {
      setIsCustomOrder(true);
      setSortField('custom');
      return;
    }
    
    setIsCustomOrder(false);
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />;
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = filteredAndSortedTasks.findIndex(task => task.id === active.id);
      const newIndex = filteredAndSortedTasks.findIndex(task => task.id === over?.id);
      
      const reorderedTasks = arrayMove(filteredAndSortedTasks, oldIndex, newIndex);
      
      // Update custom priority order
      const updatedTasks = reorderedTasks.map((task, index) => ({
        ...task,
        customPriorityOrder: index
      }));

      if (onTaskReorder) {
        onTaskReorder(updatedTasks);
      }
    }
  };

  const filteredAndSortedTasks = useMemo(() => {
    let filtered = outstandingTasks;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(task =>
        task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.taskType.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.assignedZone?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply sorting
    if (isCustomOrder || sortField === 'custom') {
      return filtered.sort((a, b) => {
        // First sort by priority level
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        const aPriority = priorityOrder[a.priority as keyof typeof priorityOrder];
        const bPriority = priorityOrder[b.priority as keyof typeof priorityOrder];
        
        if (aPriority !== bPriority) {
          return bPriority - aPriority; // High to low
        }
        
        // Then by custom order
        const aOrder = a.customPriorityOrder ?? 999;
        const bOrder = b.customPriorityOrder ?? 999;
        return aOrder - bOrder;
      });
    }

    return filtered.sort((a, b) => {
      let aValue: any = a[sortField as keyof ZoneTask];
      let bValue: any = b[sortField as keyof ZoneTask];

      // Handle date sorting
      if (sortField === 'deadline' || sortField === 'createdAt') {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      }

      // Handle priority sorting (high > medium > low)
      if (sortField === 'priority') {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        aValue = priorityOrder[aValue as keyof typeof priorityOrder];
        bValue = priorityOrder[bValue as keyof typeof priorityOrder];
      }

      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
  }, [outstandingTasks, searchTerm, sortField, sortDirection, isCustomOrder]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center space-x-2">
              <span>Udestående opgaver</span>
              <Badge variant="secondary" className="ml-2">
                {filteredAndSortedTasks.length}
              </Badge>
            </CardTitle>
            <div className="flex items-center space-x-4">
              <Button
                variant={isCustomOrder ? "default" : "outline"}
                size="sm"
                onClick={() => handleSort('custom')}
                className="text-sm"
              >
                Egen rækkefølge
              </Button>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Søg i opgaver..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
            </div>
          </div>
          {isCustomOrder && filteredAndSortedTasks.length > 0 && (
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center space-x-2 text-blue-700">
                <GripVertical className="w-4 h-4" />
                <span className="text-sm font-medium">
                  Træk og slip opgaver for at ændre deres prioritering
                </span>
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-6">
          <DndContext 
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext 
              items={filteredAndSortedTasks.map(task => task.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {filteredAndSortedTasks.map((task) => (
                  <SortableTaskRow
                    key={task.id}
                    task={task}
                    onTaskComplete={onTaskComplete}
                  />
                ))}
              </div>
            </SortableContext>
            
            {filteredAndSortedTasks.length === 0 && (
              <div className="text-center py-12">
                <div className="text-slate-400 text-lg mb-2">Ingen udestående opgaver</div>
                <div className="text-slate-500 text-sm">
                  {searchTerm ? 'Prøv at justere din søgning' : 'Alle opgaver er fuldført!'}
                </div>
              </div>
            )}
          </DndContext>
        </CardContent>
      </Card>
    </div>
  );
};
