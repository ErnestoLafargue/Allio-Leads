"use client";

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui';
import { Switch } from './ui';
import { Slider } from './ui';
import { Button } from './ui';
import { Label } from './ui';
import { Volume2, VolumeX } from 'lucide-react';
import { audioManager } from '@/lib/flowzone/audio-manager';

export const AudioSettings: React.FC = () => {
  const [settings, setSettings] = React.useState(audioManager.getSettings());

  const updateSettings = (key: string, value: boolean | number) => {
    if (key === 'enabled') {
      audioManager.setEnabled(value as boolean);
    } else if (key === 'volume') {
      audioManager.setVolume(value as number);
    } else {
      audioManager.setSoundType(key as any, value as boolean);
    }
    setSettings(audioManager.getSettings());
  };

  const testSound = async (type: 'zoneStart' | 'zoneWarning' | 'zoneEnding' | 'endOfDay') => {
    await audioManager.testSound(type);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {settings.enabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          Lydnotifikationer
        </CardTitle>
        <CardDescription>
          Indstil lydsignaler ved zoneskift og vigtige begivenheder
        </CardDescription>
        <p className="text-xs text-stone-500">
          Lydene spiller, mens FlowZone er åben i en fane. Browseren kræver, at du har klikket på siden én gang, før der må komme lyd.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Master Enable */}
        <div className="flex items-center justify-between">
          <Label htmlFor="audio-enabled" className="text-sm font-medium">
            Slå lydnotifikationer til
          </Label>
          <Switch
            id="audio-enabled"
            checked={settings.enabled}
            onCheckedChange={(checked) => updateSettings('enabled', checked)}
          />
        </div>

        {settings.enabled && (
          <>
            {/* Volume Control */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Lydstyrke</Label>
              <div className="flex items-center gap-3">
                <VolumeX className="h-4 w-4 text-stone-500" />
                <Slider
                  value={[settings.volume]}
                  onValueChange={([value]) => updateSettings('volume', value)}
                  max={1}
                  min={0}
                  step={0.1}
                  className="flex-1"
                />
                <Volume2 className="h-4 w-4 text-stone-500" />
              </div>
            </div>

            {/* Individual Sound Settings */}
            <div className="space-y-4">
              <Label className="text-sm font-medium">Notifikationstyper</Label>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={settings.zoneStart}
                      onCheckedChange={(checked) => updateSettings('zoneStart', checked)}
                    />
                    <Label className="text-sm">Zonestart</Label>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testSound('zoneStart')}
                    disabled={!settings.zoneStart}
                  >
                    Afprøv
                  </Button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={settings.zoneWarning}
                      onCheckedChange={(checked) => updateSettings('zoneWarning', checked)}
                    />
                    <Label className="text-sm">Zoneadvarsel (5 min)</Label>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testSound('zoneWarning')}
                    disabled={!settings.zoneWarning}
                  >
                    Afprøv
                  </Button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={settings.zoneEnding}
                      onCheckedChange={(checked) => updateSettings('zoneEnding', checked)}
                    />
                    <Label className="text-sm">Zone slutter (1 min)</Label>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testSound('zoneEnding')}
                    disabled={!settings.zoneEnding}
                  >
                    Afprøv
                  </Button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={settings.endOfDay}
                      onCheckedChange={(checked) => updateSettings('endOfDay', checked)}
                    />
                    <Label className="text-sm">Dagens afslutning</Label>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testSound('endOfDay')}
                    disabled={!settings.endOfDay}
                  >
                    Afprøv
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};