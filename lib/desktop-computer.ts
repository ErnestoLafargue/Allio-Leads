/**
 * Stempeluret må kun bruges fra en rigtig computer (kontoret), ikke telefon/iPad.
 * iPadOS 13+ udgiver sig for at være Macintosh — derfor tæller vi også touch-punkter.
 */

export type DesktopComputerSignals = {
  userAgent: string;
  maxTouchPoints?: number;
  platform?: string;
  hoverFinePointer?: boolean;
};

export function isPhoneOrTabletDevice(input: DesktopComputerSignals): boolean {
  const ua = input.userAgent;
  if (/iPhone|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;
  if (/Android/i.test(ua)) return true;
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return true;
  const macLike = input.platform === "MacIntel" || /Macintosh/i.test(ua);
  if (macLike && (input.maxTouchPoints ?? 0) > 1) return true;
  return false;
}

/** Server-side: User-Agent alene (iPadOS-desktop-UA kan slippe igennem — klienten sender derfor X-Allio-Desktop). */
export function isBlockedTimeClockUserAgent(ua: string | null | undefined): boolean {
  if (!ua?.trim()) return false;
  return isPhoneOrTabletDevice({ userAgent: ua, maxTouchPoints: 0, platform: "" });
}

export function isDesktopComputer(input?: Partial<DesktopComputerSignals>): boolean {
  const browser = typeof navigator !== "undefined";
  const userAgent = input?.userAgent ?? (browser ? navigator.userAgent : "");
  if (!userAgent) return false;
  const maxTouchPoints =
    input?.maxTouchPoints ?? (browser ? navigator.maxTouchPoints : 0);
  const platform = input?.platform ?? (browser ? navigator.platform : "");
  if (isPhoneOrTabletDevice({ userAgent, maxTouchPoints, platform })) return false;
  const hoverFine =
    input?.hoverFinePointer ??
    (typeof window !== "undefined" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches);
  return hoverFine === true;
}

export const DESKTOP_CLOCK_HEADER = "x-allio-desktop";
