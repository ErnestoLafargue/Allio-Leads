import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DIALER_AUTO_PAUSED_KEY,
  DIALER_PAUSE_FLASH_KEY,
  DIALER_PAUSE_FLASH_MESSAGE,
  DIALER_START_PATH,
  markDialerPauseExit,
} from "./dialer-pause-exit";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

describe("markDialerPauseExit", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: memoryStorage(),
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "sessionStorage");
  });

  it("rydder pause-flag, sætter flash og peger på Start", () => {
    globalThis.sessionStorage.setItem(DIALER_AUTO_PAUSED_KEY, "1");
    globalThis.sessionStorage.setItem("kampagne-arbejd-prefer:c1", "lead-1");

    const path = markDialerPauseExit({ preferStorageKey: "kampagne-arbejd-prefer:c1" });

    expect(path).toBe(DIALER_START_PATH);
    expect(globalThis.sessionStorage.getItem(DIALER_AUTO_PAUSED_KEY)).toBeNull();
    expect(globalThis.sessionStorage.getItem("kampagne-arbejd-prefer:c1")).toBeNull();
    expect(globalThis.sessionStorage.getItem(DIALER_PAUSE_FLASH_KEY)).toBe(DIALER_PAUSE_FLASH_MESSAGE);
  });
});
