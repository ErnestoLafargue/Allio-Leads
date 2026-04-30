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
import { CampaignVoipStrip, type LineStatus } from "@/app/components/campaign-voip-strip";
import { LeadActivityDrawer } from "@/app/components/lead-activity-drawer";
import {
  useDialerPresence,
  type AssignedLead,
  type DialerPresenceStatus,
} from "@/lib/use-dialer-presence";
import { useActivityRecordingPoll } from "@/lib/use-activity-recording-poll";

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
  const debugRunId = "voicemail-status-race-v1";
  const { data: session } = useSession();
  const sessionUserId = session?.user?.id ?? "";
  const isAdmin = session?.user?.role === "ADMIN";
  const [campaignName, setCampaignName] = useState("");
  const [campaignDialMode, setCampaignDialMode] = useState<CampaignDialMode>("NO_DIAL");
  const [campaignSystemType, setCampaignSystemType] = useState<string | null>(null);
  /** Auto-dial pause-toggle (sessionStorage). Når true: agenten styrer selv hver opringning. */
  const [autoDialPaused, setAutoDialPaused] = useState<boolean>(() => {
    if (typeof sessionStorage === "undefined") return false;
    try {
      return sessionStorage.getItem("allio-voip-auto-paused") === "1";
    } catch {
      return false;
    }
  });
  const [fieldConfigJson, setFieldConfigJson] = useState("{}");
  const [campaignLeadCount, setCampaignLeadCount] = useState<number | null>(null);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const activeLeadRef = useRef<Lead | null>(null);
  const [prefetchedLead, setPrefetchedLead] = useState<Lead | null>(null);
  const prefetchedLeadRef = useRef<Lead | null>(null);
  const prefetchInFlightRef = useRef(false);
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
  const [voipActivityTick, setVoipActivityTick] = useState(0);
  const bumpVoipActivity = useCallback(() => setVoipActivityTick((n) => n + 1), []);
  const schedulePollAfterCall = useActivityRecordingPoll({
    isDrawerOpen: activityOpen,
    bumpReload: bumpVoipActivity,
  });
  const activityOpenPrevRef = useRef(false);
  useEffect(() => {
    if (activityOpen && !activityOpenPrevRef.current) {
      bumpVoipActivity();
    }
    activityOpenPrevRef.current = activityOpen;
  }, [activityOpen, bumpVoipActivity]);

  useEffect(() => {
    activeLeadRef.current = activeLead;
  }, [activeLead]);

  useEffect(() => {
    prefetchedLeadRef.current = prefetchedLead;
  }, [prefetchedLead]);

  useEffect(() => {
    setMailSuccess(null);
    setMailError(null);
    setActivityOpen(false);
  }, [activeLead?.id]);

  backgroundLockLeadIdsRef.current = backgroundLockLeadIds;

  useEffect(() => {
    const pendingPatchBodies = pendingPatchBodiesRef;
    return () => {
      const id = activeLeadRef.current?.id;
      if (id) void releaseLockHttp(id);
      const prefetchedId = prefetchedLeadRef.current?.id;
      if (prefetchedId && prefetchedId !== id) void releaseLockHttp(prefetchedId);
      const bodyMap = pendingPatchBodies.current;
      const pendingPatches = new Map(bodyMap);
      for (const [leadId, body] of pendingPatches) {
        void fetch(`/api/leads/${leadId}`, {
          method: "PATCH",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }).catch(() => {});
        void releaseLockHttp(leadId);
      }
      bodyMap.clear();
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

  useEffect(() => {
    if (!activeLead?.id) {
      const prevId = prefetchedLeadRef.current?.id ?? null;
      if (prevId) void releaseLockHttp(prevId);
      setPrefetchedLead(null);
      return;
    }
    if (prefetchedLeadRef.current?.id) return;
    void prefetchNextLead(activeLead.id);
    // prefetch kun ved lead-skift; cache håndteres via ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLead?.id, campaignId]);

  const pulseAllLeadLocks = useCallback(() => {
    const ids = new Set<string>();
    if (activeLeadRef.current?.id) ids.add(activeLeadRef.current.id);
    if (prefetchedLeadRef.current?.id) ids.add(prefetchedLeadRef.current.id);
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

  /** Auto-opkald aktiveres kun når brugeren kom ind via «Start» (voipSession=1) og
   *  ikke direktelinker til ét bestemt lead. Manuel VoIP virker altid på VoIP-kampagner. */
  const voipAutoDialAllowed = Boolean(voipSession) && !preferredLeadId?.trim();

  /** Persistér pause-staten på tværs af leads i samme browserfane. */
  useEffect(() => {
    if (typeof sessionStorage === "undefined") return;
    try {
      if (autoDialPaused) sessionStorage.setItem("allio-voip-auto-paused", "1");
      else sessionStorage.removeItem("allio-voip-auto-paused");
    } catch {
      /* no-op */
    }
  }, [autoDialPaused]);

  // VoIP-strip linje-status (bruges til at rapportere agentens dialer-presence)
  const [voipLineStatus, setVoipLineStatus] = useState<LineStatus>("idle");
  const [voipHangupSignal, setVoipHangupSignal] = useState(0);

  /**
   * Mapper voip-strip's lokale lineStatus + auto-dial-pause til server-side dialer-status:
   * - autoDialPaused → offline (server skal ikke ringe os op)
   * - voipLineStatus=ringing/connecting → ringing (vi venter på et opkald)
   * - voipLineStatus=live → talking (vi er i samtale)
   * - voipLineStatus=idle → ready (vi er klar til at modtage et bridge)
   * - andet → offline
   */
  const isAutoDialModeForPresence =
    campaignDialMode === "POWER_DIALER" || campaignDialMode === "PREDICTIVE";
  const presenceStatus: DialerPresenceStatus = !isAutoDialModeForPresence
    ? "offline"
    : autoDialPaused
      ? "offline"
      : voipLineStatus === "live"
        ? "talking"
        : voipLineStatus === "ringing" || voipLineStatus === "connecting"
          ? "ringing"
          : voipLineStatus === "idle"
            ? "ready"
            : "offline";

  const handleAssignedLead = useCallback((lead: AssignedLead) => {
    // Server har bridged et nyt lead til denne agent → naviger til lead'et hvis vi
    // ikke allerede er på det. Bruges af parallel-dispatcher.
    if (typeof window === "undefined") return;
    const targetUrl = `/kampagner/${campaignId}/arbejd?leadId=${encodeURIComponent(lead.id)}&voipSession=1`;
    if (!window.location.pathname.endsWith("/arbejd") || activeLeadRef.current?.id !== lead.id) {
      window.location.assign(targetUrl);
    }
  }, [campaignId]);

  const { stats: dialerStats, sipReady } = useDialerPresence({
    campaignId: isAutoDialModeForPresence ? campaignId : null,
    status: presenceStatus,
    intervalMs: 5000,
    onAssignedLead: handleAssignedLead,
    enableDispatch: isAutoDialModeForPresence && !autoDialPaused,
  });

  useEffect(() => {
    if (!activeLead) return;
    loadFormFromLead(activeLead);
  }, [activeLead, loadFormFromLead]);

  /// Luk drawer når lead skifter, så vi ikke viser et tidligere leads aktivitet et splitsekund.
  useEffect(() => {
    setActivityOpen(false);
  }, [activeLead?.id]);

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
    const excludedLeadIds = Array.from(new Set([
      savedLeadId,
      ...backgroundLockLeadIdsRef.current,
    ]));
    const rRes = await fetch(`/api/campaigns/${campaignId}/reserve-next`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: buildReserveNextRequestBody(campaignId, {
        excludeLeadId: savedLeadId,
        excludeLeadIds: excludedLeadIds,
      }),
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

  async function prefetchNextLead(excludeLeadId: string) {
    if (prefetchInFlightRef.current) return;
    prefetchInFlightRef.current = true;
    try {
      const excludedLeadIds = Array.from(new Set([
        excludeLeadId,
        ...backgroundLockLeadIdsRef.current,
      ]));
      const res = await fetch(`/api/campaigns/${campaignId}/reserve-next`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: buildReserveNextRequestBody(campaignId, {
          excludeLeadId,
          excludeLeadIds: excludedLeadIds,
        }),
      });
      if (!res.ok) return;
      const json = (await res.json()) as { lead: Lead | null };
      const next = json.lead ?? null;
      const prevId = prefetchedLeadRef.current?.id ?? null;
      const activeId = activeLeadRef.current?.id ?? null;
      if (prevId && prevId !== next?.id && prevId !== activeId) {
        void releaseLockHttp(prevId);
      }
      setPrefetchedLead(next);
    } catch {
      /* prefetch-fejl må ikke blokere arbejdsflow */
    } finally {
      prefetchInFlightRef.current = false;
    }
  }

  async function onNext(
    meetingScheduledForISO?: string,
    adminSkipBookingOverlap?: boolean,
    predictiveOutcome?: LeadStatus,
  ) {
    if (!activeLead) return;
    requestCallHangupBeforeAdvance();

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
    // #region agent log
    fetch("http://localhost:7253/ingest/cae62791-9bb1-4500-92a8-c26abf2c0c90", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d38e61" }, body: JSON.stringify({ sessionId: "d38e61", runId: debugRunId, hypothesisId: "H1", location: "campaign-workspace.tsx:onNext", message: "onNext patch prepared", data: { leadId: currentId, predictiveOutcome: predictiveOutcome ?? null, uiStatus: status, patchStatus: (patchBody as { status?: string }).status ?? null }, timestamp: Date.now() }) }).catch(() => {});
    // #endregion

    setError(null);
    setBackgroundSyncError(null);

    let rj: { lead: Lead | null };
    if (prefetchedLeadRef.current) {
      const buffered = prefetchedLeadRef.current;
      setPrefetchedLead(null);
      rj = { lead: buffered };
      void prefetchNextLead(buffered.id);
    } else {
      const excludedLeadIds = Array.from(new Set([
        currentId,
        ...backgroundLockLeadIdsRef.current,
      ]));
      const rRes = await fetch(`/api/campaigns/${campaignId}/reserve-next`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: buildReserveNextRequestBody(campaignId, {
          excludeLeadId: currentId,
          excludeLeadIds: excludedLeadIds,
        }),
      });
      if (!rRes.ok) {
        const j = await rRes.json().catch(() => ({}));
        setError(typeof j.error === "string" ? j.error : "Kunne ikke hente næste lead.");
        return;
      }
      rj = (await rRes.json()) as { lead: Lead | null };
    }

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
    // #region agent log
    fetch("http://localhost:7253/ingest/cae62791-9bb1-4500-92a8-c26abf2c0c90", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d38e61" }, body: JSON.stringify({ sessionId: "d38e61", runId: debugRunId, hypothesisId: "H5", location: "campaign-workspace.tsx:onNext:switchLead", message: "switching to reserved next lead", data: { previousLeadId: currentId, previousPhone: activeLead.phone, nextLeadId: rj.lead.id, nextPhone: rj.lead.phone, patchStatus: (patchBody as { status?: string }).status ?? null }, timestamp: Date.now() }) }).catch(() => {});
    // #endregion
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

  function requestCallHangupBeforeAdvance() {
    if (!showVoipStrip) return;
    // Ikke blokér Gem og næste: signalér altid hangup før lead-skift.
    // VoIP-strippen no-op'er selv hvis der ikke er aktivt kald.
    setVoipHangupSignal((n) => n + 1);
  }

  const handleOutcomeStatusChange = useCallback(
    (next: LeadStatus) => {
      // #region agent log
      fetch("http://localhost:7253/ingest/cae62791-9bb1-4500-92a8-c26abf2c0c90", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "d38e61" }, body: JSON.stringify({ sessionId: "d38e61", runId: debugRunId, hypothesisId: "H2", location: "campaign-workspace.tsx:handleOutcomeStatusChange", message: "outcome button clicked", data: { leadId: activeLeadRef.current?.id ?? null, next, campaignDialMode }, timestamp: Date.now() }) }).catch(() => {});
      // #endregion
      setStatus(next);
      if (campaignDialMode !== "PREDICTIVE") return;
      if (next === "NEW" || next === "MEETING_BOOKED" || next === "CALLBACK_SCHEDULED") return;
      queueMicrotask(() => void onNextRef.current(undefined, undefined, next));
    },
    [campaignDialMode, debugRunId],
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
  const isAutoDialMode = campaignDialMode === "POWER_DIALER" || campaignDialMode === "PREDICTIVE";
  const voipAutoStart = voipAutoDialAllowed && isAutoDialMode && !autoDialPaused;
  const showVoipStrip = campaignUsesVoipUi(campaignDialMode);
  const showAutoDialBadge = voipAutoDialAllowed && isAutoDialMode;

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
      <div className="shrink-0">
        <Link href="/kampagner" className="text-sm text-stone-500 hover:text-stone-800">
          ← Kampagner
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-stone-900">{campaignName}</h1>
          {showAutoDialBadge ? (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                autoDialPaused
                  ? "bg-amber-100 text-amber-900"
                  : campaignDialMode === "PREDICTIVE"
                    ? "bg-violet-100 text-violet-900"
                    : "bg-emerald-100 text-emerald-900"
              }`}
              aria-live="polite"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  autoDialPaused
                    ? "bg-amber-600"
                    : campaignDialMode === "PREDICTIVE"
                      ? "bg-violet-600 motion-safe:animate-pulse"
                      : "bg-emerald-600 motion-safe:animate-pulse"
                }`}
                aria-hidden="true"
              />
              {autoDialPaused
                ? "Auto-opkald sat på pause"
                : campaignDialMode === "PREDICTIVE"
                  ? "Predictive aktiv"
                  : "Power Dialer aktiv"}
            </span>
          ) : null}
          {showAutoDialBadge ? (
            <button
              type="button"
              onClick={() => setAutoDialPaused((p) => !p)}
              className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold shadow-sm transition ${
                autoDialPaused
                  ? "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800"
                  : "border-stone-300 bg-white text-stone-800 hover:border-stone-400 hover:bg-stone-50"
              }`}
              aria-pressed={autoDialPaused}
            >
              {autoDialPaused ? "Genoptag auto-opkald" : "Pause auto-opkald"}
            </button>
          ) : null}
          {showAutoDialBadge && dialerStats ? (
            <span
              className="inline-flex items-center gap-2 rounded-md border border-stone-200 bg-white/80 px-2.5 py-1 text-xs font-medium text-stone-700"
              title="Hold-status: «klar (VoIP)» er agenter klar til parallel-dispatch. Andre tal viser ringer, samtale og aktive udgående opkald."
              aria-live="polite"
            >
              <span className="text-stone-500">Hold:</span>
              <span className="text-emerald-700">
                {dialerStats.readyForDispatch ?? dialerStats.ready} klar
                {dialerStats.ready > (dialerStats.readyForDispatch ?? dialerStats.ready) ? (
                  <span className="text-stone-500">
                    {" "}
                    (+{dialerStats.ready - (dialerStats.readyForDispatch ?? dialerStats.ready)} uden
                    VoIP)
                  </span>
                ) : null}
              </span>
              <span className="text-stone-300">·</span>
              <span className="text-amber-700">{dialerStats.ringing} ringer</span>
              <span className="text-stone-300">·</span>
              <span className="text-violet-700">{dialerStats.talking} taler</span>
              <span className="text-stone-300">·</span>
              <span className="text-stone-700">{dialerStats.inFlightCalls} i luften</span>
            </span>
          ) : null}
          {showAutoDialBadge && sipReady === false ? (
            <span className="inline-flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900"
                title={
                  isAdmin
                    ? "Din konto har ingen Telnyx Telephony Credential. Gå til Administration → Telnyx og vælg «Provisionér» for at aktivere parallel-dispatch."
                    : "Din konto har ingen Telnyx Telephony Credential — en administrator skal provisionere VoIP for dig under Administration → Telnyx, før parallel dispatch kan ringe dig op."
                }
              >
                ⚠ Mangler VoIP-provisionering
              </span>
              {isAdmin ? (
                <Link
                  href="/administration/telnyx"
                  className="text-xs font-semibold text-amber-800 underline decoration-amber-500/50 underline-offset-2 hover:text-amber-950"
                >
                  Administration → Telnyx
                </Link>
              ) : null}
            </span>
          ) : null}
        </div>
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
      </div>

      <LeadOutcomeStrip
        status={status}
        onStatusChange={handleOutcomeStatusChange}
        meetingBookedAt={meetingBookedAt}
        bookedByUser={bookedByUser}
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
            <button
              type="button"
              onClick={() => setActivityOpen((o) => !o)}
              aria-pressed={activityOpen}
              className={[
                "inline-flex items-center gap-2 rounded-xl border px-5 py-3 text-sm font-semibold shadow-sm transition",
                activityOpen
                  ? "border-stone-900 bg-stone-900 text-white hover:bg-stone-800"
                  : "border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50",
              ].join(" ")}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Aktivitet
            </button>
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
          onUnansweredTimeout={() => {
            setStatus("NOT_HOME");
            queueMicrotask(() => void onNextRef.current(undefined, undefined, "NOT_HOME"));
          }}
          unansweredTimeoutMs={25_000}
          onLineStatusChange={setVoipLineStatus}
          hangupSignal={voipHangupSignal}
          onVoipFailureLogged={bumpVoipActivity}
          onCallEndedForActivity={schedulePollAfterCall}
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
      {activeLead?.id ? (
        <LeadActivityDrawer
          leadId={activeLead.id}
          isOpen={activityOpen}
          onClose={() => setActivityOpen(false)}
          reloadToken={voipActivityTick}
        />
      ) : null}
    </div>
  );
}
