"use client";

import React, { useState, useEffect } from 'react';
import { TaskInputModal } from './task-input-modal';
import { Dashboard } from './dashboard';
import { CalendarView } from './calendar-view';
import { WeeklyCalendarView } from './weekly-calendar-view';
import { TaskListView } from './task-list-view';
import { AudioSettingsPopup } from './audio-settings-popup';
import { Button } from './ui';
import { Card } from './ui';
import { Tabs, TabsContent, TabsList, TabsTrigger, Toaster } from './ui';
import { Plus, Calendar, Home, CalendarDays, List, BarChart3 } from 'lucide-react';
import { ZoneTask } from '@/lib/flowzone/zones';
import { ZoneAssigner } from '@/lib/flowzone/zone-assignment';
import { TaskRecurrenceManager } from '@/lib/flowzone/task-recurrence';
import { ProductivityAnalytics } from './productivity-analytics';
import { useProductivityAnalytics } from '@/lib/flowzone/use-productivity-analytics';
import { useFlowZoneTasks } from '@/lib/flowzone/use-flowzone-tasks';
import { useZoneSounds } from '@/lib/flowzone/use-zone-sounds';
import { FlowZoneUserContext, loadCallHistory } from '@/lib/flowzone/use-call-activity';
import { FlowZoneUserSwitcher, type FlowZoneUser } from './flowzone-user-switcher';

export interface UserStats {
  xp: number;
  level: number;
  tasksCompleted: number;
  streaks: Record<string, number>;
  achievements: string[];
  frogsCompleted: number;
  pomodorosCompleted: number;
}

