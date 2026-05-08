import { isTelnyxChannelLimitError } from "@/lib/telnyx-call-control";

export function classifyPredictiveDialFailure(dial: { message: string; telnyx?: unknown }) {
  return isTelnyxChannelLimitError(dial.message) || isTelnyxChannelLimitError(dial.telnyx)
    ? "TELNYX_CHANNEL_LIMIT"
    : "TELNYX_DIAL_FAILED";
}

