"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui';
import { Button } from './ui';
import { Input } from './ui';
import { Label } from './ui';
import { Badge } from './ui';
import { Switch } from './ui';
import { Textarea } from './ui';
import { Alert, AlertDescription } from './ui';
import { 
  Clock, 
  Plus, 
  Trash2, 
  RotateCcw, 
  Download, 
  Upload,
  AlertTriangle,
  Palette
} from 'lucide-react';
import { useCustomZones } from '@/lib/flowzone/use-custom-zones';
import { TimeZone } from '@/lib/flowzone/zones';
import { useToast } from './ui';

export const ZoneSettings: React.FC = () => {
  const {
    zones,
    hasCustomZones,
    updateZone,
    addZone,
    removeZone,
    resetToDefaults,
    validateZoneTime,
    checkTimeOverlaps,
    exportSettings,
    importSettings
  } = useCustomZones();

  const { toast } = useToast();
  const [editingZone, setEditingZone] = useState<string | null>(null);
  const [importText, setImportText] = useState('');

  const handleZoneUpdate = (zoneId: string, field: keyof TimeZone, value: any) => {
    const success = updateZone(zoneId, { [field]: value });
    if (success) {
      toast({
        title: "Zone opdateret",
        description: "Zoneindstillingerne er gemt."
      });
    }
  };

  const handleTimeSlotUpdate = (zoneId: string, newTimeSlot: string) => {
    if (!validateZoneTime(newTimeSlot)) {
      toast({
        title: "Ugyldigt tidsformat",
        description: "Brug formatet: TT:MM - TT:MM",
        variant: "destructive"
      });
      return;
    }

    const tempZones = zones.map(z => 
      z.id === zoneId ? { ...z, timeSlot: newTimeSlot } : z
    );

    const conflicts = checkTimeOverlaps(tempZones);
    if (conflicts.length > 0) {
      toast({
        title: "Tidskonflikt fundet",
        description: conflicts[0],
        variant: "destructive"
      });
      return;
    }

    handleZoneUpdate(zoneId, 'timeSlot', newTimeSlot);
  };

  const handleAddZone = () => {
    const newZone: TimeZone = {
      id: `zone-${Date.now()}`,
      name: 'Ny zone',
      timeSlot: '18:00 - 19:00',
      capacity: 60,
      color: '#3b82f6',
      description: 'Tilpasset zone',
      preferredTaskTypes: ['deep-work']
    };

    addZone(newZone);
    setEditingZone(newZone.id);
    toast({
      title: "Zone tilføjet",
      description: "Ny zone oprettet. Klik for at redigere detaljer."
    });
  };

  const handleRemoveZone = (zoneId: string) => {
    const success = removeZone(zoneId);
    if (success) {
      toast({
        title: "Zone fjernet",
        description: "Zonen er slettet."
      });
    }
  };

  const handleResetToDefaults = () => {
    resetToDefaults();
    setEditingZone(null);
    toast({
      title: "Nulstillet til standard",
      description: "Alle zonetilpasninger er nulstillet."
    });
  };

  const handleExport = () => {
    const settings = exportSettings();
    navigator.clipboard.writeText(settings);
    toast({
      title: "Indstillinger eksporteret",
      description: "Zoneindstillinger kopieret til udklipsholderen."
    });
  };

  const handleImport = () => {
    if (!importText.trim()) return;
    
    const success = importSettings(importText);
    if (success) {
      setImportText('');
      toast({
        title: "Indstillinger importeret",
        description: "Zoneindstillingerne er importeret."
      });
    } else {
      toast({
        title: "Import mislykkedes",
        description: "Ugyldigt indstillingsformat.",
        variant: "destructive"
      });
    }
  };

  const conflicts = checkTimeOverlaps();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Zoneindstillinger
        </CardTitle>
        <CardDescription>
          Tilpas dine daglige zoner, tidsplaner og præferencer
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status and Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant={hasCustomZones ? "default" : "secondary"}>
              {hasCustomZones ? "Tilpasset" : "Standard"}
            </Badge>
            {conflicts.length > 0 && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {conflicts.length} {conflicts.length > 1 ? 'konflikter' : 'konflikt'}
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleAddZone} title="Tilføj zone" aria-label="Tilføj zone">
              <Plus className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleResetToDefaults} disabled={!hasCustomZones} title="Nulstil til standard" aria-label="Nulstil til standard">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Conflicts Alert */}
        {conflicts.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Tidskonflikter fundet: {conflicts.join(', ')}
            </AlertDescription>
          </Alert>
        )}

        {/* Zone List */}
        <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
          {zones.map((zone) => (
            <div key={zone.id} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-4 h-4 rounded-full border"
                    style={{ backgroundColor: zone.color }}
                  />
                  {editingZone === zone.id ? (
                    <Input
                      value={zone.name}
                      onChange={(e) => handleZoneUpdate(zone.id, 'name', e.target.value)}
                      onBlur={() => setEditingZone(null)}
                      className="font-medium"
                      autoFocus
                    />
                  ) : (
                    <h4 
                      className="font-medium cursor-pointer hover:text-stone-900"
                      onClick={() => setEditingZone(zone.id)}
                    >
                      {zone.name}
                    </h4>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {zone.isBreakZone && (
                    <Badge variant="outline" className="text-xs">Pause</Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveZone(zone.id)}
                    className="text-red-600 hover:text-red-600"
                    title="Slet zone"
                    aria-label="Slet zone"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">Tidsrum</Label>
                  <Input
                    value={zone.timeSlot}
                    onChange={(e) => handleTimeSlotUpdate(zone.id, e.target.value)}
                    placeholder="TT:MM - TT:MM"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Kapacitet (minutter)</Label>
                  <Input
                    type="number"
                    value={zone.capacity}
                    onChange={(e) => handleZoneUpdate(zone.id, 'capacity', parseInt(e.target.value) || 0)}
                    min="0"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Farve</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={zone.color}
                    onChange={(e) => handleZoneUpdate(zone.id, 'color', e.target.value)}
                    className="w-8 h-8 rounded border cursor-pointer"
                  />
                  <Input
                    value={zone.color}
                    onChange={(e) => handleZoneUpdate(zone.id, 'color', e.target.value)}
                    placeholder="#3b82f6"
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Beskrivelse</Label>
                <Textarea
                  value={zone.description || ''}
                  onChange={(e) => handleZoneUpdate(zone.id, 'description', e.target.value)}
                  placeholder="Zonebeskrivelse..."
                  rows={2}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-sm">Pausezone</Label>
                <Switch
                  checked={zone.isBreakZone || false}
                  onCheckedChange={(checked) => handleZoneUpdate(zone.id, 'isBreakZone', checked)}
                />
              </div>
            </div>
          ))}
        </div>

      </CardContent>
    </Card>
  );
};