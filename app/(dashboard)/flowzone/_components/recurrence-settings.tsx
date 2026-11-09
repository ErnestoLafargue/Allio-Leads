"use client";

import React from 'react';
import { Label } from './ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui';
import { Input } from './ui';
import { Button } from './ui';
import { Calendar } from './ui';
import { Popover, PopoverContent, PopoverTrigger } from './ui';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { da } from 'date-fns/locale';
import { cn } from './ui';
import { RecurrencePattern, RecurrenceType, RECURRENCE_OPTIONS, DAYS_OF_WEEK } from '@/lib/flowzone/zones';

interface RecurrenceSettingsProps {
  pattern: RecurrencePattern;
  onPatternChange: (pattern: RecurrencePattern) => void;
}

export const RecurrenceSettings: React.FC<RecurrenceSettingsProps> = ({
  pattern,
  onPatternChange,
}) => {
  const updatePattern = (updates: Partial<RecurrencePattern>) => {
    onPatternChange({ ...pattern, ...updates });
  };

  const toggleDayOfWeek = (day: number) => {
    const currentDays = pattern.daysOfWeek || [];
    const newDays = currentDays.includes(day)
      ? currentDays.filter(d => d !== day)
      : [...currentDays, day].sort();
    
    updatePattern({ daysOfWeek: newDays });
  };

  return (
    <div className="space-y-4 p-4 bg-slate-50 rounded-lg border">
      <div className="flex items-center space-x-2">
        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
        <Label className="font-medium">Gentagelse</Label>
      </div>

      {/* Recurrence Type */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-sm">Gentag</Label>
          <Select 
            value={pattern.type} 
            onValueChange={(value) => updatePattern({ type: value as RecurrenceType })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RECURRENCE_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Interval */}
        {pattern.type !== 'weekdays' && (
          <div className="space-y-2">
            <Label className="text-sm">
              Interval i {pattern.type === 'daily' ? 'dage' : pattern.type === 'weekly' ? 'uger' : 'måneder'}
            </Label>
            <Input
              type="number"
              min="1"
              max="365"
              value={pattern.interval}
              onChange={(e) => updatePattern({ interval: parseInt(e.target.value) || 1 })}
            />
          </div>
        )}
      </div>

      {/* Days of Week for Weekly */}
      {pattern.type === 'weekly' && (
        <div className="space-y-2">
          <Label className="text-sm">Ugedage</Label>
          <div className="grid grid-cols-7 gap-1">
            {DAYS_OF_WEEK.map(day => (
              <Button
                key={day.value}
                type="button"
                variant={pattern.daysOfWeek?.includes(day.value) ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => toggleDayOfWeek(day.value)}
              >
                {day.short}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* End Date */}
      <div className="space-y-2">
        <Label className="text-sm">Slutdato (valgfri)</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal",
                !pattern.endDate && "text-stone-500"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {pattern.endDate ? format(pattern.endDate, "d. MMM yyyy", { locale: da }) : "Ingen slutdato"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={pattern.endDate}
              onSelect={(date) => updatePattern({ endDate: date })}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        {pattern.endDate && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => updatePattern({ endDate: undefined })}
            className="text-xs text-stone-500"
          >
            Ryd slutdato
          </Button>
        )}
      </div>
    </div>
  );
};
