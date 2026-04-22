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
import { SendStandardMailDialog } from "@/app/components/send-standard-mail-dialog";
import {
  buildCampaignLeadPatchBody,
  type CampaignLeadFormSnapshot,
} from "@/lib/campaign-workspace-patch";
import { isValidCVR } from "@/lib/cvr-import";
import { buildReserveNextRequestBody } from "@/lib/workspace-start-date-filter";
import { MEETING_OUTCOME_REBOOK } from "@/lib/meeting-outcome";
import {
  type CampaignDialMode,
  campaignUsesVoipUi,
  normalizeCampaignDialMode,
} from "@/lib/dial-mode";
import { CampaignVoipStrip } from "@/app/components/campaign-voip-strip";
import type { ActivityItem } from "@/app/components/lead-activity-panel";

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
  meetingOutcomeStatus?: string | null;
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
  callbackStatus?: string | null;
};

type Props = {
  campaignId: string;
  preferredLeadId?: string;
  /** true når brugeren er kommet ind via «Start» på kampagneoversigten — slår VoIP/auto-opkald til. */
  voipSession?: boolean;
};

const LOCK_HEARTBEAT_MS = 25_000;

function preferStorageKey(campaignId: string) {
  return `kampagne-arbejd-prefer:${campaignId}`;
}

async function releaseLockHttp(leadId: string) {
  await fetch(`/api/leads/${leadId}/lock`, { method: "DELETE", keepalive: true }).catch(() => {});
}

const BG_SAVE_RETRIES = 3;
const FIXED_MAIL_FROM = "hej@allio.dk";

