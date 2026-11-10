"use client";

import { useState, useEffect, useCallback } from 'react';

export interface TaskTimerState {
  isRunning: boolean;
  startedAt: number | null;
  totalElapsed: number; // in seconds
  pausedAt: number | null;
}

export interface UseTaskTimerProps {
  taskId: string;
  onComplete?: (taskId: string, totalTime: number) => void;
  onZoneSpillover?: (taskId: string, remainingTime: number) => void;
  currentZone?: string | null;
}

export const useTaskTimer = ({ taskId, onComplete, onZoneSpillover, currentZone }: UseTaskTimerProps) => {
  const [timerState, setTimerState] = useState<TaskTimerState>({
    isRunning: false,
    startedAt: null,
    totalElapsed: 0,
    pausedAt: null,
  });

  const [currentElapsed, setCurrentElapsed] = useState(0);
  const [spilloverTriggered, setSpilloverTriggered] = useState(false);

  // Update current elapsed time every second when running
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (timerState.isRunning && timerState.startedAt) {
      interval = setInterval(() => {
        const now = Date.now();
        const sessionElapsed = Math.floor((now - timerState.startedAt!) / 1000);
        setCurrentElapsed(timerState.totalElapsed + sessionElapsed);
      }, 1000);
    } else {
      setCurrentElapsed(timerState.totalElapsed);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [timerState.isRunning, timerState.startedAt, timerState.totalElapsed]);

  const startTimer = useCallback(() => {
    setTimerState(prev => ({
      ...prev,
      isRunning: true,
      startedAt: Date.now(),
      pausedAt: null,
    }));
  }, []);

  const pauseTimer = useCallback(() => {
    setTimerState(prev => {
      if (prev.isRunning && prev.startedAt) {
        const sessionElapsed = Math.floor((Date.now() - prev.startedAt) / 1000);
        return {
          ...prev,
          isRunning: false,
          startedAt: null,
          totalElapsed: prev.totalElapsed + sessionElapsed,
          pausedAt: Date.now(),
        };
      }
      return prev;
    });
  }, []);

  const stopTimer = useCallback(() => {
    setTimerState(prev => {
      if (prev.isRunning && prev.startedAt) {
        const sessionElapsed = Math.floor((Date.now() - prev.startedAt) / 1000);
        const totalTime = prev.totalElapsed + sessionElapsed;
        
        if (onComplete) {
          onComplete(taskId, totalTime);
        }
        
        return {
          isRunning: false,
          startedAt: null,
          totalElapsed: totalTime,
          pausedAt: null,
        };
      }
      return {
        ...prev,
        isRunning: false,
        startedAt: null,
        pausedAt: null,
      };
    });
  }, [taskId, onComplete]);

  const resetTimer = useCallback(() => {
    setTimerState({
      isRunning: false,
      startedAt: null,
      totalElapsed: 0,
      pausedAt: null,
    });
    setCurrentElapsed(0);
    setSpilloverTriggered(false);
  }, []);

  const handleZoneSpillover = useCallback((estimatedTime: number) => {
    if (timerState.isRunning && !spilloverTriggered && onZoneSpillover) {
      const remainingTime = Math.max(0, estimatedTime - (timerState.totalElapsed / 60));
      if (remainingTime > 0) {
        onZoneSpillover(taskId, remainingTime);
        setSpilloverTriggered(true);
      }
    }
  }, [timerState.isRunning, timerState.totalElapsed, spilloverTriggered, onZoneSpillover, taskId]);

  // Reset spillover flag when zone changes and timer is not running
  useEffect(() => {
    if (!timerState.isRunning) {
      setSpilloverTriggered(false);
    }
  }, [currentZone, timerState.isRunning]);

  const formatTime = useCallback((seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours} t ${minutes} min`;
    }
    return `${minutes} min`;
  }, []);

  return {
    isRunning: timerState.isRunning,
    currentElapsed,
    totalElapsed: timerState.totalElapsed,
    formattedTime: formatTime(currentElapsed),
    startTimer,
    pauseTimer,
    stopTimer,
    resetTimer,
    handleZoneSpillover,
    spilloverTriggered,
  };
};
