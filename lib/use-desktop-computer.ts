"use client";

import { useEffect, useState } from "react";
import { isDesktopComputer } from "@/lib/desktop-computer";

/** false indtil vi har målt — så uret ikke blinker frem på iPad. */
export function useDesktopComputer(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    setOk(isDesktopComputer());
  }, []);
  return ok;
}
