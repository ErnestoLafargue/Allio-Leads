"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/lead-status";
import { parseCustomFields } from "@/lib/custom-fields";
import type { BookingConfirmPayload } from "@/app/components/booking/booking-panel";
import { LeadOutcomeStrip } from "@/app/components/lead-workspace/lead-outcome-strip";
import { LeadKundeNoterBooking } from "@/app/components/lead-workspace/lead-kunde-noter-booking";
import { validateMeetingContactFields } from "@/lib/meeting-contact-validation";
import { CallbackScheduleDialog } from "@/app/components/callback-schedule-dialog";

type Lead = {
  id: string;
  companyName: string;
  phone: string;
  email: string;
  cvr: string;
  address: string;
  postalCode: string;
  city: string;
  industry: string;
  notes: string;
  customFields: string;
  status: string;
  importedAt: string;
  updatedAt: string;
  meetingBookedAt: string | null;
  meetingScheduledFor: string | null;
  bookedByUser: { name: string; username: string } | null;
  meetingContactName?: string;
  meetingContactEmail?: string;
  meetingContactPhonePrivate?: string;
  lockedByUserId?: string | null;
  lockedAt?: string | null;
  lockExpiresAt?: string | null;
  lockedByUser?: { id: string; name: string; username: string } | null;
  callbackScheduledFor?: string | null;
  callbackReservedByUserId?: string | null;
};

type Props = { campaignId: string };

const LOCK_HEARTBEAT_MS = 25_000;

function preferStorageKey(campaignId: string) {
  return `kampagne-arbejd-prefer:${campaignId}`;
}

async function releaseLockHttp(leadId: string) {
  await fetch(`/api/leads/${leadId}/lock`, { method: "DELETE", keepalive: true }).catch(() => {});
}

