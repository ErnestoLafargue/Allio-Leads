"use client";

import dynamic from "next/dynamic";

/**
 * FlowZone kører kun i browseren: zoner og lyd ligger i localStorage,
 * og visningen afhænger af klokken lige nu.
 */
const FlowZoneApp = dynamic(() => import("./flowzone-app").then((m) => m.FlowZoneApp), {
  ssr: false,
  loading: () => <p className="text-sm text-stone-500">Indlæser FlowZone…</p>,
});

export function FlowZoneClient({ userId, userName }: { userId: string; userName: string }) {
  return <FlowZoneApp ownUserId={userId} ownUserName={userName} />;
}
