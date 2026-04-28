import { useCallback, useEffect, useRef } from "react";

/**
 * Efter opkald: Telnyx sender typisk `call.recording.saved` 2–10 sek. senere.
 * Mens aktivitets-draweren er åben, poller vi let så optagelsen vises uden manuel refresh.
 */
export function useActivityRecordingPoll(opts: {
  isDrawerOpen: boolean;
  bumpReload: () => void;
}) {
  const { isDrawerOpen, bumpReload } = opts;
  const openRef = useRef(isDrawerOpen);
  useEffect(() => {
    openRef.current = isDrawerOpen;
  }, [isDrawerOpen]);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const schedulePollAfterCall = useCallback(() => {
    bumpReload();
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    let ticks = 0;
    const maxTicks = 30;
    pollTimerRef.current = setInterval(() => {
      ticks += 1;
      if (openRef.current) bumpReload();
      if (ticks >= maxTicks && pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }, 2000);
  }, [bumpReload]);

  useEffect(
    () => () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    },
    [],
  );

  return schedulePollAfterCall;
}