export function CampaignWorkspace({ campaignId }: Props) {
  const { data: session } = useSession();
  const sessionUserId = session?.user?.id ?? "";
  const [campaignName, setCampaignName] = useState("");
  const [fieldConfigJson, setFieldConfigJson] = useState("{}");
  const [campaignLeadCount, setCampaignLeadCount] = useState<number | null>(null);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const activeLeadRef = useRef<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [cvr, setCvr] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [industry, setIndustry] = useState("");
  const [notes, setNotes] = useState("");
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<LeadStatus>("NEW");
  const [meetingScheduledFor, setMeetingScheduledFor] = useState("");
  const [meetingBookedAt, setMeetingBookedAt] = useState<string | null>(null);
  const [bookedByUser, setBookedByUser] = useState<Lead["bookedByUser"]>(null);
  const [meetingContactName, setMeetingContactName] = useState("");
  const [meetingContactEmail, setMeetingContactEmail] = useState("");
  const [meetingContactPhonePrivate, setMeetingContactPhonePrivate] = useState("");
  const [meetingContactErrors, setMeetingContactErrors] = useState<{
    name?: string;
    email?: string;
    phone?: string;
  }>({});
  const [callbackDialogOpen, setCallbackDialogOpen] = useState(false);
  const [callbackSubmitError, setCallbackSubmitError] = useState<string | null>(null);

  useEffect(() => {
    activeLeadRef.current = activeLead;
  }, [activeLead]);

  useEffect(() => {
    return () => {
      const id = activeLeadRef.current?.id;
      if (id) void releaseLockHttp(id);
    };
  }, [campaignId]);

  const loadFormFromLead = useCallback((l: Lead) => {
    setCompanyName(l.companyName);
    setPhone(l.phone);
    setEmail(l.email ?? "");
    setCvr(l.cvr);
    setAddress(l.address);
    setPostalCode(l.postalCode ?? "");
    setCity(l.city ?? "");
    setIndustry(l.industry);
    setNotes(l.notes);
    setCustom(parseCustomFields(l.customFields));
    setStatus(
      l.status === "CALLBACK_SCHEDULED"
        ? "NEW"
        : (LEAD_STATUSES as readonly string[]).includes(l.status)
          ? (l.status as LeadStatus)
          : "NEW",
    );
    if (l.meetingScheduledFor) {
      const d = new Date(l.meetingScheduledFor);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
      setMeetingScheduledFor(local.toISOString().slice(0, 16));
    } else {
      setMeetingScheduledFor("");
    }
    setMeetingBookedAt(l.meetingBookedAt);
    setBookedByUser(l.bookedByUser);
    setMeetingContactName(l.meetingContactName ?? "");
    setMeetingContactEmail(l.meetingContactEmail ?? "");
    setMeetingContactPhonePrivate(l.meetingContactPhonePrivate ?? "");
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setDone(false);
      const cRes = await fetch(`/api/campaigns/${campaignId}`);
      if (!cRes.ok) {
        if (!cancelled) {
          setError("Kunne ikke hente kampagne.");
          setLoading(false);
        }
        return;
      }
      const c = await cRes.json();
      const total = typeof c._count?.leads === "number" ? c._count.leads : 0;
      const preferRaw =
        typeof window !== "undefined" ? sessionStorage.getItem(preferStorageKey(campaignId)) : null;
      const preferLeadId = preferRaw?.trim() || undefined;
      const rRes = await fetch(`/api/campaigns/${campaignId}/reserve-next`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferLeadId }),
      });
      if (!rRes.ok) {
        const j = await rRes.json().catch(() => ({}));
        if (!cancelled) {
          setError(typeof j.error === "string" ? j.error : "Kunne ikke reservere lead.");
          setCampaignName(c.name ?? "");
          setFieldConfigJson(c.fieldConfig ?? "{}");
          setCampaignLeadCount(total);
          setActiveLead(null);
          setLoading(false);
        }
        return;
      }
      const rj = (await rRes.json()) as { lead: Lead | null };
      if (cancelled) return;
      setCampaignName(c.name ?? "");
      setFieldConfigJson(c.fieldConfig ?? "{}");
      setCampaignLeadCount(total);
      if (rj.lead) {
        setActiveLead(rj.lead);
        try {
          sessionStorage.setItem(preferStorageKey(campaignId), rj.lead.id);
        } catch {
          /* ignore */
        }
      } else {
        setActiveLead(null);
        try {
          sessionStorage.removeItem(preferStorageKey(campaignId));
        } catch {
          /* ignore */
        }
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  useEffect(() => {
    if (!activeLead?.id) return;
    const id = activeLead.id;
    void fetch(`/api/leads/${id}/lock`, { method: "PATCH" }).catch(() => {});
    const t = window.setInterval(() => {
      void fetch(`/api/leads/${id}/lock`, { method: "PATCH" }).catch(() => {});
    }, LOCK_HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [activeLead?.id]);

  useEffect(() => {
    if (!activeLead?.id) return;
    const id = activeLead.id;
    function refreshLockFromFocus() {
      void fetch(`/api/leads/${id}/lock`, { method: "PATCH" }).catch(() => {});
    }
    function onVisibility() {
      if (document.visibilityState === "visible") refreshLockFromFocus();
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", refreshLockFromFocus);
    window.addEventListener("pageshow", refreshLockFromFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", refreshLockFromFocus);
      window.removeEventListener("pageshow", refreshLockFromFocus);
    };
  }, [activeLead?.id]);

  useEffect(() => {
    if (!activeLead) return;
    loadFormFromLead(activeLead);
  }, [activeLead, loadFormFromLead]);

  useEffect(() => {
    if (status !== "MEETING_BOOKED") setMeetingContactErrors({});
  }, [status]);

  function setCustomKey(key: string, value: string) {
    setCustom((prev) => ({ ...prev, [key]: value }));
  }

  async function saveLead(
    l: Lead,
    meetingScheduledForISO?: string,
  ): Promise<{ next: Lead[]; updated: Lead } | null> {
    const body: Record<string, unknown> = {
      companyName,
      phone,
      email,
      cvr,
      address,
      postalCode,
      city,
      industry,
      notes,
      customFields: custom,
      status,
    };
    if (status === "MEETING_BOOKED") {
      const iso =
        meetingScheduledForISO ??
        (meetingScheduledFor ? new Date(meetingScheduledFor).toISOString() : undefined);
      body.meetingScheduledFor = iso;
      body.meetingContactName = meetingContactName.trim();
      body.meetingContactEmail = meetingContactEmail.trim();
      body.meetingContactPhonePrivate = meetingContactPhonePrivate.trim();
    }
    const res = await fetch(`/api/leads/${l.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Kunne ikke gemme");
      return null;
    }
    const updated: Lead = await res.json();
    setActiveLead(updated);
    setMeetingBookedAt(updated.meetingBookedAt);
    setBookedByUser(updated.bookedByUser);
    setMeetingContactName(updated.meetingContactName ?? "");
    setMeetingContactEmail(updated.meetingContactEmail ?? "");
    setMeetingContactPhonePrivate(updated.meetingContactPhonePrivate ?? "");
    setError(null);
    return { next: [], updated };
  }

  async function advanceToNextReservedAfterSave(savedLeadId: string) {
    await releaseLockHttp(savedLeadId);
    const rRes = await fetch(`/api/campaigns/${campaignId}/reserve-next`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ excludeLeadId: savedLeadId }),
    });
    if (!rRes.ok) {
      const j = await rRes.json().catch(() => ({}));
      setError(typeof j.error === "string" ? j.error : "Kunne ikke hente næste lead.");
      setDone(true);
      try {
        sessionStorage.removeItem(preferStorageKey(campaignId));
      } catch {
        /* ignore */
      }
      return;
    }
    const rj = (await rRes.json()) as { lead: Lead | null };
    if (rj.lead) {
      setActiveLead(rj.lead);
      try {
        sessionStorage.setItem(preferStorageKey(campaignId), rj.lead.id);
      } catch {
        /* ignore */
      }
    } else {
      setActiveLead(null);
      setDone(true);
      try {
        sessionStorage.removeItem(preferStorageKey(campaignId));
      } catch {
        /* ignore */
      }
    }
  }

  async function onNext(meetingScheduledForISO?: string) {
    if (!activeLead) return;
    if (status === "MEETING_BOOKED") {
      const iso =
        meetingScheduledForISO ??
        (meetingScheduledFor ? new Date(meetingScheduledFor).toISOString() : undefined);
      const contactErr = validateMeetingContactFields(
        meetingContactName,
        meetingContactEmail,
        meetingContactPhonePrivate,
      );
      if (contactErr) setMeetingContactErrors(contactErr);
      else setMeetingContactErrors({});

      const parts: string[] = [];
      if (!iso) {
        parts.push("Vælg dato og tid i kalenderen og tryk «Bekræft booking».");
      }
      if (contactErr) {
        parts.push("Du skal udfylde mødekontakt-oplysningerne, før mødet kan bookes.");
      }
      if (!iso || contactErr) {
        setError(parts.join(" "));
        return;
      }
    }

    const currentId = activeLead.id;

    setSaving(true);
    setError(null);
    const saved = await saveLead(activeLead, meetingScheduledForISO);
    setSaving(false);
    if (!saved) return;

    if (meetingScheduledForISO) {
      const d = new Date(meetingScheduledForISO);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
      setMeetingScheduledFor(local.toISOString().slice(0, 16));
    }

    await advanceToNextReservedAfterSave(currentId);
  }

  function openCallbackDialog() {
    setCallbackSubmitError(null);
    setError(null);
    setCallbackDialogOpen(true);
  }

  async function handleConfirmCallback(payload: {
    assignedUserId: string;
    scheduledForISO: string;
    note: string;
  }) {
    if (!activeLead || activeLead.status !== "NEW") return;
    setSaving(true);
    setCallbackSubmitError(null);
    setError(null);
    const res = await fetch(`/api/leads/${activeLead.id}/schedule-callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduledFor: payload.scheduledForISO,
        assignedUserId: payload.assignedUserId,
        note: payload.note,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setCallbackSubmitError(typeof j.error === "string" ? j.error : "Kunne ikke planlægge tilbagekald.");
      return;
    }
    setCallbackDialogOpen(false);
    await advanceToNextReservedAfterSave(activeLead.id);
  }

  async function onConfirmBookingFromPanel(detail: BookingConfirmPayload) {
    if (!activeLead || status !== "MEETING_BOOKED") return;
    await onNext(detail.localDateTimeISO);
  }

  if (loading) {
    return <div className="py-12 text-center text-stone-500">Henter kampagne og reserverer lead…</div>;
  }

  if (error && !campaignName && activeLead === null && !done) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/kampagner" className="text-sm font-medium text-stone-700 underline-offset-2 hover:underline">
          ← Tilbage til kampagner
        </Link>
      </div>
    );
  }

  if (campaignLeadCount === 0) {
    return (
      <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="text-lg font-semibold text-stone-900">Ingen leads i denne kampagne</h1>
        <Link href="/kampagner" className="text-sm font-medium text-stone-700 underline-offset-2 hover:underline">
          ← Tilbage til kampagner
        </Link>
      </div>
    );
  }

  if (!done && !activeLead) {
    return (
      <div className="space-y-6">
        <div>
          <Link href="/kampagner" className="text-sm text-stone-500 hover:text-stone-800">
            ← Kampagner
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-stone-900">{campaignName}</h1>
        </div>
        <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-8 text-center shadow-sm">
          <p className="text-stone-800">
            Der er ingen <strong>Ny</strong>-leads tilgængelige lige nu — de kan være i et andet udfald, eller{" "}
            <strong>optaget</strong> af kolleger der også arbejder i kampagnen. Prøv igen om lidt.
          </p>
          <p className="text-sm text-stone-600">
            Når voicemail eller «Ikke hjemme» er udløbet, et lead frigives, eller et planlagt callback når tidspunktet
            (eller du loader siden igen), dukker det i køen igen.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="button"
            onClick={() => {
              setError(null);
              void (async () => {
                setLoading(true);
                try {
                  const rRes = await fetch(`/api/campaigns/${campaignId}/reserve-next`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({}),
                  });
                  if (rRes.ok) {
                    const rj = (await rRes.json()) as { lead: Lead | null };
                    if (rj.lead) {
                      setActiveLead(rj.lead);
                      try {
                        sessionStorage.setItem(preferStorageKey(campaignId), rj.lead.id);
                      } catch {
                        /* ignore */
                      }
                    }
                  } else {
                    const j = await rRes.json().catch(() => ({}));
                    setError(typeof j.error === "string" ? j.error : "Kunne ikke reservere.");
                  }
                } finally {
                  setLoading(false);
                }
              })();
            }}
            className="inline-block rounded-md bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-900"
          >
            Prøv igen
          </button>
          <div>
            <Link
              href="/kampagner"
              className="inline-block text-sm font-medium text-stone-800 underline-offset-2 hover:underline"
            >
              ← Tilbage til kampagner
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-6 rounded-xl border border-emerald-200 bg-emerald-50/80 p-10 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-emerald-950">Du er igennem køen</h1>
        <p className="text-sm text-emerald-900">
          Der er ikke flere ledige «Ny»-leads i «{campaignName}» lige nu (med dit arbejdsflow).
        </p>
        <Link
          href="/kampagner"
          className="inline-block rounded-md bg-emerald-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-900"
        >
          Tilbage til kampagner
        </Link>
      </div>
    );
  }

  const current = activeLead!;

  const canScheduleCallback = current.status === "NEW";

  const showNextForMeeting = status !== "MEETING_BOOKED";
  const nextLabel = saving ? "Gemmer…" : "Gem og næste";
  const nextButtonClass =
    "rounded-xl bg-stone-900 px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-stone-800 disabled:opacity-60 shrink-0";

  function renderNextButton() {
    if (!showNextForMeeting) return null;
    return (
      <button type="button" disabled={saving} onClick={() => void onNext()} className={nextButtonClass}>
        {nextLabel}
      </button>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-5.5rem)] flex-col gap-4 pb-4">
      <div className="shrink-0">
        <Link href="/kampagner" className="text-sm text-stone-500 hover:text-stone-800">
          ← Kampagner
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-stone-900">{campaignName}</h1>
        <p className="mt-1 text-xs text-stone-600">
          Dette lead er <strong>låst til dig</strong>, så længe du har denne side åben — kolleger kan ikke åbne
          eller reservere det samme nummer samtidig. Når du går videre eller lukker fanen, frigives låset. Mens du
          arbejder her, fornyes det automatisk.
        </p>
        {current.status === "CALLBACK_SCHEDULED" && current.callbackScheduledFor && (
          <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50/90 px-3 py-2 text-xs text-violet-950">
            <strong>Planlagt genopkald:</strong>{" "}
            {new Date(current.callbackScheduledFor).toLocaleString("da-DK", {
              dateStyle: "short",
              timeStyle: "short",
            })}
            . Vælg udfald og gem — eller «Gem og næste» med «Ny» for at lægge leadet tilbage som nyt i køen.
          </div>
        )}
      </div>

      <LeadOutcomeStrip
        status={status}
        onStatusChange={setStatus}
        meetingBookedAt={meetingBookedAt}
        bookedByUser={bookedByUser}
        inlineAfterOutcomes={
          canScheduleCallback ? (
            <button
              type="button"
              disabled={saving || !sessionUserId}
              onClick={openCallbackDialog}
              className="rounded-xl border-2 border-violet-600 bg-violet-100 px-4 py-3 text-sm font-semibold text-violet-950 shadow-sm transition hover:bg-violet-200 disabled:opacity-60 min-w-[8rem]"
            >
              Tilbagekald
            </button>
          ) : null
        }
        rightColumn={
          <>
            {status === "NEW" && showNextForMeeting ? (
              <p className="max-w-[14rem] text-right text-xs text-stone-500">
                Gemmer noter og går til næste lead uden at ændre udfald.
              </p>
            ) : null}
            {renderNextButton()}
          </>
        }
      />

      {error && <p className="shrink-0 text-sm text-red-600">{error}</p>}

      <LeadKundeNoterBooking
        gridKey={`${current.id}-kunde-noter`}
        gridClassName="flex-1"
        fieldConfigJson={fieldConfigJson}
        companyName={companyName}
        onCompanyName={setCompanyName}
        phone={phone}
        onPhone={setPhone}
        email={email}
        onEmail={setEmail}
        cvr={cvr}
        onCvr={setCvr}
        address={address}
        onAddress={setAddress}
        postalCode={postalCode}
        onPostalCode={setPostalCode}
        city={city}
        onCity={setCity}
        industry={industry}
        onIndustry={setIndustry}
        custom={custom}
        onCustom={setCustomKey}
        notes={notes}
        onNotesChange={setNotes}
        meetingContact={{
          meetingContactName,
          meetingContactEmail,
          meetingContactPhonePrivate,
          onMeetingContactName: (v) => {
            setMeetingContactName(v);
            setMeetingContactErrors((prev) => ({ ...prev, name: undefined }));
          },
          onMeetingContactEmail: (v) => {
            setMeetingContactEmail(v);
            setMeetingContactErrors((prev) => ({ ...prev, email: undefined }));
          },
          onMeetingContactPhonePrivate: (v) => {
            setMeetingContactPhonePrivate(v);
            setMeetingContactErrors((prev) => ({ ...prev, phone: undefined }));
          },
          contactRequired: status === "MEETING_BOOKED",
          meetingContactErrors: status === "MEETING_BOOKED" ? meetingContactErrors : undefined,
        }}
        booking={{
          campaignId,
          leadId: current.id,
          initialMeetingLocal: status === "MEETING_BOOKED" ? meetingScheduledFor || undefined : undefined,
          isSubmitting: saving,
          allowMeetingConfirm: status === "MEETING_BOOKED",
          onConfirmBooking: onConfirmBookingFromPanel,
        }}
        bottomBar={renderNextButton()}
      />

      <CallbackScheduleDialog
        open={callbackDialogOpen}
        currentUserId={sessionUserId}
        saving={saving}
        errorText={callbackSubmitError}
        onClose={() => {
          setCallbackDialogOpen(false);
          setCallbackSubmitError(null);
        }}
        onConfirm={(p) => void handleConfirmCallback(p)}
      />
    </div>
  );
}
