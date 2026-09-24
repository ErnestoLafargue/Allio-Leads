/** Flash på /kampagner efter pause + gem (lukker dialeren). */
export const DIALER_PAUSE_FLASH_KEY = "allio-power-dialer-flash";
export const DIALER_AUTO_PAUSED_KEY = "allio-voip-auto-paused";
export const DIALER_START_PATH = "/kampagner";

export const DIALER_PAUSE_FLASH_MESSAGE =
  "Du er på pause. Kampagnen er lukket — start igen når du er klar.";

/** Ryd pause-flag og sæt forsides-besked. Returnerer stien til Start. */
export function markDialerPauseExit(opts?: { preferStorageKey?: string }): string {
  try {
    const storage = globalThis.sessionStorage;
    storage.removeItem(DIALER_AUTO_PAUSED_KEY);
    if (opts?.preferStorageKey) storage.removeItem(opts.preferStorageKey);
    storage.setItem(DIALER_PAUSE_FLASH_KEY, DIALER_PAUSE_FLASH_MESSAGE);
  } catch {
    /* sessionStorage kan mangle (SSR / privat tilstand) */
  }
  return DIALER_START_PATH;
}
