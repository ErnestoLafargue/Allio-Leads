"use client";

import React from 'react';
import { Card } from './ui';
import { Button } from './ui';
import { Badge } from './ui';
import { Progress } from './ui';
import { CheckCircle, Clock, Users, UserCheck, Mail, BookOpen, Target, ArrowRight, Calendar } from 'lucide-react';
import { ZoneTask } from '@/lib/flowzone/zones';
import { useCustomZones } from '@/lib/flowzone/use-custom-zones';
import { ZoneAssigner } from '@/lib/flowzone/zone-assignment';
import type { UserStats } from './flowzone-app';
import { ZoneTimer } from './zone-timer';
import { ActiveZoneCard } from './active-zone-card';

import { useZoneTransition } from '@/lib/flowzone/use-zone-transition';
import { getZoneIdAt, getZoneOrder, isZonePast, isWeekendDay } from '@/lib/flowzone/zone-manager';
import { WeekendPanel } from './weekend-panel';

const PRIORITY_LABELS: Record<string, string> = { high: 'Høj', medium: 'Mellem', low: 'Lav' };

interface DashboardProps {
  tasks: ZoneTask[];
  userStats: UserStats;
  zoneAssigner: ZoneAssigner;
  onTaskComplete: (taskId: string) => void;
  onTaskSpillover?: (taskId: string, remainingTime: number, newZoneId: string) => void;
  onTaskEdit?: (task: ZoneTask) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  tasks,
  userStats,
  zoneAssigner,
  onTaskComplete,
  onTaskSpillover,
  onTaskEdit,
}) => {
  const { zones } = useCustomZones();
  const today = new Date();
  const currentHour = today.getHours();

  // Zone transition management
  const { currentZone: detectedCurrentZone } = useZoneTransition({
    tasks,
    zoneAssigner,
    onTaskSpillover: (spillover) => {
      if (onTaskSpillover) {
        onTaskSpillover(spillover.originalTaskId, spillover.remainingTime, spillover.newZoneId);
      }
    },
    onZoneChange: (newZone, previousZone) => {
      console.log(`Zone transition: ${previousZone} → ${newZone}`);
    }
  });
  
  const todayTasks = tasks.filter(task => 
    task.deadline.toDateString() === today.toDateString() && !task.completed
  );

  const completedToday = tasks.filter(task => 
    task.deadline.toDateString() === today.toDateString() && task.completed
  ).length;

  const totalToday = tasks.filter(task => 
    task.deadline.toDateString() === today.toDateString()
  ).length;

  const completionPercentage = totalToday > 0 ? (completedToday / totalToday) * 100 : 0;

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

  const getCurrentZone = () => getZoneIdAt(today);

  const getNextZone = () => {
    const currentZone = getCurrentZone();
    const zoneOrder = getZoneOrder();
    const currentIndex = currentZone ? zoneOrder.indexOf(currentZone) : -1;
    return currentIndex >= 0 && currentIndex < zoneOrder.length - 1 ? zoneOrder[currentIndex + 1] : null;
  };

  const formatDuration = (minutes: number): string => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) return `${hours} t`;
    return `${hours} t ${remainingMinutes} min`;
  };

  const TaskCard: React.FC<{ task: ZoneTask; isNext?: boolean }> = ({ task, isNext = false }) => (
    <div 
      className={`group p-4 rounded-md transition-all duration-200 hover:shadow-sm cursor-pointer border ${
        isNext 
          ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200' 
          : 'bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50'
      }`}
      onClick={() => onTaskEdit?.(task)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-3">
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onTaskComplete(task.id);
            }}
            className="h-9 w-9 p-0 rounded-md hover:bg-green-50 hover:text-green-600 transition-all duration-200 border border-transparent hover:border-green-200"
          >
            <CheckCircle className="h-4 w-4" />
          </Button>
          <div className={`p-2 rounded-md ${isNext ? 'bg-blue-100' : 'bg-gray-100'} transition-transform duration-200`}>
            {getTaskTypeIcon(task.taskType)}
          </div>
        </div>
        {isNext && (
          <div className="flex items-center space-x-2 bg-stone-900 text-white px-3 py-1 rounded-full text-xs font-medium">
            <ArrowRight className="h-3 w-3" />
            Næste
          </div>
        )}
      </div>
      
      <div className="space-y-2">
        <h4 className={`text-sm font-medium leading-relaxed ${
          isNext ? 'text-blue-900' : 'text-gray-700'
        }`}>
          {task.title}
        </h4>
        
        <div className="flex items-center space-x-3">
          <Badge 
            variant="secondary" 
            className={`${getPriorityColor(task.priority)} text-xs px-3 py-1 rounded-full font-medium border-0`}
          >
            {PRIORITY_LABELS[task.priority] ?? task.priority}
          </Badge>
          <div className="flex items-center space-x-1.5 text-gray-500">
            <Clock className="h-4 w-4" />
            <span className="text-sm">
              {formatDuration(task.estimatedTime)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  const currentZone = detectedCurrentZone || getCurrentZone();
  const nextZone = getNextZone();
  
  // Get current zone details and tasks
  const currentZoneDetails = currentZone ? zones.find(zone => zone.id === currentZone) : null;
  const currentZoneTasks = currentZoneDetails ? 
    zoneAssigner.getZoneTasks(currentZoneDetails.id) : [];
  const currentZoneUtilization = currentZoneDetails ? zoneAssigner.getZoneUtilization(currentZoneDetails.id) : 0;

  return (
    <div className="p-6 space-y-6">

      {/* Weekend: ét felt med de næste opgaver, når man har stemplet ind */}
      {isWeekendDay(today) && (
        <div className="relative" style={{ minHeight: 320 }}>
          <div className="absolute inset-0">
            <WeekendPanel date={today} tasks={tasks} zoneAssigner={zoneAssigner} onTaskEdit={onTaskEdit} onTaskComplete={onTaskComplete} />
          </div>
        </div>
      )}

      {/* Active Zone Card */}
      {currentZoneDetails && (
        <ActiveZoneCard
          zone={currentZoneDetails}
          tasks={currentZoneTasks}
          utilization={currentZoneUtilization}
          onTaskComplete={onTaskComplete}
          onTaskEdit={onTaskEdit}
          currentZone={currentZone}
          onZoneSpillover={(taskId, remainingTime) => {
            if (onTaskSpillover) {
              onTaskSpillover(taskId, remainingTime, 'flex-work');
            }
          }}
        />
      )}

      {/* Current Zone & Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Current Zone Status */}
        <Card className="lg:col-span-2 p-6 border-gray-100 rounded-md">
          <div className="flex items-center space-x-3 mb-6">
            <Calendar className="h-5 w-5 text-stone-900" />
            <h3 className="text-sm font-medium text-gray-700">Dagens zoner</h3>
          </div>
          
          <div className="space-y-3">
            {zones.map((zone, index) => {
              const isActive = zone.id === currentZone;
              const isPast = isZonePast(zone, today);
              const isComing = !isActive && !isPast;
              
              return (
                <div key={zone.id} className={`flex items-center space-x-3 p-3 rounded-md border-gray-100 border transition-all hover:shadow-sm ${
                  isActive ? zone.color + ' border-opacity-100' : 
                  isPast ? 'bg-gray-50 border-gray-100 opacity-60' :
                  'bg-white hover:bg-gray-50'
                }`}>
                  <div className={`w-3 h-3 rounded-full ${
                    isActive ? 'bg-current animate-pulse' :
                    isPast ? 'bg-gray-400' : 'bg-gray-300'
                  }`} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${isActive ? '' : isPast ? 'text-gray-500' : 'text-gray-700'}`}>
                        {zone.name}
                      </span>
                      <span className={`text-sm ${isActive ? '' : isPast ? 'text-gray-400' : 'text-gray-500'}`}>
                        {zone.timeSlot}
                      </span>
                    </div>
                  </div>
                  {isActive && (
                    <Badge className="bg-green-600 text-white px-3 py-1 text-xs font-medium">
                      Aktiv nu
                    </Badge>
                  )}
                  {zone.id === nextZone && (
                    <Badge variant="outline" className="border-gray-200 text-gray-700 px-3 py-1 text-xs font-medium">
                      Næste
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Up Next Tasks */}
        <Card className="p-6 border-gray-100 rounded-md">
          <h3 className="text-sm font-medium text-gray-700 mb-6">Næste opgaver</h3>
          <div className="space-y-4">
            {todayTasks.slice(0, 3).map((task, index) => (
              <TaskCard key={task.id} task={task} isNext={index === 0} />
            ))}
            {todayTasks.length === 0 && (
              <div className="text-center py-6">
                <Clock className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">Ingen opgaver tilbage</p>
                <p className="text-xs text-gray-400">Godt arbejde i dag!</p>
              </div>
            )}
          </div>
        </Card>
      </div>

    </div>
  );
};
