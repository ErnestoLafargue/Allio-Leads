"use client";

import { useState, useEffect, useCallback } from 'react';
import { ZoneTask } from '@/lib/flowzone/zones';
import { zoneManager, getZoneIdAt, getZoneOrder } from '@/lib/flowzone/zone-manager';
import { ZoneAssigner } from '@/lib/flowzone/zone-assignment';
import { toast } from '@/app/(dashboard)/flowzone/_components/ui';
import { audioManager } from '@/lib/flowzone/audio-manager';

export interface ZoneTransitionState {
  currentZone: string | null;
  previousZone: string | null;
  spilloverTasks: SpilloverTask[];
  isTransitioning: boolean;
}

export interface SpilloverTask {
  originalTaskId: string;
  remainingTime: number;
  newZoneId: string;
  spilloverReason: string;
}

export interface UseZoneTransitionProps {
  tasks: ZoneTask[];
  zoneAssigner: ZoneAssigner;
  onTaskSpillover: (spilloverInfo: SpilloverTask) => void;
  onZoneChange: (newZone: string | null, previousZone: string | null) => void;
}

export const useZoneTransition = ({
  tasks,
  zoneAssigner,
  onTaskSpillover,
  onZoneChange
}: UseZoneTransitionProps) => {
  const [transitionState, setTransitionState] = useState<ZoneTransitionState>({
    currentZone: null,
    previousZone: null,
    spilloverTasks: [],
    isTransitioning: false
  });

  const getCurrentZone = useCallback((): string | null => getZoneIdAt(), []);

  const findNextCompatibleZone = useCallback((taskType: string, currentZoneId: string): string | null => {
    const zones = zoneManager.getZones().filter(zone => 
      zone.id !== currentZoneId && 
      zone.preferredTaskTypes.includes(taskType as any)
    );
    
    // Prefer next available zone in timeline order
    const zoneOrder = getZoneOrder();
    const currentIndex = zoneOrder.indexOf(currentZoneId);
    
    for (let i = currentIndex + 1; i < zoneOrder.length; i++) {
      const zoneId = zoneOrder[i];
      const zone = zones.find(z => z.id === zoneId);
      if (zone && zoneAssigner.getZoneUtilization(zoneId) < 100) {
        return zoneId;
      }
    }
    
    // Fallback to any compatible zone with capacity
    return zones.find(zone => zoneAssigner.getZoneUtilization(zone.id) < 100)?.id || 'flex-work';
  }, [zoneAssigner]);

  const handleZoneTransition = useCallback((newZone: string | null) => {
    const previousZone = transitionState.currentZone;
    
    if (previousZone && previousZone !== newZone && previousZone !== 'flex-work') {
      setTransitionState(prev => ({ ...prev, isTransitioning: true }));
      
      // Find active tasks in the previous zone
      const activeTasks = tasks.filter(task => 
        task.assignedZone === previousZone && 
        !task.completed &&
        task.deadline.toDateString() === new Date().toDateString()
      );

      // Check for tasks that might need spillover
      const spilloverTasks: SpilloverTask[] = [];
      
      activeTasks.forEach(task => {
        // Planlæggeren flytter selv ufærdige opgaver videre, så den tilfældige demo-spillover er slået fra.
        const hasActiveTimer = false;
        
        if (hasActiveTimer) {
          const estimatedRemaining = Math.max(5, task.estimatedTime * 0.3); // Simulate remaining time
          const nextZone = findNextCompatibleZone(task.taskType, previousZone);
          
          if (nextZone) {
            const spillover: SpilloverTask = {
              originalTaskId: task.id,
              remainingTime: estimatedRemaining,
              newZoneId: nextZone,
              spilloverReason: `Zonen ${previousZone} sluttede, mens opgaven var aktiv`
            };
            
            spilloverTasks.push(spillover);
            onTaskSpillover(spillover);
            
            // Play spillover sound
            audioManager.playSpillover();
            
            // Show notification
            const zoneName = zoneManager.getZones().find(z => z.id === nextZone)?.name || nextZone;
            toast({
              title: `Opgaven "${task.title}" fortsætter i ${zoneName}`,
              description: `${Math.round(estimatedRemaining)} min tilbage`,
              duration: 5000
            });
          }
        }
      });

      setTransitionState(prev => ({
        ...prev,
        currentZone: newZone,
        previousZone: previousZone,
        spilloverTasks: [...prev.spilloverTasks, ...spilloverTasks],
        isTransitioning: false
      }));
    } else {
      setTransitionState(prev => ({
        ...prev,
        currentZone: newZone,
        previousZone: previousZone
      }));
    }
    
    onZoneChange(newZone, previousZone);
  }, [transitionState.currentZone, tasks, findNextCompatibleZone, onTaskSpillover, onZoneChange]);

  // Monitor zone changes
  useEffect(() => {
    const checkZoneChange = () => {
      const newZone = getCurrentZone();
      if (newZone !== transitionState.currentZone) {
        handleZoneTransition(newZone);
      }
    };

    // Check immediately
    checkZoneChange();
    
    // Check every minute
    const interval = setInterval(checkZoneChange, 60000);
    
    return () => clearInterval(interval);
  }, [getCurrentZone, transitionState.currentZone, handleZoneTransition]);

  const clearSpilloverHistory = useCallback(() => {
    setTransitionState(prev => ({
      ...prev,
      spilloverTasks: []
    }));
  }, []);

  const getSpilloverSummary = useCallback(() => {
    const today = new Date().toDateString();
    const todaySpillovers = transitionState.spilloverTasks.filter(spillover => {
      const task = tasks.find(t => t.id === spillover.originalTaskId);
      return task && task.deadline.toDateString() === today;
    });
    
    return {
      totalSpillovers: todaySpillovers.length,
      totalSpilloverTime: todaySpillovers.reduce((sum, s) => sum + s.remainingTime, 0),
      affectedZones: [...new Set(todaySpillovers.map(s => s.newZoneId))].length
    };
  }, [transitionState.spilloverTasks, tasks]);

  return {
    currentZone: transitionState.currentZone,
    previousZone: transitionState.previousZone,
    spilloverTasks: transitionState.spilloverTasks,
    isTransitioning: transitionState.isTransitioning,
    spilloverSummary: getSpilloverSummary(),
    clearSpilloverHistory
  };
};