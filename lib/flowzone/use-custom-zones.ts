"use client";

import { useState, useEffect } from 'react';
import { TimeZone } from '@/lib/flowzone/zones';
import { zoneManager } from '@/lib/flowzone/zone-manager';

export const useCustomZones = () => {
  const [zones, setZones] = useState<TimeZone[]>(() => zoneManager.getZones());
  const [hasCustomZones, setHasCustomZones] = useState(() => zoneManager.hasCustomZones());

  const updateZones = (newZones: TimeZone[]) => {
    zoneManager.updateZones(newZones);
    setZones(newZones);
    setHasCustomZones(true);
  };

  const updateZone = (zoneId: string, updates: Partial<TimeZone>) => {
    const success = zoneManager.updateZone(zoneId, updates);
    if (success) {
      setZones(zoneManager.getZones());
      setHasCustomZones(true);
    }
    return success;
  };

  const addZone = (zone: TimeZone) => {
    zoneManager.addZone(zone);
    setZones(zoneManager.getZones());
    setHasCustomZones(true);
  };

  const removeZone = (zoneId: string) => {
    const success = zoneManager.removeZone(zoneId);
    if (success) {
      setZones(zoneManager.getZones());
      setHasCustomZones(zoneManager.hasCustomZones());
    }
    return success;
  };

  const reorderZones = (fromIndex: number, toIndex: number) => {
    zoneManager.reorderZones(fromIndex, toIndex);
    setZones(zoneManager.getZones());
    setHasCustomZones(true);
  };

  const resetToDefaults = () => {
    zoneManager.resetToDefaults();
    setZones(zoneManager.getZones());
    setHasCustomZones(false);
  };

  const validateZoneTime = (timeSlot: string) => {
    return zoneManager.validateZoneTime(timeSlot);
  };

  const checkTimeOverlaps = (zonesToCheck?: TimeZone[]) => {
    return zoneManager.checkTimeOverlaps(zonesToCheck || zones);
  };

  const exportSettings = () => {
    return zoneManager.exportSettings();
  };

  const importSettings = (settingsJson: string) => {
    const success = zoneManager.importSettings(settingsJson);
    if (success) {
      setZones(zoneManager.getZones());
      setHasCustomZones(zoneManager.hasCustomZones());
    }
    return success;
  };

  return {
    zones,
    hasCustomZones,
    updateZones,
    updateZone,
    addZone,
    removeZone,
    reorderZones,
    resetToDefaults,
    validateZoneTime,
    checkTimeOverlaps,
    exportSettings,
    importSettings
  };
};