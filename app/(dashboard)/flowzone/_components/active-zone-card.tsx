"use client";

import React from 'react';
import { Card } from './ui';
import { Button } from './ui';
import { Badge } from './ui';
import { Progress } from './ui';
import { 
  CheckCircle, 
  Clock, 
  Users, 
  UserCheck, 
  Mail, 
  BookOpen, 
  Target 
} from 'lucide-react';
import { ZoneTask, TimeZone } from '@/lib/flowzone/zones';
import { TaskTimer } from './task-timer';

const PRIORITY_LABELS: Record<string, string> = { high: 'Høj', medium: 'Mellem', low: 'Lav' };

interface ActiveZoneCardProps {
  zone: TimeZone;
  tasks: ZoneTask[];
  utilization: number;
  onTaskComplete: (taskId: string) => void;
  onTaskEdit?: (task: ZoneTask) => void;
  currentZone?: string | null;
  onZoneSpillover?: (taskId: string, remainingTime: number) => void;
}

export const ActiveZoneCard: React.FC<ActiveZoneCardProps> = ({
  zone,
  tasks,
  utilization,
  onTaskComplete,
  onTaskEdit,
  currentZone,
  onZoneSpillover
}) => {

  const getTaskTypeIcon = (taskType: string) => {
    switch (taskType) {
      case 'internal-meeting': return <Users className="h-4 w-4" />;
      case 'client-meeting': return <UserCheck className="h-4 w-4" />;
      case 'admin': return <Mail className="h-4 w-4" />;
      case 'learning': return <BookOpen className="h-4 w-4" />;
      case 'deep-work': return <Target className="h-4 w-4" />;
      default: return <Target className="h-4 w-4" />;
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

  const formatDuration = (minutes: number): string => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) return `${hours} t`;
    return `${hours} t ${remainingMinutes} min`;
  };

  const usedTime = tasks.reduce((sum, task) => sum + task.estimatedTime, 0);
  const remainingTime = zone.capacity - usedTime;

  const handleTaskComplete = (taskId: string) => {
    console.log(`Task ${taskId} completed`);
    onTaskComplete(taskId);
  };

  const handleTimerComplete = (taskId: string, totalTime?: number) => {
    console.log(`Task ${taskId} timer stopped. Total time: ${totalTime} seconds`);
    // Optionally auto-complete the task when timer is stopped
    // onTaskComplete(taskId);
  };

  return (
    <Card className="p-6 bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
          <div>
            <h3 className="text-lg font-semibold text-green-900">{zone.name}</h3>
            <p className="text-sm font-medium text-gray-700">{zone.timeSlot}</p>
          </div>
          <Badge className="bg-green-600 text-white px-3 py-1">
            Aktiv nu
          </Badge>
        </div>
        
        <div className="text-right">
          <p className="text-sm font-medium text-gray-700">
            {formatDuration(usedTime)} / {formatDuration(zone.capacity)}
          </p>
          <p className="text-xs text-gray-500">
            {formatDuration(remainingTime)} tilbage
          </p>
        </div>
      </div>

      {/* Zone Utilization */}
      <div className="mb-6">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-sm font-medium text-gray-700">Udnyttelse af zonen</span>
          <span className="text-sm font-medium text-gray-700">{Math.round(utilization)}%</span>
        </div>
        <Progress 
          value={utilization} 
          className="h-2 bg-green-100" 
        />
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-gray-700">Opgaver i zonen</h4>
          <span className="text-sm text-gray-500">
            {tasks.length} {tasks.length === 1 ? 'opgave' : 'opgaver'}
          </span>
        </div>
        
        {tasks.length === 0 ? (
          <div className="text-center py-6 bg-gray-50 rounded-md border border-gray-100">
            <Clock className="h-8 w-8 mx-auto text-gray-400 mb-2" />
            <p className="text-sm font-medium text-gray-700">Ingen opgaver i denne zone</p>
            <p className="text-xs text-gray-500">Perfekt tid til en pause eller planlægning</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {tasks.map((task) => (
              <div 
                key={task.id}
                className="flex items-center justify-between p-4 bg-white rounded-md border border-gray-200 hover:shadow-sm transition-all cursor-pointer"
                onClick={() => onTaskEdit?.(task)}
              >
                <div className="flex items-center space-x-3 flex-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTaskComplete(task.id);
                    }}
                    className="h-9 w-9 p-0 rounded-full border border-gray-200 hover:bg-gray-50 hover:border-gray-300 focus:ring-2 focus:ring-blue-500/20"
                  >
                    <CheckCircle className="h-4 w-4" />
                  </Button>
                  
                  <div className="flex items-center space-x-2">
                    {getTaskTypeIcon(task.taskType)}
                  </div>
                  
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-700 leading-relaxed">{task.title}</p>
                    <div className="flex items-center space-x-2 mt-1">
                      <Badge className={getPriorityColor(task.priority)}>
                        {PRIORITY_LABELS[task.priority] ?? task.priority}
                      </Badge>
                      <span className="text-xs text-gray-500 flex items-center">
                        <Clock className="h-3 w-3 mr-1" />
                        ca. {task.estimatedTime} min
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Task Timer */}
                <div className="ml-4" onClick={(e) => e.stopPropagation()}>
                  <TaskTimer
                    taskId={task.id}
                    estimatedTime={task.estimatedTime}
                    onComplete={handleTimerComplete}
                    currentZone={currentZone}
                    onZoneSpillover={onZoneSpillover}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};
