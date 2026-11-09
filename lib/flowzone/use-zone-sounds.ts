"use client";

import { useEffect, useRef } from "react";
import { audioManager } from "./audio-manager";
import { getZoneOrder, isWeekendDay, parseTimeSlot, zoneManager } from "./zone-manager";
import { toast } from "@/app/(dashboard)/flowzone/_components/ui";

const WARNING_SECONDS = 5 * 60;
const ENDING_SECONDS = 60;

/**
 * Spiller zonelydene, mens FlowZone er åben:
 * zonestart, advarsel 5 min før en zone slutter, 1 min før, og dagens afslutning når sidste zone slutter.
 * Hver lyd spilles én gang pr. zone pr. dag, også selvom browseren kun tjekker sjældent i en baggrundsfane.
 */
export function useZoneSounds() {
  const played = useRef(new Set<string>());
  const lastZone = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      if (isWeekendDay(now)) return;

      const seconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      const day = now.toDateString();
      const zones = zoneManager.getZones();
      const order = getZoneOrder();
      const current = zones.find((z) => {
        const { start, end } = parseTimeSlot(z.timeSlot);
        return seconds >= start * 60 && seconds < end * 60;
      });
      const once = (key: string, play: () => void) => {
        const id = `${day}|${key}`;
        if (played.current.has(id)) return;
        played.current.add(id);
        play();
      };

      // Første tjek efter siden er åbnet: husk bare hvor vi er, uden at spille noget.
      if (lastZone.current === undefined) {
        lastZone.current = current?.id ?? null;
        if (current) {
          const left = parseTimeSlot(current.timeSlot).end * 60 - seconds;
          if (left <= WARNING_SECONDS) played.current.add(`${day}|warning|${current.id}`);
          if (left <= ENDING_SECONDS) played.current.add(`${day}|ending|${current.id}`);
        }
        return;
      }

      if (current && current.id !== lastZone.current) {
        once(`start|${current.id}`, () => void audioManager.playZoneStart());
      }

      const lastId = order[order.length - 1];
      const lastOfDay = zones.find((z) => z.id === lastId);
      if (!current && lastZone.current === lastId && lastOfDay && seconds >= parseTimeSlot(lastOfDay.timeSlot).end * 60) {
        once("end-of-day", () => void audioManager.playEndOfDay());
      }
      lastZone.current = current?.id ?? null;

      if (!current || current.isBreakZone) return;
      const left = parseTimeSlot(current.timeSlot).end * 60 - seconds;
      if (left <= ENDING_SECONDS) {
        once(`ending|${current.id}`, () => {
          void audioManager.playZoneEnding();
          toast({ title: "Zoneskift om lidt", description: `${current.name} slutter om 1 minut`, variant: "destructive" });
        });
      } else if (left <= WARNING_SECONDS) {
        once(`warning|${current.id}`, () => {
          void audioManager.playZoneWarning();
          toast({ title: "Zoneskift nærmer sig", description: `${current.name} slutter om 5 minutter` });
        });
      }
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);
}
