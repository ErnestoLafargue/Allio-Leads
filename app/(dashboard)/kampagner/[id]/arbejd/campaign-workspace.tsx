"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { LEAD_STATUSES, LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/lead-status";
import { OUTCOME_ORDER, outcomeButtonClass } from "@/lib/lead-outcome-ui";
import { LeadDataLeftPanel } from "@/app/components/lead-data-left-panel";
import { parseCustomFields } from "@/lib/custom-fields";
import { BookingPanel, type BookingConfirmPayload } from "@/app/components/booking/booking-panel";
import { MeetingContactFields } from "@/app/components/booking/meeting-contact-fields";
import { validateMeetingContactFields } from "@/lib/meeting-contact-validation";

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
    setStatus((LEAD_STATUSES as readonly string[]).includes(l.status) ? (l.status as LeadStatus) : "NEW");
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
    const t = window.setInterval(() => {
      void fetch(`/api/leads/${id}/lock`, { method: "PATCH" }).catch(() => {});
    }, LOCK_HEARTBEAT_MS);
    return () => clearInterval(t);
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
      body: JSON.stringify({}),
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
            Når voicemail eller «Ikke hjemme» er udløbet, eller et lead frigives, dukker det i køen igen.
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

  const lockExpiryLabel = current.lockExpiresAt
    ? new Date(current.lockExpiresAt).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="flex min-h-[calc(100dvh-5.5rem)] flex-col gap-4 pb-4">
      <div className="shrink-0">
        <Link href="/kampagner" className="text-sm text-stone-500 hover:text-stone-800">
          ← Kampagner
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-stone-900">{campaignName}</h1>
        <p className="mt-1 text-xs text-stone-600">
          Dette lead er <strong>reserveret til dig</strong>, så kolleger ikke kan ringe på samme nummer
          samtidig. Låset udløber kl. {lockExpiryLabel ?? "—"} hvis siden står uden aktivitet — vi forlænger
          automatisk mens du arbejder her.
        </p>
      </div>

      <div className="shrink-0 space-y-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-lg sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
          <div className="min-w-0 flex-1 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Udfald</p>
            <div className="flex flex-wrap gap-2 sm:gap-3">
              {OUTCOME_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={outcomeButtonClass(s, status === s)}
                >
                  {LEAD_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
            {status === "MEETING_BOOKED" && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
                <p className="text-xs font-medium text-emerald-900">Møde tid (påkrævet)</p>
                <p className="mt-1 text-xs text-emerald-800/90">
                  Vælg dato og tidspunkt i kalenderen nedenfor. Tryk «Bekræft booking» for at gemme og gå videre
                  (samme som «Næste»).
                </p>
                {meetingBookedAt && (
                  <p className="mt-2 text-xs text-emerald-800">
                    Booket den {new Date(meetingBookedAt).toLocaleString("da-DK")}
                  </p>
                )}
                {bookedByUser && (
                  <p className="text-xs text-emerald-800">
                    Af {bookedByUser.name} ({bookedByUser.username})
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="flex justify-end lg:shrink-0 lg:pt-6">{renderNextButton()}</div>
        </div>
      </div>

      {error && <p className="shrink-0 text-sm text-red-600">{error}</p>}

      <div
        key={`${current.id}-kunde-noter`}
        className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-lg lg:grid-cols-2 lg:min-h-[calc(100dvh-15rem)]"
      >
        <div className="flex min-h-[42dvh] min-w-0 flex-col border-b border-stone-100 p-4 sm:p-6 lg:min-h-full lg:border-b-0 lg:border-r lg:border-stone-100">
          <h2 className="mb-3 shrink-0 text-xs font-semibold uppercase tracking-wide text-stone-500">Kunde</h2>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <LeadDataLeftPanel
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
            />
          </div>
        </div>
        <div className="flex min-w-0 flex-col items-stretch p-4 sm:p-6 lg:h-full lg:items-start">
          <h2 className="mb-3 shrink-0 text-xs font-semibold uppercase tracking-wide text-stone-500">Noter</h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="min-h-[4.5rem] h-48 w-full max-w-full resize-y rounded-xl border border-stone-200 bg-stone-50/80 px-4 py-3 text-sm text-stone-900 shadow-inner outline-none ring-stone-400 focus:ring-2"
            placeholder="Skriv noter… Træk i nederste kant for kortere eller længere."
            rows={6}
          />
          <MeetingContactFields
            className="mt-4 shrink-0"
            contactRequired={status === "MEETING_BOOKED"}
            fieldErrors={status === "MEETING_BOOKED" ? meetingContactErrors : undefined}
            meetingContactName={meetingContactName}
            meetingContactEmail={meetingContactEmail}
            meetingContactPhonePrivate={meetingContactPhonePrivate}
            onMeetingContactName={(v) => {
              setMeetingContactName(v);
              setMeetingContactErrors((prev) => ({ ...prev, name: undefined }));
            }}
            onMeetingContactEmail={(v) => {
              setMeetingContactEmail(v);
              setMeetingContactErrors((prev) => ({ ...prev, email: undefined }));
            }}
            onMeetingContactPhonePrivate={(v) => {
              setMeetingContactPhonePrivate(v);
              setMeetingContactErrors((prev) => ({ ...prev, phone: undefined }));
            }}
          />
        </div>
      </div>

      <BookingPanel
        campaignId={campaignId}
        leadId={current.id}
        initialMeetingLocal={status === "MEETING_BOOKED" ? meetingScheduledFor || undefined : undefined}
        isSubmitting={saving}
        allowMeetingConfirm={status === "MEETING_BOOKED"}
        onConfirmBooking={onConfirmBookingFromPanel}
      />

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-stone-200 pt-4">
        {renderNextButton()}
      </div>
    </div>
  );
}
