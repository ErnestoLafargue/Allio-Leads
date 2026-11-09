"use client";

import React from 'react';
import { Button } from './ui';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui';
import { Settings } from 'lucide-react';
import { AudioSettings } from './audio-settings';
import { ZoneSettings } from './zone-settings';

export const SettingsPopup: React.FC = () => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-slate-200 hover:bg-slate-50"
          title="Indstillinger"
          aria-label="Indstillinger"
        >
          <Settings className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      
      <PopoverContent className="w-[600px] max-h-[80vh] p-0" align="end">
        <Tabs defaultValue="audio" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="audio">Lyd</TabsTrigger>
            <TabsTrigger value="zones">Zoner</TabsTrigger>
          </TabsList>
          
          <TabsContent value="audio" className="p-4">
            <AudioSettings />
          </TabsContent>
          
          <TabsContent value="zones" className="p-4">
            <ZoneSettings />
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
};

// Export both for backward compatibility
export const AudioSettingsPopup = SettingsPopup;