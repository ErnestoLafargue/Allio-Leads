"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/lead-status";
import { isQueueEligibleStatus, sortLeadsForQueue } from "@/lib/lead-queue";
import { MeetingOutcomeSelect } from "@/app/components/meeting-outcome-select";
import { LeadOutcomeStrip } from "@/app/components/lead-workspace/lead-outcome-strip";
import { LeadKundeNoterBooking } from "@/app/components/lead-workspace/lead-kunde-noter-booking";
import { CallbackScheduleDialog } from "@/app/components/callback-schedule-dialog";
import { SendStandardMailDialog } from "@/app/components/send-standard-mail-dialog";
import type { BookingConfirmPayload } from "@/app/components/booking/booking-panel";
import { parseCustomFields } from "@/lib/custom-fields";
import { validateMeetingContactFields } from "@/lib/meeting-contact-validation";
import {
  meetingOutcomeBadgeClass,
  MEETING_OUTCOME_LABELS,
  MEETING_OUTCOME_PENDING,
  MEETING_OUTCOME_REBOOK,
  MEETING_OUTCOME_SALE,
} from "@/lib/meeting-outcome";
import { defaultCampaignFieldConfigJson } from "@/lib/campaign-fields";
import { isValidCVR } from "@/lib/cvr-import";

type Lead = {
  id: string;
  campaignId: string | null;
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
  meetingBookedAt: string | null;
  meetingScheduledFor: string | null;
  bookedByUser: { name: string; username: string } | null;
  meetingContactName?: string;
  meetingContactEmail?: string;
  meetingContactPhonePrivate?: string;
  meetingOutcomeStatus?: string;
  campaign: { id: string; name: string; fieldConfig: string } | null;
  lockedByUserId?: string | null;
  lockExpiresAt?: string | null;
  lockedByUser?: { name: string; username: string } | null;
  callbackScheduledFor?: string | null;
  callbackStatus?: string | null;
};

type QueueInfo = { ids: string[]; position: number };

function LeadDetailInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromCampaign = searchParams.get("fromCampaign")?.trim() ?? "";
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";
  const myUserId = session?.user?.id ?? "";

  const [editLockBlocked, setEditLockBlocked] = useState(false);
  const [lockBusyMessage, setLockBusyMessage] = useState<string | null>(null);
  const [holdsEditLock, setHoldsEditLock] = useState(false);
  const leadIdRef = useRef<string | null>(null);
  const holdsLockRef = useRef(false);

  const [lead, setLead] = useState<Lead | null>(null);
  const [forbidden, setForbidden] = useState(false);
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
  const [meetingContactName, setMeetingContactName] = useState("");
  const [meetingContactEmail, setMeetingContactEmail] = useState("");
  const [meetingContactPhonePrivate, setMeetingContactPhonePrivate] = useState("");
  const [meetingContactErrors, setMeetingContactErrors] = useState<{
    name?: string;
    email?: string;
    phone?: string;
  }>({});
  const [meetingOutcomeStatus, setMeetingOutcomeStatus] = useState(MEETING_OUTCOME_PENDING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueInfo | null>(null);
  const [virkEnrichLoading, setVirkEnrichLoading] = useState(false);
  const [virkEnrichFeedback, setVirkEnrichFeedback] = useState<string | null>(null);
  const [virkNoDataFieldKeys, setVirkNoDataFieldKeys] = useState<string[]>([]);
  const [virkNoDataToken, setVirkNoDataToken] = useState(0);

  const leadWorkspaceRef = useRef<HTMLDivElement>(null);
  const [deletingLead, setDeletingLead] = useState(false);
  const [callbackDialogOpen, setCallbackDialogOpen] = useState(false);
  const [callbackSubmitError, setCallbackSubmitError] = useState<string | null>(null);
  const [mailDialogOpen, setMailDialogOpen] = useState(false);
  const [mailSending, setMailSending] = useState(false);
  const [mailError, setMailError] = useState<string | null>(null);
  const [mailSuccess, setMailSuccess] = useState<string | null>(null);

  const fixedMailFrom = "hej@allio.dk";

  function setCustomKey(key: string, value: string) {
    setCustom((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    setMailSuccess(null);
    setMailError(null);
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const res = await fetch(`/api/leads/${id}`);
      if (res.status === 403) {
        setForbidden(true);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const data: Lead = await res.json();
      if (cancelled) return;
      setLead(data);
      setCompanyName(data.companyName);
      setPhone(data.phone);
      setEmail(data.email ?? "");
      setCvr(data.cvr);
      setAddress(data.address);
      setPostalCode(data.postalCode ?? "");
      setCity(data.city ?? "");
      setIndustry(data.industry);
      setNotes(data.notes);
      setCustom(parseCustomFields(data.customFields));
      setStatus(
        data.status === "CALLBACK_SCHEDULED"
          ? "NEW"
          : (LEAD_STATUSES as readonly string[]).includes(data.status)
            ? (data.status as LeadStatus)
            : "NEW",
      );
      if (data.meetingScheduledFor) {
        const d = new Date(data.meetingScheduledFor);
        const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
        setMeetingScheduledFor(local.toISOString().slice(0, 16));
      } else {
        setMeetingScheduledFor("");
      }
      setMeetingContactName(data.meetingContactName ?? "");
      setMeetingContactEmail(data.meetingContactEmail ?? "");
      setMeetingContactPhonePrivate(data.meetingContactPhonePrivate ?? "");
      setMeetingOutcomeStatus(
        String(data.meetingOutcomeStatus ?? "").trim().toUpperCase() || MEETING_OUTCOME_PENDING,
      );
      setForbidden(false);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    leadIdRef.current = lead?.id ?? null;
  }, [lead?.id]);

  useEffect(() => {
    holdsLockRef.current = holdsEditLock;
  }, [holdsEditLock]);

  useEffect(() => {
    return () => {
      const lid = leadIdRef.current;
      if (lid && holdsLockRef.current) {
        void fetch(`/api/leads/${lid}/lock`, { method: "DELETE", keepalive: true }).catch(() => {});
      }
    };
  }, [id]);

  useEffect(() => {
    if (!lead?.id || !myUserId) return;
    if (isAdmin || String(lead.status).trim().toUpperCase() !== "NEW") {
      setEditLockBlocked(false);
      setLockBusyMessage(null);
      setHoldsEditLock(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const r = await fetch(`/api/leads/${lead.id}/lock`, { method: "POST" });
      if (cancelled) return;
      if (r.ok) {
        const j = (await r.json().catch(() => null)) as { lead?: Lead } | null;
        setHoldsEditLock(true);
        setEditLockBlocked(false);
        setLockBusyMessage(null);
        if (j?.lead) setLead(j.lead);
      } else if (r.status === 409) {
        const j = (await r.json().catch(() => ({}))) as {
          lockedBy?: { name?: string; username?: string } | null;
        };
        setHoldsEditLock(false);
        setEditLockBlocked(true);
        const n = j.lockedBy?.name ?? j.lockedBy?.username ?? "en kollega";
        setLockBusyMessage(`Dette lead er optaget — ${n} arbejder på det lige nu. Du kan se kort, men ikke redigere.`);
      } else {
        setHoldsEditLock(false);
        setEditLockBlocked(false);
        setLockBusyMessage(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lead?.id, lead?.status, isAdmin, myUserId]);

  useEffect(() => {
    if (!holdsEditLock || !lead?.id) return;
    const lid = lead.id;
    void fetch(`/api/leads/${lid}/lock`, { method: "PATCH" }).catch(() => {});
    const t = window.setInterval(() => {
      void fetch(`/api/leads/${lid}/lock`, { method: "PATCH" }).catch(() => {});
    }, 25_000);
    return () => clearInterval(t);
  }, [holdsEditLock, lead?.id]);

  useEffect(() => {
    if (!holdsEditLock || !lead?.id) return;
    const lid = lead.id;
    function refreshLockFromFocus() {
      void fetch(`/api/leads/${lid}/lock`, { method: "PATCH" }).catch(() => {});
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
  }, [holdsEditLock, lead?.id]);

  useEffect(() => {
    if (!fromCampaign || !lead || lead.campaignId !== fromCampaign) {
      setQueue(null);
      return;
    }
    let cancelled = false;
    async function loadQueue() {
      const res = await fetch(`/api/leads?campaignId=${encodeURIComponent(fromCampaign)}`);
      if (!res.ok || cancelled) return;
      const rows: {
        id: string;
        status: string;
        importedAt: string;
        hasOutcomeLogToday?: boolean;
      }[] = await res.json();
      const sorted = sortLeadsForQueue(rows.filter((r) => isQueueEligibleStatus(r.status)));
      const ids = sorted.map((r) => r.id);
      const position = ids.indexOf(id);
      if (position >= 0) {
        setQueue({ ids, position: position + 1 });
      } else {
        setQueue(null);
      }
    }
    void loadQueue();
    return () => {
      cancelled = true;
    };
  }, [fromCampaign, lead, id]);

  useEffect(() => {
    if (status !== "MEETING_BOOKED") setMeetingContactErrors({});
  }, [status]);

  async function onConfirmBookingFromPanel(detail: BookingConfirmPayload) {
    if (!lead || status !== "MEETING_BOOKED") return;
    const contactErr = validateMeetingContactFields(
      meetingContactName,
      meetingContactEmail,
      meetingContactPhonePrivate,
    );
    if (contactErr) {
      setMeetingContactErrors(contactErr);
      setError("Du skal udfylde mødekontakt-oplysningerne, før mødet kan bookes.");
      return;
    }
    setMeetingContactErrors({});
    setError(null);
    setSaving(true);
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
      meetingScheduledFor: detail.localDateTimeISO,
      meetingContactName: meetingContactName.trim(),
      meetingContactEmail: meetingContactEmail.trim(),
      meetingContactPhonePrivate: meetingContactPhonePrivate.trim(),
    };
    if (detail.adminSkipBookingOverlap) {
      body.adminSkipBookingOverlap = true;
    }
    const res = await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Kunne ikke gemme booking");
      return;
    }
    const data: Lead = await res.json();
    setLead(data);
    setCustom(parseCustomFields(data.customFields));
    if (data.meetingScheduledFor) {
      const dt = new Date(data.meetingScheduledFor);
      const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000);
      setMeetingScheduledFor(local.toISOString().slice(0, 16));
    }
    if (String(data.status).trim().toUpperCase() !== "NEW") {
      setHoldsEditLock(false);
      setEditLockBlocked(false);
      setLockBusyMessage(null);
    }
    router.refresh();
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (status === "MEETING_BOOKED") {
      const contactErr = validateMeetingContactFields(
        meetingContactName,
        meetingContactEmail,
        meetingContactPhonePrivate,
      );
      if (contactErr) {
        setMeetingContactErrors(contactErr);
        setError("Du skal udfylde de tre mødekontakt-felter, før du kan gemme med udfaldet «Møde booket».");
        return;
      }
      setMeetingContactErrors({});
      if (!meetingScheduledFor?.trim()) {
        setError("Vælg dato og ledig tid i kalenderen nedenfor og tryk «Bekræft booking» (eller udfyld tidspunktet via booking-flowet først).");
        return;
      }
    }
    setSaving(true);
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
      body.meetingScheduledFor = meetingScheduledFor ? new Date(meetingScheduledFor).toISOString() : undefined;
      body.meetingContactName = meetingContactName.trim();
      body.meetingContactEmail = meetingContactEmail.trim();
      body.meetingContactPhonePrivate = meetingContactPhonePrivate.trim();
    }
    const res = await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Kunne ikke gemme");
      return;
    }
    const data: Lead = await res.json();
    setLead(data);
    setCustom(parseCustomFields(data.customFields));
    if (String(data.status).trim().toUpperCase() !== "NEW") {
      setHoldsEditLock(false);
      setEditLockBlocked(false);
      setLockBusyMessage(null);
    }
    router.refresh();
  }

  function openCallbackDialog() {
    setCallbackSubmitError(null);
    setError(null);
    setCallbackDialogOpen(true);
  }

  async function handleConfirmCallback(payload: {
    assignedUserId: string;
    scheduledForISO: string;
  }) {
    if (!lead || (lead.status !== "NEW" && lead.status !== "CALLBACK_SCHEDULED")) return;
    setSaving(true);
    setCallbackSubmitError(null);
    setError(null);
    const res = await fetch(`/api/leads/${lead.id}/schedule-callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scheduledFor: payload.scheduledForISO,
        assignedUserId: payload.assignedUserId,
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
        meetingContactName: meetingContactName.trim(),
        meetingContactEmail: meetingContactEmail.trim(),
        meetingContactPhonePrivate: meetingContactPhonePrivate.trim(),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setCallbackSubmitError(typeof j.error === "string" ? j.error : "Kunne ikke planlægge tilbagekald.");
      return;
    }
    const data: Lead = await res.json();
    setLead(data);
    setCustom(parseCustomFields(data.customFields));
    setCallbackDialogOpen(false);
    if ((LEAD_STATUSES as readonly string[]).includes(data.status)) {
      setStatus(data.status as LeadStatus);
    }
    router.refresh();
  }

  async function patchMeetingOutcome(
    o: "PENDING" | "HELD" | "CANCELLED" | typeof MEETING_OUTCOME_REBOOK | typeof MEETING_OUTCOME_SALE,
  ) {
    if (!lead) return;
    setError(null);
    const res = await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meetingOutcomeStatus: o }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(typeof j.error === "string" ? j.error : "Kunne ikke gemme mødeudfald");
      return;
    }
    const data: Lead = await res.json();
    setLead(data);
    setMeetingOutcomeStatus(
      String(data.meetingOutcomeStatus ?? "").trim().toUpperCase() || MEETING_OUTCOME_PENDING,
    );
    router.refresh();
  }

  async function onDeleteLead() {
    if (!lead) return;
    if (!confirm(`Slet leadet «${lead.companyName}» permanent? Dette kan ikke fortrydes.`)) return;
    setDeletingLead(true);
    setError(null);
    const res = await fetch(`/api/leads/${id}`, { method: "DELETE" });
    setDeletingLead(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Kunne ikke slette");
      return;
    }
    router.push(fromCampaign ? "/kampagner" : "/leads");
    router.refresh();
  }

  async function onVirkEnrich() {
    if (!lead) return;
    if (!isValidCVR(cvr)) {
      setVirkEnrichFeedback("Gyldigt CVR-nummer mangler");
      setVirkNoDataFieldKeys([]);
      return;
    }
    setVirkEnrichFeedback(null);
    setError(null);
    setVirkEnrichLoading(true);
    const res = await fetch(`/api/leads/${lead.id}/enrich-virk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cvr }),
    });
    setVirkEnrichLoading(false);
    const payload = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
      lead?: Lead;
      missingFieldKeys?: string[];
    };
    if (!res.ok) {
      const msg =
        typeof payload.error === "string" && payload.error.trim()
          ? payload.error
          : "Kunne ikke hente oplysninger fra VIRK";
      setVirkEnrichFeedback(msg);
      setVirkNoDataFieldKeys([]);
      return;
    }
    if (payload.lead) {
      setLead(payload.lead);
      setCustom(parseCustomFields(payload.lead.customFields));
    }
    const missing = Array.isArray(payload.missingFieldKeys)
      ? payload.missingFieldKeys.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      : [];
    setVirkNoDataFieldKeys(missing);
    setVirkNoDataToken((n) => n + 1);
    setVirkEnrichFeedback(payload.message ?? "Berigelse gennemført");
  }

  async function onSendMail(payload: { to: string; subject: string; message: string }) {
    if (!lead) return;
    setMailSending(true);
    setMailError(null);
    setMailSuccess(null);
    const res = await fetch(`/api/leads/${lead.id}/send-mail`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setMailSending(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      const msg = typeof j.error === "string" ? j.error : "Kunne ikke sende mail.";
      const details =
        process.env.NODE_ENV === "development" && typeof j.details === "string" ? ` (${j.details})` : "";
      setMailError(`${msg}${details}`);
      return;
    }
    setMailDialogOpen(false);
    setMailSuccess(`Mail sendt til ${payload.to}.`);
  }

  const nextLeadId =
    queue && queue.position < queue.ids.length ? queue.ids[queue.position] : null;
  const prevLeadId = queue && queue.position > 1 ? queue.ids[queue.position - 2] : null;
  const q = fromCampaign ? `?fromCampaign=${encodeURIComponent(fromCampaign)}` : "";

  if (forbidden) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-amber-200 bg-amber-50/80 px-6 py-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-amber-950">Ingen adgang</h1>
        <p className="mt-2 text-sm text-amber-900/90">
          Kun den sælger der har booket dette møde — eller en administrator — kan åbne leadet med noter og kundedata.
          Du kan stadig se mødet på oversigten under <strong>Møder</strong>.
        </p>
        <Link
          href="/meetings"
          className="mt-4 inline-block text-sm font-medium text-amber-900 underline-offset-2 hover:underline"
        >
          Tilbage til mødeoversigt
        </Link>
      </div>
    );
  }

  if (loading || !lead) {
    return (
      <div className="text-center text-stone-500">{loading ? "Henter…" : "Ikke fundet"}</div>
    );
  }

  const canScheduleCallback =
    lead.status === "NEW" ||
    (lead.status === "CALLBACK_SCHEDULED" &&
      String(lead.callbackStatus ?? "PENDING").trim().toUpperCase() === "PENDING");
  const showNextForMeeting = status !== "MEETING_BOOKED";

  return (
    <div className="mx-auto max-w-6xl flex min-h-[calc(100dvh-5.5rem)] flex-col gap-4 pb-4">
      <div className="shrink-0">
        <Link
          href={fromCampaign ? "/kampagner" : "/leads"}
          className="text-sm text-stone-500 hover:text-stone-800"
        >
          {fromCampaign ? "← Tilbage til kampagner" : "← Tilbage til leads"}
        </Link>

        {fromCampaign && queue && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200/80 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-950">
            <p>
              <span className="font-medium">Kampagne-kø:</span> lead {queue.position} af {queue.ids.length} (nye /
              ubesvaret først)
            </p>
            <div className="flex flex-wrap gap-2">
              {prevLeadId && (
                <Link
                  href={`/leads/${prevLeadId}${q}`}
                  className="rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-sm font-medium text-emerald-900 hover:bg-emerald-100/80"
                >
                  Forrige
                </Link>
              )}
              {nextLeadId && (
                <Link
                  href={`/leads/${nextLeadId}${q}`}
                  className="rounded-md bg-emerald-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-900"
                >
                  Næste lead
                </Link>
              )}
            </div>
          </div>
        )}

        {editLockBlocked && lockBusyMessage && (
          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-medium">Lead låst / optaget</p>
            <p className="mt-1">{lockBusyMessage}</p>
            {isAdmin && (
              <button
                type="button"
                className="mt-2 text-xs font-semibold text-amber-900 underline-offset-2 hover:underline"
                onClick={() =>
                  void (async () => {
                    const r = await fetch(`/api/leads/${lead.id}/lock?force=1`, { method: "DELETE" });
                    if (r.ok) {
                      setEditLockBlocked(false);
                      setLockBusyMessage(null);
                      const acq = await fetch(`/api/leads/${lead.id}/lock`, { method: "POST" });
                      if (acq.ok) {
                        setHoldsEditLock(true);
                        const j = (await acq.json().catch(() => null)) as { lead?: Lead } | null;
                        if (j?.lead) setLead(j.lead);
                      }
                      router.refresh();
                    }
                  })()
                }
              >
                Administrator: frigiv lås og overtagn
              </button>
            )}
          </div>
        )}

        <h1 className="mt-2 text-xl font-semibold text-stone-900">{lead.companyName}</h1>
        <p className="text-sm text-stone-500">
          Kampagne:{" "}
          {lead.campaign ? lead.campaign.name : "Ingen kampagne (kampagne slettet)"}
        </p>
        {holdsEditLock && !editLockBlocked && (
          <p className="mt-1 max-w-2xl text-xs text-stone-600">
            Dette lead er <strong>låst til dig</strong>, så længe du har denne side åben — kolleger kan ikke overtage det
            samtidig. Låset fornyes automatisk mens du arbejder.
          </p>
        )}
        {lead.status === "CALLBACK_SCHEDULED" && lead.callbackScheduledFor && (
          <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50/90 px-3 py-2 text-xs text-violet-950">
            <strong>Planlagt genopkald:</strong>{" "}
            {new Date(lead.callbackScheduledFor).toLocaleString("da-DK", {
              dateStyle: "short",
              timeStyle: "short",
            })}
            . Vælg udfald og gem — eller skift tilbage til «Ny» og gem for at lægge leadet i køen igen.
          </div>
        )}
        {mailSuccess && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
            {mailSuccess}
          </div>
        )}
      </div>

      <form onSubmit={onSave} className="flex min-h-0 flex-1 flex-col gap-4">
        <fieldset
          disabled={editLockBlocked && !isAdmin}
          className="flex min-h-0 flex-1 flex-col gap-4 border-0 p-0 disabled:opacity-90"
        >
          <LeadOutcomeStrip
            status={status}
            onStatusChange={setStatus}
            meetingBookedAt={lead.meetingBookedAt}
            bookedByUser={lead.bookedByUser}
            inlineAfterOutcomes={
              canScheduleCallback ? (
                <button
                  type="button"
                  disabled={saving || (editLockBlocked && !isAdmin) || !myUserId}
                  onClick={openCallbackDialog}
                  className="min-w-[8rem] appearance-none rounded-xl border-2 border-stone-200 bg-white px-4 py-3 text-sm font-semibold text-stone-600 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 disabled:opacity-60"
                >
                  Tilbagekald
                </button>
              ) : null
            }
            rightColumn={
              <>
                {status === "NEW" && showNextForMeeting ? (
                  <p className="max-w-[14rem] text-right text-xs text-stone-500">
                    Gem ændringer gemmer kundedata og noter. Vælg udfald-knapperne ovenfor.
                  </p>
                ) : null}
                <button
                  type="submit"
                  disabled={saving || (editLockBlocked && !isAdmin)}
                  className="rounded-xl bg-stone-900 px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-stone-800 disabled:opacity-60"
                >
                  {saving ? "Gemmer…" : "Gem ændringer"}
                </button>
                <button
                  type="button"
                  disabled={deletingLead || (editLockBlocked && !isAdmin)}
                  onClick={() => void onDeleteLead()}
                  className="rounded-xl border-2 border-red-200 bg-red-50 px-5 py-2.5 text-sm font-semibold text-red-900 shadow-sm transition hover:bg-red-100 disabled:opacity-60"
                >
                  {deletingLead ? "Sletter…" : "Slet lead"}
                </button>
              </>
            }
          />

          {error && <p className="shrink-0 text-sm text-red-600">{error}</p>}

          <div ref={leadWorkspaceRef} id="lead-arbejdsvisning" className="flex min-h-0 flex-1 flex-col gap-4">
            <LeadKundeNoterBooking
              gridKey={`${lead.id}-kunde-noter`}
              gridClassName="flex-1"
              fieldConfigJson={lead.campaign?.fieldConfig ?? defaultCampaignFieldConfigJson()}
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
              mailAction={
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50/60 px-3 py-2.5">
                  <p className="text-xs text-stone-600">Mail sendes fra hej@allio.dk (modtager kan redigeres).</p>
                  <button
                    type="button"
                    onClick={() => {
                      setMailError(null);
                      setMailSuccess(null);
                      setMailDialogOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-50"
                  >
                    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                      <path
                        d="M2.5 5.5C2.5 4.67157 3.17157 4 4 4H16C16.8284 4 17.5 4.67157 17.5 5.5V14.5C17.5 15.3284 16.8284 16 16 16H4C3.17157 16 2.5 15.3284 2.5 14.5V5.5Z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                      <path d="M3 6L10 10.75L17 6" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                    Send mail
                  </button>
                </div>
              }
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
                campaignId: lead.campaignId ?? undefined,
                leadId: lead.id,
                initialMeetingLocal: status === "MEETING_BOOKED" ? meetingScheduledFor || undefined : undefined,
                isSubmitting: saving,
                allowMeetingConfirm: status === "MEETING_BOOKED",
                allowAdminAvailabilityOverride: isAdmin,
                onConfirmBooking: (d) => void onConfirmBookingFromPanel(d),
              }}
              onVirkEnrich={() => void onVirkEnrich()}
              virkEnrichLoading={virkEnrichLoading}
              virkEnrichFeedback={virkEnrichFeedback}
              virkNoDataFieldKeys={virkNoDataFieldKeys}
              virkNoDataToken={virkNoDataToken}
            />
          </div>

          {status === "MEETING_BOOKED" && (
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-6 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-medium text-stone-800">Mødeudfald</h2>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${meetingOutcomeBadgeClass(meetingOutcomeStatus)}`}
                >
                  {MEETING_OUTCOME_LABELS[meetingOutcomeStatus] ??
                    MEETING_OUTCOME_LABELS[MEETING_OUTCOME_PENDING]}
                </span>
              </div>
              {meetingScheduledFor ? (
                <p className="mt-2 text-sm text-stone-800">
                  Planlagt tidspunkt:{" "}
                  {new Date(meetingScheduledFor).toLocaleString("da-DK", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </p>
              ) : null}
              {isAdmin && (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-stone-200 pt-4">
                  <span className="text-xs font-medium text-stone-600">Admin — mødeudfald:</span>
                  <MeetingOutcomeSelect
                    value={meetingOutcomeStatus}
                    onChange={(value) => void patchMeetingOutcome(value)}
                    className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800 shadow-sm outline-none ring-stone-400 focus:ring-2"
                  />
                </div>
              )}
            </div>
          )}
        </fieldset>
      </form>

      <CallbackScheduleDialog
        open={callbackDialogOpen}
        currentUserId={myUserId}
        saving={saving}
        errorText={callbackSubmitError}
        onClose={() => {
          setCallbackDialogOpen(false);
          setCallbackSubmitError(null);
        }}
        onConfirm={(p) => void handleConfirmCallback(p)}
      />
      <SendStandardMailDialog
        open={mailDialogOpen}
        fixedFrom={fixedMailFrom}
        defaultTo={email}
        defaultSubject={`Opfølgning vedr. ${companyName || "jeres virksomhed"}`}
        defaultMessage=""
        saving={mailSending}
        errorText={mailError}
        onClose={() => {
          if (mailSending) return;
          setMailDialogOpen(false);
          setMailError(null);
        }}
        onSubmit={(p) => void onSendMail(p)}
      />
    </div>
  );
}

export default function LeadDetailPage() {
  return (
    <Suspense fallback={<div className="text-center text-stone-500">Henter…</div>}>
      <LeadDetailInner />
    </Suspense>
  );
}
