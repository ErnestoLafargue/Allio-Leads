"use client";

import { StandaloneMeetingBooker } from "@/app/components/booking/standalone-meeting-booker";

export default function NewMeetingPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Nyt møde</h1>
        <p className="mt-1 text-sm text-stone-600">
          Book et nyt møde. Når du gemmer, oprettes mødet som et lead i kampagnen <strong>Kommende møder</strong>.
        </p>
      </div>

      <StandaloneMeetingBooker />
    </div>
  );
}