export function FlowZoneApp({ ownUserId, ownUserName }: { ownUserId: string; ownUserName: string }) {
  // Admins kan se og arbejde i en anden admins FlowZone
  const [viewUserId, setViewUserId] = useState(ownUserId);
  const [viewUserName, setViewUserName] = useState(ownUserName);
  const viewingOther = viewUserId !== ownUserId;
  const { tasks, setTasks, loading: tasksLoading, error: tasksError } = useFlowZoneTasks(viewUserId, ownUserId);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ZoneTask | undefined>(undefined);
  const [zoneAssigner, setZoneAssigner] = useState<ZoneAssigner>(new ZoneAssigner());
  const [userStats, setUserStats] = useState<UserStats>({
    xp: 245,
    level: 3,
    tasksCompleted: 12,
    streaks: { workout: 7, meditation: 3, reading: 12 },
    achievements: ['Task Master', 'Zone Optimizer'],
    frogsCompleted: 3,
    pomodorosCompleted: 8
  });

  const { addTaskCompletion } = useProductivityAnalytics();

  // Zonelyde (zonestart, advarsler og dagens afslutning) mens FlowZone er åben
  useZoneSounds();

  // Opkaldshistorikken til graferne hentes med det samme, så den er klar når man åbner Dagens zoner
  useEffect(() => {
    void loadCallHistory(viewUserId);
  }, [viewUserId]);

  const handleViewUserChange = (user: FlowZoneUser) => {
    setViewUserId(user.id);
    setViewUserName(user.name);
  };

  // Update zone assigner when tasks change
  useEffect(() => {
    setZoneAssigner(new ZoneAssigner(tasks));
  }, [tasks]);

  const handleTaskCreate = (newTask: Omit<ZoneTask, 'id' | 'createdAt' | 'completed' | 'assignedZone'>) => {
    console.log('🔍 DEBUG: Creating new task:', newTask);
    
    const task: ZoneTask = {
      ...newTask,
      id: Date.now().toString(),
      createdAt: new Date(),
      completed: false,
      scheduledTime: new Date(), // Set scheduledTime to today
    };

    console.log('🔍 DEBUG: Task after initial creation:', task);

    // Check if schedule override is active
    if (task.scheduleOverride) {
      console.log('🚨 DEBUG: Schedule override detected!', {
        startTime: task.scheduleOverride.startTime,
        endTime: task.scheduleOverride.endTime,
        overrideBreaks: task.scheduleOverride.overrideBreaks
      });
      
      // For schedule override, we might want to handle zone assignment differently
      task.assignedZone = 'schedule-override';
    } else {
      // Assign task to zone normally
      const updatedAssigner = new ZoneAssigner([...tasks]);
      const assignmentResult = updatedAssigner.assignTaskToZone(task);
      
      if (assignmentResult.isMultiZone && assignmentResult.taskSegments) {
        // Handle multi-zone assignment by replacing the original task with segments
        console.log('🔍 DEBUG: Multi-zone assignment:', assignmentResult);
        const newTasks = assignmentResult.taskSegments;
        
        // Add segments for non-recurring tasks
        if (!task.isRecurring) {
          setTasks(prev => [...prev, ...newTasks]);
          return;
        } else {
          // For recurring tasks, we need to handle segments differently
          // For now, just use the first segment's zone
          task.assignedZone = assignmentResult.taskSegments[0]?.assignedZone;
        }
      } else {
        task.assignedZone = assignmentResult.assignedZone;
      }
      console.log('🔍 DEBUG: Normal zone assignment:', assignmentResult);
    }

    const newTasks = [task];

    // If it's a recurring task, generate future instances
    if (task.isRecurring && task.recurrencePattern) {
      const instances = TaskRecurrenceManager.generateRecurringInstances(
        {
          title: task.title,
          estimatedTime: task.estimatedTime,
          priority: task.priority,
          taskType: task.taskType,
          deadline: task.deadline,
          isRecurring: true,
          recurrencePattern: task.recurrencePattern,
          parentTaskId: task.id,
          nextDueDate: task.nextDueDate
        },
        task.recurrencePattern
      );

      // Create and assign zones for each instance
      instances.forEach((instance, index) => {
        const instanceTask: ZoneTask = {
          ...instance,
          id: `${task.id}-${index + 1}`,
          createdAt: new Date(),
          completed: false,
        };

        const instanceAssigner = new ZoneAssigner([...tasks, ...newTasks]);
        instanceTask.assignedZone = instanceAssigner.assignTaskToZoneSimple(instanceTask);
        newTasks.push(instanceTask);
      });
    }

    setTasks(prev => [...prev, ...newTasks]);
  };

  const handleTaskSpillover = (taskId: string, remainingTime: number, newZoneId: string) => {
    setTasks(prev => prev.map(task => {
      if (task.id === taskId) {
        // Find the closest valid EstimatedTime
        const validTimes = [15, 30, 45, 60, 90, 120, 180, 240, 480];
        const estimatedTime = validTimes.find(time => time >= remainingTime) || validTimes[validTimes.length - 1];
        
        return {
          ...task,
          assignedZone: newZoneId,
          estimatedTime: estimatedTime as any,
          title: task.title + ' (fortsat)'
        };
      }
      return task;
    }));
  };

  const handleTaskComplete = (taskId: string, actualTimeSpent?: number) => {
    setTasks(prev => prev.map(task => {
      if (task.id === taskId) {
        const completedTask = { ...task, completed: true };
        
        // Record analytics data if actual time is provided
        if (actualTimeSpent !== undefined) {
          addTaskCompletion(
            taskId,
            task.title,
            task.estimatedTime,
            Math.round(actualTimeSpent / 60) // Convert seconds to minutes
          );
        }
        
        // If it's a recurring task and should generate a new instance
        if (TaskRecurrenceManager.shouldGenerateNewInstance(completedTask)) {
          const nextInstance = TaskRecurrenceManager.createNextInstance(completedTask);
          
          if (nextInstance) {
            // Add the new instance
            setTimeout(() => {
              const newInstanceTask: ZoneTask = {
                ...nextInstance,
                id: `${taskId}-next-${Date.now()}`,
                createdAt: new Date(),
                completed: false,
              };

              const instanceAssigner = new ZoneAssigner(tasks);
              newInstanceTask.assignedZone = instanceAssigner.assignTaskToZoneSimple(newInstanceTask);
              
              setTasks(prevTasks => [...prevTasks, newInstanceTask]);
            }, 0);
          }
        }
        
        return completedTask;
      }
      return task;
    }));
    
    const task = tasks.find(t => t.id === taskId);
    if (task) {
      setUserStats(prev => ({
        ...prev,
        xp: prev.xp + (task.priority === 'high' ? 50 : task.priority === 'medium' ? 30 : 20),
        tasksCompleted: prev.tasksCompleted + 1
      }));
    }
  };

  const handleTaskReorder = (reorderedTasks: ZoneTask[]) => {
    setTasks(prev => {
      const updatedTasks = [...prev];
      
      // Update the reordered tasks in the main tasks array
      reorderedTasks.forEach(reorderedTask => {
        const index = updatedTasks.findIndex(task => task.id === reorderedTask.id);
        if (index !== -1) {
          updatedTasks[index] = reorderedTask;
        }
      });
      
      return updatedTasks;
    });
  };

  const handleTaskEdit = (task: ZoneTask) => {
    setEditingTask(task);
    setIsTaskModalOpen(true);
  };

  const handleTaskUpdate = (updatedTask: ZoneTask) => {
    setTasks(prevTasks => 
      prevTasks.map(task => 
        task.id === updatedTask.id ? updatedTask : task
      )
    );
    setEditingTask(undefined);
    setIsTaskModalOpen(false);
  };

  const handleTaskModalClose = () => {
    setEditingTask(undefined);
    setIsTaskModalOpen(false);
  };

  return (
    <FlowZoneUserContext.Provider value={viewUserId}>
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">FlowZone</h1>
        {viewingOther ? (
          <p className="text-sm text-stone-500">
            Du ser <span className="font-medium text-stone-800">{viewUserName}</span>s FlowZone — ændringer gemmes hos {viewUserName.split(' ')[0]}
          </p>
        ) : (
          <p className="text-sm text-stone-500">Planlæg dagen i tidszoner</p>
        )}
        {tasksError && <p className="mt-1 text-sm text-red-600">{tasksError}</p>}
        {tasksLoading && <p className="mt-1 text-sm text-stone-400">Henter opgaver…</p>}
      </div>

      {/* Main Content */}
      <div>
        <Tabs defaultValue="dashboard" className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <TabsList className="grid w-full grid-cols-4 sm:w-[560px]">
              <TabsTrigger value="dashboard" className="flex items-center space-x-2">
                <Home className="w-4 h-4" />
                <span>Overblik</span>
              </TabsTrigger>
              <TabsTrigger value="calendar" className="flex items-center space-x-2">
                <Calendar className="w-4 h-4" />
                <span>Dagens zoner</span>
              </TabsTrigger>
              <TabsTrigger value="weekly" className="flex items-center space-x-2">
                <CalendarDays className="w-4 h-4" />
                <span>Uge</span>
              </TabsTrigger>
              <TabsTrigger value="list" className="flex items-center space-x-2">
                <List className="w-4 h-4" />
                <span>Liste</span>
              </TabsTrigger>
            </TabsList>

            <FlowZoneUserSwitcher value={viewUserId} ownUserId={ownUserId} onChange={handleViewUserChange} />

            <div className="ml-auto flex items-center gap-2">
              <AudioSettingsPopup />

              <Button
                onClick={() => setIsAnalyticsOpen(true)}
                variant="outline"
                size="sm"
                aria-label="Statistik"
                title="Statistik"
              >
                <BarChart3 className="w-4 h-4" />
              </Button>

              <Button
                onClick={() => setIsTaskModalOpen(true)}
                size="sm"
                className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700"
              >
                <Plus className="w-4 h-4" />
                Ny opgave
              </Button>
            </div>
          </div>

          <TabsContent value="dashboard">
        <Dashboard
          tasks={tasks}
          userStats={userStats}
          zoneAssigner={zoneAssigner}
          onTaskComplete={handleTaskComplete}
          onTaskSpillover={handleTaskSpillover}
          onTaskEdit={handleTaskEdit}
        />
          </TabsContent>
          
          <TabsContent value="calendar">
            <CalendarView tasks={tasks} zoneAssigner={zoneAssigner} onTaskEdit={handleTaskEdit} onTaskComplete={handleTaskComplete} />
          </TabsContent>
          
          <TabsContent value="weekly">
            <WeeklyCalendarView tasks={tasks} zoneAssigner={zoneAssigner} onTaskEdit={handleTaskEdit} onTaskComplete={handleTaskComplete} />
          </TabsContent>
          
          <TabsContent value="list">
            <TaskListView 
              tasks={tasks}
              onTaskComplete={handleTaskComplete}
              onTaskReorder={handleTaskReorder}
            />
          </TabsContent>

        </Tabs>
      </div>

      <TaskInputModal
        isOpen={isTaskModalOpen}
        onClose={handleTaskModalClose}
        onTaskCreate={handleTaskCreate}
        onTaskUpdate={handleTaskUpdate}
        editingTask={editingTask}
        existingTasks={tasks}
      />

      <ProductivityAnalytics
        isOpen={isAnalyticsOpen}
        onClose={() => setIsAnalyticsOpen(false)}
      />

      <Toaster />
    </div>
    </FlowZoneUserContext.Provider>
  );
}