function delayMs(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export function CampaignWorkspace({ campaignId, preferredLeadId, voipSession = false }: Props) {
  const { data: session } = useSession();
  const sessionUserId = session?.user?.id ?? "";
  const isAdmin = session?.user?.role === "ADMIN";
  const [campaignName, setCampaignName] = useState("");
  const [campaignDialMode, setCampaignDialMode] = useState<CampaignDialMode>("NO_DIAL");
  const [powerDialPhase, setPowerDialPhase] = useState<"dialing" | "connected">("connected");
  const [campaignSystemType, setCampaignSystemType] = useState<string | null>(null);
  const [fieldConfigJson, setFieldConfigJson] = useState("{}");
  const [campaignLeadCount, setCampaignLeadCount] = useState<number | null>(null);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const activeLeadRef = useRef<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /** Fejl ved baggrundsgem af forrige lead (blokér ikke næste lead). */
  const [backgroundSyncError, setBackgroundSyncError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  /** Lås på leads der stadig gemmes i baggrunden — heartbeat som aktivt lead. */
  const [backgroundLockLeadIds, setBackgroundLockLeadIds] = useState<string[]>([]);
  const backgroundLockLeadIdsRef = useRef<string[]>([]);
  const pendingPatchBodiesRef = useRef<Map<string, Record<string, unknown>>>(new Map());

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
  const [mailDialogOpen, setMailDialogOpen] = useState(false);
  const [mailSending, setMailSending] = useState(false);
  const [mailError, setMailError] = useState<string | null>(null);
  const [mailSuccess, setMailSuccess] = useState<string | null>(null);
  const [virkEnrichLoading, setVirkEnrichLoading] = useState(false);
  const [virkEnrichFeedback, setVirkEnrichFeedback] = useState<string | null>(null);
  const [virkNoDataFieldKeys, setVirkNoDataFieldKeys] = useState<string[]>([]);
  const [virkNoDataToken, setVirkNoDataToken] = useState(0);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);

  useEffect(() => {
    activeLeadRef.current = activeLead;
  }, [activeLead]);

  useEffect(() => {
    setMailSuccess(null);
    setMailError(null);
    setActivityOpen(false);
  }, [activeLead?.id]);

  backgroundLockLeadIdsRef.current = backgroundLockLeadIds;

  useEffect(() => {
    return () => {
      const id = activeLeadRef.current?.id;
      if (id) void releaseLockHttp(id);
      for (const [leadId, body] of pendingPatchBodiesRef.current.entries()) {
        void fetch(`/api/leads/${leadId}`, {
          method: "PATCH",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).catch(() => {});
        void releaseLockHttp(leadId);
      }
      pendingPatchBodiesRef.current.clear();
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
    const cancelledMeetingInRebookingCampaign =
      campaignSystemType === "rebooking" &&
      l.status === "MEETING_BOOKED" &&
      String(l.meetingOutcomeStatus ?? "").trim().toUpperCase() === MEETING_OUTCOME_REBOOK;
    setStatus(
      l.status === "CALLBACK_SCHEDULED" || cancelledMeetingInRebookingCampaign
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
  }, [campaignSystemType]);

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
      const preferLeadId = preferredLeadId?.trim() || preferRaw?.trim() || undefined;
      const rRes = await fetch(`/api/campaigns/${campaignId}/reserve-next`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: buildReserveNextRequestBody(campaignId, { preferLeadId }),
      });
      if (!rRes.ok) {
        const j = await rRes.json().catch(() => ({}));
        if (!cancelled) {
          setError(typeof j.error === "string" ? j.error : "Kunne ikke reservere lead.");
          setCampaignName(c.name ?? "");
          setCampaignDialMode(normalizeCampaignDialMode(c.dialMode));
          setCampaignSystemType(
            typeof c.systemCampaignType === "string" && c.systemCampaignType.trim()
              ? c.systemCampaignType.trim()
              : null,
          );
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
      setCampaignDialMode(normalizeCampaignDialMode(c.dialMode));
      setCampaignSystemType(
        typeof c.systemCampaignType === "string" && c.systemCampaignType.trim()
          ? c.systemCampaignType.trim()
          : null,
      );
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
  }, [campaignId, preferredLeadId]);

  const pulseAllLeadLocks = useCallback(() => {
    const ids = new Set<string>();
    if (activeLeadRef.current?.id) ids.add(activeLeadRef.current.id);
    for (const id of backgroundLockLeadIdsRef.current) ids.add(id);
    for (const id of ids) {
      void fetch(`/api/leads/${id}/lock`, { method: "PATCH" }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!activeLead?.id && backgroundLockLeadIds.length === 0) return;
    pulseAllLeadLocks();
    const t = window.setInterval(pulseAllLeadLocks, LOCK_HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [activeLead?.id, backgroundLockLeadIds, pulseAllLeadLocks]);

  useEffect(() => {
    function refreshLockFromFocus() {
      pulseAllLeadLocks();
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
  }, [pulseAllLeadLocks]);

  /** Kun automatisk opkald / power-dial demo — manuel VoIP er altid tilgængelig ved VoIP-kampagne. */
  const voipAutoDialAllowed = Boolean(voipSession) && !preferredLeadId?.trim();

  useEffect(() => {
    if (!voipAutoDialAllowed) {
      setPowerDialPhase("connected");
      return;
    }
    if (campaignDialMode !== "POWER_DIALER") {
      setPowerDialPhase("connected");
      return;
    }
    if (!activeLead?.id) {
      setPowerDialPhase("connected");
      return;
    }
    setPowerDialPhase("dialing");
    const t = window.setTimeout(() => setPowerDialPhase("connected"), 2200);
    return () => window.clearTimeout(t);
  }, [activeLead?.id, campaignDialMode, voipAutoDialAllowed]);

  useEffect(() => {
    if (!activeLead) return;
    loadFormFromLead(activeLead);
  }, [activeLead, loadFormFromLead]);

  useEffect(() => {
    if (!isAdmin) {
      setActivityOpen(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || !activityOpen || !activeLead?.id) return;
    const leadIdForActivity = activeLead.id;
    let cancelled = false;
    (async () => {
      setActivityLoading(true);
      setActivityError(null);
      const res = await fetch(`/api/leads/${leadIdForActivity}/activity`);
      if (cancelled) return;
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setActivityError(typeof j.error === "string" ? j.error : "Kunne ikke hente aktivitet");
        setActivityItems([]);
        setActivityLoading(false);
        return;
      }
      const data = (await res.json()) as { items?: ActivityItem[] };
      setActivityItems(Array.isArray(data.items) ? data.items : []);
      setActivityLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, activityOpen, activeLead?.id]);

  useEffect(() => {
    if (status !== "MEETING_BOOKED") setMeetingContactErrors({});
  }, [status]);

  function setCustomKey(key: string, value: string) {
    setCustom((prev) => ({ ...prev, [key]: value }));
  }

  function getFormSnapshot(statusOverride?: LeadStatus): CampaignLeadFormSnapshot {
    const st = statusOverride ?? status;
    return {
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
      status: st,
      meetingScheduledFor,
      meetingContactName,
      meetingContactEmail,
      meetingContactPhonePrivate,
    };
  }

  async function saveLead(
    l: Lead,
    meetingScheduledForISO?: string,
    adminSkipBookingOverlap?: boolean,
  ): Promise<{ next: Lead[]; updated: Lead } | null> {
    const body = buildCampaignLeadPatchBody(getFormSnapshot(), {
      meetingScheduledForISO,
      adminSkipBookingOverlap,
    });
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
      body: buildReserveNextRequestBody(campaignId, { excludeLeadId: savedLeadId }),
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

  async function onNext(
    meetingScheduledForISO?: string,
    adminSkipBookingOverlap?: boolean,
    predictiveOutcome?: LeadStatus,
  ) {
    if (!activeLead) return;

    /** Mødebooking: vent på bekræftet gem — ingen optimistisk navigation (data integritet). */
    if (status === "MEETING_BOOKED" && predictiveOutcome === undefined) {
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

      const currentId = activeLead.id;
      setSaving(true);
      setError(null);
      const saved = await saveLead(activeLead, meetingScheduledForISO, adminSkipBookingOverlap);
      setSaving(false);
      if (!saved) return;

      if (meetingScheduledForISO) {
        const d = new Date(meetingScheduledForISO);
        const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
        setMeetingScheduledFor(local.toISOString().slice(0, 16));
      }

      await advanceToNextReservedAfterSave(currentId);
      return;
    }

    const currentId = activeLead.id;
    const snapshotStatus = predictiveOutcome ?? status;
    const shouldBumpNewQueue = snapshotStatus === "NEW" && activeLead.status === "NEW";
    const patchBody = {
      ...buildCampaignLeadPatchBody(getFormSnapshot(predictiveOutcome)),
      ...(shouldBumpNewQueue ? { queueBump: true } : {}),
    };

    setError(null);
    setBackgroundSyncError(null);

    const rRes = await fetch(`/api/campaigns/${campaignId}/reserve-next`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: buildReserveNextRequestBody(campaignId, { excludeLeadId: currentId }),
    });
    if (!rRes.ok) {
      const j = await rRes.json().catch(() => ({}));
      setError(typeof j.error === "string" ? j.error : "Kunne ikke hente næste lead.");
      return;
    }
    const rj = (await rRes.json()) as { lead: Lead | null };

    if (!rj.lead) {
      setSaving(true);
      const res = await fetch(`/api/leads/${currentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      });
      setSaving(false);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(typeof j.error === "string" ? j.error : "Kunne ikke gemme");
        return;
      }
      await releaseLockHttp(currentId);
      setActiveLead(null);
      setDone(true);
      try {
        sessionStorage.removeItem(preferStorageKey(campaignId));
      } catch {
        /* ignore */
      }
      return;
    }

    setBackgroundLockLeadIds((prev) => [...prev, currentId]);
    pendingPatchBodiesRef.current.set(currentId, patchBody);
    setActiveLead(rj.lead);
    try {
      sessionStorage.setItem(preferStorageKey(campaignId), rj.lead.id);
    } catch {
      /* ignore */
    }

    void (async () => {
      let ok = false;
      for (let attempt = 0; attempt < BG_SAVE_RETRIES; attempt++) {
        const res = await fetch(`/api/leads/${currentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchBody),
        });
        if (res.ok) {
          ok = true;
          break;
        }
        await delayMs(350 * (attempt + 1));
      }
      pendingPatchBodiesRef.current.delete(currentId);
      if (ok) {
        setBackgroundLockLeadIds((prev) => prev.filter((id) => id !== currentId));
        await releaseLockHttp(currentId);
        setBackgroundSyncError(null);
      } else {
        setBackgroundSyncError(
          "Kunne ikke gemme forrige lead efter flere forsøg. Det er stadig låst for andre — genindlæs siden og prøv igen.",
        );
      }
    })();
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
    if (!activeLead || (activeLead.status !== "NEW" && activeLead.status !== "CALLBACK_SCHEDULED")) return;
    setSaving(true);
    setCallbackSubmitError(null);
    setError(null);
    /** Ét kald: gemmer noter/felter og sætter CALLBACK_SCHEDULED — ikke et separat «gem udfald». */
    const res = await fetch(`/api/leads/${activeLead.id}/schedule-callback`, {
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
    pendingPatchBodiesRef.current.delete(activeLead.id);
    setCallbackDialogOpen(false);
    await advanceToNextReservedAfterSave(activeLead.id);
  }

  async function onConfirmBookingFromPanel(detail: BookingConfirmPayload) {
    if (!activeLead || status !== "MEETING_BOOKED") return;
    await onNext(detail.localDateTimeISO, detail.adminSkipBookingOverlap);
  }

  async function onVirkEnrich() {
    if (!activeLead) return;
    if (!isValidCVR(cvr)) {
      setVirkEnrichFeedback("Gyldigt CVR-nummer mangler");
      setVirkNoDataFieldKeys([]);
      return;
    }
    setVirkEnrichFeedback(null);
    setError(null);
    setVirkEnrichLoading(true);
    const res = await fetch(`/api/leads/${activeLead.id}/enrich-virk`, {
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
      setActiveLead(payload.lead);
      setCustom(parseCustomFields(payload.lead.customFields));
    }
    const missing = Array.isArray(payload.missingFieldKeys)
      ? payload.missingFieldKeys.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      : [];
    setVirkNoDataFieldKeys(missing);
    setVirkNoDataToken((n) => n + 1);
    setVirkEnrichFeedback(payload.message ?? "Berigelse gennemført");
  }

  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;

  const handleOutcomeStatusChange = useCallback(
    (next: LeadStatus) => {
      setStatus(next);
      if (campaignDialMode !== "PREDICTIVE") return;
      if (next === "NEW" || next === "MEETING_BOOKED" || next === "CALLBACK_SCHEDULED") return;
      queueMicrotask(() => void onNextRef.current(undefined, undefined, next));
    },
    [campaignDialMode],
  );

  async function onSendMail(payload: { to: string; subject: string; message: string }) {
    if (!activeLead) return;
    setMailSending(true);
    setMailError(null);
    setMailSuccess(null);
    const res = await fetch(`/api/leads/${activeLead.id}/send-mail`, {
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
            Der er ingen leads tilgængelige lige nu — de kan være i et andet udfald, eller{" "}
            <strong>optaget</strong> af kolleger der også arbejder i kampagnen. Prøv igen om lidt.
          </p>
          <p className="text-sm text-stone-600">
            {campaignSystemType === "rebooking" ? (
              <>
                Under «Genbook møde» ligger både annullerede bookinger og leads sat til «Ny» i denne kampagne. Hvis du
                lige har gemt et lead som «Ny» eller voicemail, kan du prøve igen — eller genindlæs siden.
              </>
            ) : (
              <>
                Når voicemail eller «Ikke hjemme» er udløbet, et lead frigives, eller et planlagt callback når
                tidspunktet (eller du loader siden igen), dukker det i køen igen.
              </>
            )}
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
                    body: buildReserveNextRequestBody(campaignId, {}),
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
  const showPowerDialWaiting =
    voipAutoDialAllowed &&
    campaignDialMode === "POWER_DIALER" &&
    powerDialPhase === "dialing" &&
    Boolean(activeLead);
  const voipAutoStart =
    voipAutoDialAllowed &&
    (campaignDialMode === "PREDICTIVE" ||
      (campaignDialMode === "POWER_DIALER" && powerDialPhase === "connected"));
  const showVoipStrip = campaignUsesVoipUi(campaignDialMode) && !showPowerDialWaiting;

  const showOriginalCancelledMeetingInfo =
    campaignSystemType === "rebooking" &&
    current.status === "MEETING_BOOKED" &&
    String(current.meetingOutcomeStatus ?? "").trim().toUpperCase() === MEETING_OUTCOME_REBOOK &&
    Boolean(current.meetingScheduledFor);

  const canScheduleCallback =
    current.status === "NEW" ||
    (current.status === "CALLBACK_SCHEDULED" &&
      String(current.callbackStatus ?? "PENDING").trim().toUpperCase() === "PENDING");

  const showNextForMeeting = status !== "MEETING_BOOKED";
  const nextLabel = saving ? "Gemmer…" : "Gem og næste";
  const showBackgroundSaveHint = backgroundLockLeadIds.length > 0;
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
    <div className="relative flex min-h-[calc(100dvh-5.5rem)] flex-col gap-4 pb-4">
      {showPowerDialWaiting && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="power-dial-wait-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-2xl">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
            <h2 id="power-dial-wait-title" className="text-lg font-semibold text-stone-900">
              Ringer til leads…
            </h2>
            <p className="mt-2 text-sm text-stone-600">
              Telnyx Power Dialer ringer til flere numre parallelt. Når en person tager, vises leadet, og du kan tale
              videre som ved Click to call.
            </p>
            <p className="mt-3 text-xs text-stone-500">
              (Demo: venteskærm — kobl jeres Call Control + AMD på for rigtig parallel kø.)
            </p>
          </div>
        </div>
      )}
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
        {showOriginalCancelledMeetingInfo && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-950">
            <strong>Originalt møde (genbook):</strong>{" "}
            {new Date(String(current.meetingScheduledFor)).toLocaleString("da-DK", {
              dateStyle: "short",
              timeStyle: "short",
            })}
            . Behandl leadet som opkald i rebooking-køen.
          </div>
        )}
        {mailSuccess && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
            {mailSuccess}
          </div>
        )}
        {campaignUsesVoipUi(campaignDialMode) && !voipAutoDialAllowed ? (
          <div className="mt-3 rounded-lg border border-sky-200/90 bg-sky-50/80 px-3 py-2 text-xs leading-relaxed text-sky-950">
            <span className="font-medium text-sky-900">Manuelt opkald:</span> Brug feltet «Telefonnummer
            (opkald)» længere nede.{" "}
            <span className="font-medium text-sky-900">Automatisk udringning</span> (predictive / power dial) er kun
            aktiv, når du åbner køen via <strong>Start</strong> på oversigten —{" "}
            <Link href="/kampagner" className="font-semibold text-sky-900 underline-offset-2 hover:underline">
              Kampagner
            </Link>{" "}
            eller{" "}
            <Link
              href={`/kampagner/${encodeURIComponent(campaignId)}/arbejd?voipSession=1`}
              className="font-semibold text-sky-900 underline-offset-2 hover:underline"
            >
              åbn med Start her
            </Link>
            .
          </div>
        ) : null}
      </div>

      <LeadOutcomeStrip
        status={status}
        onStatusChange={handleOutcomeStatusChange}
        meetingBookedAt={meetingBookedAt}
        bookedByUser={bookedByUser}
        aboveOutcomeButtons={
          isAdmin && activityOpen ? (
            <div className="rounded-xl border-2 border-blue-300 bg-blue-50/95 p-4 shadow-md">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-blue-950">Aktivitet på dette lead</h3>
                <button
                  type="button"
                  onClick={() => setActivityOpen(false)}
                  className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-blue-900 hover:bg-blue-100/80"
                >
                  Luk
                </button>
              </div>
              {activityLoading && <p className="mt-3 text-sm text-blue-900/70">Henter…</p>}
              {activityError && (
                <p className="mt-3 text-sm text-red-700" role="alert">
                  {activityError}
                </p>
              )}
              {!activityLoading && !activityError && activityItems.length === 0 && (
                <p className="mt-3 text-sm text-blue-900/70">Ingen aktivitet registreret endnu.</p>
              )}
              {!activityLoading && activityItems.length > 0 && (
                <ul className="mt-3 max-h-64 space-y-2.5 overflow-y-auto pr-1 text-sm">
                  {activityItems.map((row, i) => (
                    <li
                      key={`${row.at}-${i}`}
                      className="rounded-lg border border-blue-200/80 bg-white/90 px-3 py-2 text-blue-950"
                    >
                      <p className="text-xs text-blue-800/80">
                        {new Date(row.at).toLocaleString("da-DK", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </p>
                      <p className="mt-0.5 font-medium">{row.summary}</p>
                      {row.user && (
                        <p className="mt-0.5 text-xs text-blue-900/75">
                          {row.user.name}{" "}
                          <span className="text-blue-700/70">(@{row.user.username})</span>
                        </p>
                      )}
                      {row.kind === "call" && row.recordingUrl ? (
                        <audio controls className="mt-2 h-8 w-full max-w-md" src={row.recordingUrl}>
                          <track kind="captions" />
                        </audio>
                      ) : null}
                      {row.kind === "call" && !row.recordingUrl ? (
                        <p className="mt-1 text-xs text-blue-800/70">Ingen optagelse tilknyttet endnu.</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null
        }
        inlineAfterOutcomes={
          canScheduleCallback ? (
            <button
              type="button"
              disabled={saving || !sessionUserId}
              onClick={openCallbackDialog}
              className="min-w-[8rem] appearance-none rounded-xl border-2 border-stone-200 bg-white px-4 py-3 text-sm font-semibold text-stone-600 shadow-sm transition hover:border-stone-300 hover:bg-stone-50 disabled:opacity-60"
            >
              Tilbagekald
            </button>
          ) : null
        }
        rightColumn={
          <>
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setActivityOpen((o) => !o)}
                className={`w-full min-w-[10rem] rounded-xl border-2 px-6 py-3 text-sm font-semibold shadow-md transition sm:min-w-[12rem] ${
                  activityOpen
                    ? "border-blue-800 bg-blue-800 text-white hover:bg-blue-900"
                    : "border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                Aktivitet
              </button>
            ) : null}
            {status === "NEW" && showNextForMeeting ? (
              <p className="max-w-[14rem] text-right text-xs text-stone-500">
                Gemmer noter og går til næste lead uden at ændre udfald.
              </p>
            ) : null}
            {renderNextButton()}
          </>
        }
      />

      {showVoipStrip && (
        <CampaignVoipStrip
          leadId={current.id}
          campaignId={campaignId}
          leadPhone={current.phone}
          dialMode={campaignDialMode}
          autoStartCall={voipAutoStart}
        />
      )}

      {showBackgroundSaveHint && (
        <p className="shrink-0 text-xs text-stone-500" aria-live="polite">
          Gemmer forrige lead i baggrunden…
        </p>
      )}
      {backgroundSyncError && (
        <p className="shrink-0 text-sm text-amber-800" role="alert">
          {backgroundSyncError}
        </p>
      )}
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
          campaignId,
          leadId: current.id,
          initialMeetingLocal: status === "MEETING_BOOKED" ? meetingScheduledFor || undefined : undefined,
          isSubmitting: saving,
          allowMeetingConfirm: status === "MEETING_BOOKED",
          allowAdminAvailabilityOverride: isAdmin,
          onConfirmBooking: onConfirmBookingFromPanel,
        }}
        onVirkEnrich={() => void onVirkEnrich()}
        virkEnrichLoading={virkEnrichLoading}
        virkEnrichFeedback={virkEnrichFeedback}
        virkNoDataFieldKeys={virkNoDataFieldKeys}
        virkNoDataToken={virkNoDataToken}
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
      <SendStandardMailDialog
        open={mailDialogOpen}
        fixedFrom={FIXED_MAIL_FROM}
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
