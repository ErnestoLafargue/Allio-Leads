"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Card } from './ui';
import { Clock } from 'lucide-react';
import { useCustomZones } from '@/lib/flowzone/use-custom-zones';
import { useToast } from './ui';
import { DanishTimeManager } from '@/lib/flowzone/danish-time';
import { audioManager } from '@/lib/flowzone/audio-manager';

export const ZoneTimer: React.FC = () => {
  const { zones } = useCustomZones();
  const [currentTime, setCurrentTime] = useState(DanishTimeManager.getDanishTime());
  const [isTransitioning, setIsTransitioning] = useState(false);
  const { toast } = useToast();
  const lastZoneRef = useRef<string | null>(null);
  const warningTriggeredRef = useRef<boolean>(false);
  const endingTriggeredRef = useRef<boolean>(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(DanishTimeManager.getDanishTime());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Parse timeSlot string to get start and end times in minutes
  const parseTimeSlot = (timeSlot: string) => {
    const match = timeSlot.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    if (!match) {
      console.error(`❌ Failed to parse time slot: "${timeSlot}"`);
      return null;
    }
    
    const [, startHour, startMin, endHour, endMin] = match;
    const start = parseInt(startHour) * 60 + parseInt(startMin);
    const end = parseInt(endHour) * 60 + parseInt(endMin);
    
    console.log(`📅 Parsed "${timeSlot}": start=${start}min (${startHour}:${startMin}), end=${end}min (${endHour}:${endMin})`);
    return { start, end };
  };

  // Get zone ranges from custom zones
  const getZoneRanges = () => {
    return zones.map(zone => {
      const timing = parseTimeSlot(zone.timeSlot);
      return {
        id: zone.id,
        start: timing?.start || 0,
        end: timing?.end || 0,
        zone
      };
    }).filter(range => range.start > 0 && range.end > 0);
  };

  const getCurrentZone = () => {
    const danishTime = DanishTimeManager.getDanishTime();
    const totalMinutes = DanishTimeManager.getDanishTotalMinutes();
    const zoneRanges = getZoneRanges();
    
    // Detailed debug logging
    console.log('🕐 Zone Debug:', {
      danishTime: DanishTimeManager.formatDanishTime(danishTime, 'HH:mm:ss'),
      totalMinutes,
      zoneRanges: zoneRanges.map(r => ({
        id: r.id,
        name: r.zone.name,
        timeSlot: r.zone.timeSlot,
        start: r.start,
        end: r.end,
        isActive: totalMinutes >= r.start && totalMinutes < r.end,
        comparison: `${totalMinutes} >= ${r.start} && ${totalMinutes} < ${r.end}`
      }))
    });

    const currentRange = zoneRanges.find(range => 
      totalMinutes >= range.start && totalMinutes < range.end
    );

    if (currentRange) {
      console.log('✅ Found current zone:', {
        id: currentRange.id,
        name: currentRange.zone.name,
        timeSlot: currentRange.zone.timeSlot
      });
    } else {
      console.log('❌ No current zone found');
    }

    return currentRange?.zone || null;
  };

  const getNextZone = () => {
    const totalMinutes = DanishTimeManager.getDanishTotalMinutes(currentTime);
    const zoneRanges = getZoneRanges();

    const nextRange = zoneRanges.find(range => totalMinutes < range.start);
    
    if (nextRange) {
      return nextRange.zone;
    }
    
    // If past all zones, next is tomorrow's first zone
    return zones[0];
  };

  const getTimeUntilNextZone = () => {
    const totalMinutes = DanishTimeManager.getDanishTotalMinutes(currentTime);
    const second = DanishTimeManager.getDanishSeconds(currentTime);
    const zoneRanges = getZoneRanges();

    const zoneEndTimes = zoneRanges.map(range => range.end);
    const nextEndTime = zoneEndTimes.find(endTime => totalMinutes < endTime);
    
    if (nextEndTime) {
      const minutesUntil = nextEndTime - totalMinutes;
      return (minutesUntil * 60) - second;
    }
    
    // If past all zones, time until tomorrow's first zone
    const hour = DanishTimeManager.getDanishHours(currentTime);
    const minute = DanishTimeManager.getDanishMinutes(currentTime);
    const secondsUntilMidnight = (24 - hour) * 3600 - (minute * 60) - second;
    const firstZoneStart = zoneRanges[0]?.start || 9 * 60; // Default to 9 AM
    return secondsUntilMidnight + (firstZoneStart * 60);
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getZoneProgress = () => {
    const totalMinutes = DanishTimeManager.getDanishTotalMinutes(currentTime);
    const zoneRanges = getZoneRanges();

    const currentRange = zoneRanges.find(range => 
      totalMinutes >= range.start && totalMinutes < range.end
    );

    if (!currentRange) return 0;

    const elapsed = totalMinutes - currentRange.start;
    const total = currentRange.end - currentRange.start;
    
    return Math.min((elapsed / total) * 100, 100);
  };

  const getOverallDayProgress = () => {
    const totalMinutes = DanishTimeManager.getDanishTotalMinutes(currentTime);
    const zoneRanges = getZoneRanges();
    
    if (zoneRanges.length === 0) return 0;
    
    const startTime = zoneRanges[0].start;
    const endTime = zoneRanges[zoneRanges.length - 1].end;
    
    if (totalMinutes < startTime) return 0;
    if (totalMinutes >= endTime) return 100;
    
    const elapsed = totalMinutes - startTime;
    const total = endTime - startTime;
    
    return Math.min((elapsed / total) * 100, 100);
  };

  const getZoneStatus = (zoneId: string) => {
    const totalMinutes = DanishTimeManager.getDanishTotalMinutes(currentTime);
    const zoneRanges = getZoneRanges();

    const zoneRange = zoneRanges.find(range => range.id === zoneId);
    if (!zoneRange) return 'upcoming';

    if (totalMinutes >= zoneRange.start && totalMinutes < zoneRange.end) return 'current';
    if (totalMinutes >= zoneRange.end) return 'completed';
    return 'upcoming';
  };

  const getZoneSegmentWidth = (zoneId: string) => {
    const zoneRanges = getZoneRanges();
    const zoneRange = zoneRanges.find(range => range.id === zoneId);
    
    if (!zoneRange || zoneRanges.length === 0) return 0;
    
    const totalDuration = zoneRanges.reduce((acc, range) => acc + (range.end - range.start), 0);
    const duration = zoneRange.end - zoneRange.start;
    
    return (duration / totalDuration) * 100;
  };

  const getZoneColors = (zoneId: string, status: string) => {
    const zone = zones.find(z => z.id === zoneId);
    if (!zone) return 'bg-gray-300';

    const baseColorMap: Record<string, string> = {
      'bg-green-100': 'from-green-400 to-green-600',
      'bg-gray-100': 'from-gray-400 to-gray-600'
    };

    const baseColor = zone.color.split(' ')[0];
    const gradientColor = baseColorMap[baseColor] || 'from-gray-400 to-gray-600';

    if (status === 'completed') {
      return `bg-gradient-to-r ${gradientColor} opacity-60`;
    } else if (status === 'current') {
      return `bg-gradient-to-r ${gradientColor} opacity-100 shadow-lg ring-2 ring-white`;
    } else {
      return `bg-gradient-to-r ${gradientColor} opacity-30`;
    }
  };

  const currentZone = getCurrentZone();
  const nextZone = getNextZone();
  const timeUntilNext = getTimeUntilNextZone();
  const progress = getZoneProgress();
  const dayProgress = getOverallDayProgress();

  // Check for zone changes and audio notifications
  useEffect(() => {
    const currentZoneId = currentZone?.id;
    
    console.log('🔄 Zone Effect Debug:', {
      currentZoneId,
      lastZoneId: lastZoneRef.current,
      currentTime: DanishTimeManager.formatDanishTime(currentTime, 'HH:mm:ss'),
      timeUntilNext
    });
    // Zone change detection
    if (currentZoneId && currentZoneId !== lastZoneRef.current) {
      if (lastZoneRef.current !== null) {
        // Zone has changed, play zone start sound
        audioManager.playZoneStart();
        
        // Check if this is the last zone of the day
        const zoneRanges = getZoneRanges();
        const lastZone = zoneRanges[zoneRanges.length - 1];
        if (lastZoneRef.current === lastZone?.id) {
          audioManager.playEndOfDay();
        }
      }
      lastZoneRef.current = currentZoneId;
      warningTriggeredRef.current = false;
      endingTriggeredRef.current = false;
    }

    // Warning notifications
    if (timeUntilNext <= 300 && timeUntilNext > 295 && currentZone && !warningTriggeredRef.current) {
      setIsTransitioning(true);
      warningTriggeredRef.current = true;
      audioManager.playZoneWarning();
      toast({
        title: "Zoneskift nærmer sig",
        description: `${currentZone.name} slutter om 5 minutter`,
      });
    } else if (timeUntilNext <= 60 && timeUntilNext > 55 && currentZone && !endingTriggeredRef.current) {
      setIsTransitioning(true);
      endingTriggeredRef.current = true;
      audioManager.playZoneEnding();
      toast({
        title: "Zoneskift om lidt!",
        description: `${currentZone.name} slutter om 1 minut`,
        variant: "destructive",
      });
    } else if (timeUntilNext > 300) {
      setIsTransitioning(false);
    }
  }, [timeUntilNext, currentZone, toast]);

  const zoneRanges = getZoneRanges();

  return (
    <Card className={`p-6 transition-all duration-300 ${
      isTransitioning ? 'animate-pulse bg-gradient-to-r from-orange-50 to-red-50 border-orange-300' : 
      'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200'
    }`}>
      <div className="flex items-center space-x-2 mb-4">
        <Clock className="h-5 w-5 text-blue-600" />
        <h3 className="text-lg font-semibold text-slate-900">Zonetimer</h3>
      </div>

      <div className="text-center mb-6">
        <div className="text-4xl font-bold text-blue-600 mb-2">
          {formatTime(timeUntilNext)}
        </div>
        <div className="text-sm text-slate-600">
          {currentZone ? (
            <>
              <div className="font-medium">{currentZone.name} slutter om</div>
              {nextZone && (
                <div className="text-blue-600">Næste: {nextZone.name}</div>
              )}
            </>
          ) : (
            <div>Uden for aktive zoner</div>
          )}
        </div>
        <div className="text-xs text-slate-500 mt-1">
          Dansk tid: {DanishTimeManager.formatDanishTime(currentTime, 'HH:mm:ss')}
        </div>
      </div>

      <div className="space-y-4">
        {/* Zone Timeline */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">Dagens zonefremskridt</span>
            <span className="text-blue-600 font-medium">{Math.round(dayProgress)}%</span>
          </div>
          
          {/* Segmented Progress Bar */}
          <div className="relative h-8 bg-gray-100 rounded-lg overflow-hidden">
            <div className="flex h-full">
              {zones.map((zone, index) => {
                const status = getZoneStatus(zone.id);
                const width = getZoneSegmentWidth(zone.id);
                const colors = getZoneColors(zone.id, status);
                const isActive = status === 'current';
                
                return (
                  <div
                    key={zone.id}
                    className={`relative transition-all duration-300 ${colors} ${
                      index !== zones.length - 1 ? 'border-r border-white' : ''
                    }`}
                    style={{ width: `${width}%` }}
                    title={`${zone.name} (${zone.timeSlot})`}
                  >
                    {/* Current zone progress overlay */}
                    {isActive && (
                      <div 
                        className="absolute inset-0 bg-white bg-opacity-20"
                        style={{ 
                          width: `${progress}%`,
                          backgroundImage: 'linear-gradient(45deg, transparent 25%, rgba(255,255,255,0.1) 25%, rgba(255,255,255,0.1) 50%, transparent 50%, transparent 75%, rgba(255,255,255,0.1) 75%)',
                          backgroundSize: '8px 8px'
                        }}
                      />
                    )}
                    
                    {/* Zone label for wider zones */}
                    {width > 8 && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs font-medium text-white drop-shadow-sm">
                          {zone.name.split(' ')[0]}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            {/* Time markers */}
            <div className="absolute -bottom-6 left-0 right-0 flex justify-between text-xs text-slate-400">
              <span>9:00</span>
              <span>13:00</span>
              <span>17:00</span>
              <span>22:00</span>
            </div>
          </div>
        </div>

        {/* Current Zone Progress */}
        {currentZone && (
          <div className="space-y-2 mt-8">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Fremskridt i nuværende zone</span>
              <span className="text-blue-600 font-medium">{Math.round(progress)}%</span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ${
                  isTransitioning ? 'animate-pulse bg-orange-400' : 'bg-blue-500'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {isTransitioning && (
        <div className="mt-4 text-center">
          <div className="text-xs text-orange-600 font-medium animate-pulse">
            ⚠️ Zoneskift nærmer sig
          </div>
        </div>
      )}
    </Card>
  );
};
