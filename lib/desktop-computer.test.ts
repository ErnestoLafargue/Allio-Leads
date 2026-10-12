import { describe, expect, it } from "vitest";
import {
  isBlockedTimeClockUserAgent,
  isDesktopComputer,
  isPhoneOrTabletDevice,
} from "./desktop-computer";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD =
  "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPADOS_DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const ANDROID_PHONE =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const ANDROID_TABLET =
  "Mozilla/5.0 (Linux; Android 14; SM-X810) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const MAC_DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const WIN_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

describe("isPhoneOrTabletDevice", () => {
  it("fanger iPhone, iPad og Android", () => {
    expect(isPhoneOrTabletDevice({ userAgent: IPHONE })).toBe(true);
    expect(isPhoneOrTabletDevice({ userAgent: IPAD })).toBe(true);
    expect(isPhoneOrTabletDevice({ userAgent: ANDROID_PHONE })).toBe(true);
    expect(isPhoneOrTabletDevice({ userAgent: ANDROID_TABLET })).toBe(true);
  });

  it("fanger iPadOS der udgiver sig for at være Mac", () => {
    expect(
      isPhoneOrTabletDevice({
        userAgent: IPADOS_DESKTOP_UA,
        platform: "MacIntel",
        maxTouchPoints: 5,
      }),
    ).toBe(true);
  });

  it("lader rigtige computere passere", () => {
    expect(
      isPhoneOrTabletDevice({
        userAgent: MAC_DESKTOP,
        platform: "MacIntel",
        maxTouchPoints: 0,
      }),
    ).toBe(false);
    expect(
      isPhoneOrTabletDevice({
        userAgent: WIN_DESKTOP,
        platform: "Win32",
        maxTouchPoints: 10,
      }),
    ).toBe(false);
  });
});

describe("isDesktopComputer", () => {
  it("kræver mus/trackpad (hover + fine pointer)", () => {
    expect(
      isDesktopComputer({
        userAgent: WIN_DESKTOP,
        platform: "Win32",
        maxTouchPoints: 0,
        hoverFinePointer: true,
      }),
    ).toBe(true);
    expect(
      isDesktopComputer({
        userAgent: WIN_DESKTOP,
        platform: "Win32",
        maxTouchPoints: 0,
        hoverFinePointer: false,
      }),
    ).toBe(false);
  });

  it("afviser iPad selv med fine pointer", () => {
    expect(
      isDesktopComputer({
        userAgent: IPADOS_DESKTOP_UA,
        platform: "MacIntel",
        maxTouchPoints: 5,
        hoverFinePointer: true,
      }),
    ).toBe(false);
  });
});

describe("isBlockedTimeClockUserAgent", () => {
  it("blokerer tydelige mobil-UA'er, men ikke Mac-desktop-UA alene", () => {
    expect(isBlockedTimeClockUserAgent(IPHONE)).toBe(true);
    expect(isBlockedTimeClockUserAgent(IPAD)).toBe(true);
    expect(isBlockedTimeClockUserAgent(ANDROID_PHONE)).toBe(true);
    expect(isBlockedTimeClockUserAgent(MAC_DESKTOP)).toBe(false);
    expect(isBlockedTimeClockUserAgent("")).toBe(false);
  });
});
