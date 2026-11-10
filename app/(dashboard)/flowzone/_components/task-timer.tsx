"use client";

import React, { useState, useEffect } from 'react';
import { Button } from './ui';
import { Input } from './ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui';
import { Play, Pause, Square, Plus } from 'lucide-react';
import { useTaskTimer } from '@/lib/flowzone/use-task-timer';

interface TaskTimerProps {
  taskId: string;
  estimatedTime: number; // in minutes
  onComplete?: (taskId: string, actualTimeSpent?: number) => void;
  onEstimatedTimeChange?: (taskId: string, newEstimatedTime: number) => void;
  currentZone?: string | null;
  onZoneSpillover?: (taskId: string, remainingTime: number) => void;
}

export const TaskTimer: React.FC<TaskTimerProps> = ({
  taskId,
  estimatedTime,
  onComplete,
  onEstimatedTimeChange,
  currentZone,
  onZoneSpillover
}) => {
  const [localEstimatedTime, setLocalEstimatedTime] = useState(estimatedTime);
  const [extendMinutes, setExtendMinutes] = useState('');
  const [isExtendDialogOpen, setIsExtendDialogOpen] = useState(false);
  const {
    isRunning,
    currentElapsed,
    formattedTime,
    startTimer,
    pauseTimer,
    stopTimer,
    handleZoneSpillover,
    spilloverTriggered
  } = useTaskTimer({ 
    taskId, 
    onComplete: (taskId, totalTime) => onComplete?.(taskId, totalTime),
    onZoneSpillover,
    currentZone
  });

  // Handle zone spillover when timer is running
  useEffect(() => {
    if (isRunning && !spilloverTriggered) {
      handleZoneSpillover(estimatedTime);
    }
  }, [isRunning, spilloverTriggered, handleZoneSpillover, estimatedTime]);

  const estimatedSeconds = localEstimatedTime * 60;
  const progressPercentage = Math.min((currentElapsed / estimatedSeconds) * 100, 100);
  const isOvertime = currentElapsed > estimatedSeconds;

  const handleExtendTime = () => {
    const minutesToAdd = parseInt(extendMinutes);
    if (minutesToAdd && minutesToAdd > 0) {
      const newEstimatedTime = localEstimatedTime + minutesToAdd;
      setLocalEstimatedTime(newEstimatedTime);
      onEstimatedTimeChange?.(taskId, newEstimatedTime);
      setExtendMinutes('');
      setIsExtendDialogOpen(false);
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <div className="flex items-center space-x-1">
        {!isRunning ? (
          <Button
            size="sm"
            onClick={startTimer}
            className="h-7 px-2 bg-green-600 hover:bg-green-700 text-white text-xs"
          >
            <Play className="h-3 w-3 mr-1" />
            Start
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={pauseTimer}
              className="h-7 px-2 border-orange-300 text-orange-700 hover:bg-orange-50"
              title="Pause"
              aria-label="Pause"
            >
              <Pause className="h-3 w-3" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={stopTimer}
              className="h-7 px-2 border-red-300 text-red-700 hover:bg-red-50"
              title="Stop"
              aria-label="Stop"
            >
              <Square className="h-3 w-3" />
            </Button>
          </>
        )}
        
        <Dialog open={isExtendDialogOpen} onOpenChange={setIsExtendDialogOpen}>
          <DialogTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 border-blue-300 text-blue-700 hover:bg-blue-50"
            >
              <Plus className="h-3 w-3 mr-1" />
              Forlæng
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Forlæng estimeret tid</DialogTitle>
            </DialogHeader>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-slate-600">Tilføj</span>
              <Input
                type="number"
                value={extendMinutes}
                onChange={(e) => setExtendMinutes(e.target.value)}
                placeholder="15"
                className="w-20"
                min="1"
              />
              <span className="text-sm text-slate-600">minutter</span>
              <Button onClick={handleExtendTime} disabled={!extendMinutes || parseInt(extendMinutes) <= 0}>
                Tilføj
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      
      <div className="flex flex-col text-right">
        <div className="flex items-center space-x-2">
          <span className={`text-xs font-medium ${
            isOvertime ? 'text-red-600' : 'text-slate-700'
          }`}>
            {formattedTime} faktisk
          </span>
          {isRunning && (
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          )}
        </div>
        
        {/* Progress bar */}
        <div className="w-16 h-1 bg-gray-200 rounded-full mt-1">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isOvertime ? 'bg-red-500' : 'bg-green-500'
            }`}
            style={{ width: `${Math.min(progressPercentage, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
};
