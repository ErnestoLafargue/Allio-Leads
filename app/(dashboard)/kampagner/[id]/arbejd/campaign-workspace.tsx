"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/lead-status";
import { parseCustomFields } from "@/lib/custom-fields";
import type { BookingConfirmPayload } from "@/app/components/booking/booking-panel";
import { LeadOutcomeStrip } from "@/app/components/lead-workspace/lead-outcome-strip";
import { LeadKundeNoterBooking } from "@/app/components/lead-workspace/lead-kunde-noter-booking";
import {
  validateMeetingContactFields,
  type MeetingContactFieldErrors,
} from "@/lib/meeting-contact-validation";
import { isMeetingNotesSufficient } from "@/lib/meeting-notes-quality";
import { MeetingNotesRequiredDialog } from "@/app/components/meeting-notes-required-dialog";
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
import { LeadIdBadge } from "@/app/components/lead-id-badge";
import {
  useDialerPresence,
  type AssignedLead,
  type DialerPresenceStatus,
} from "@/lib/use-dialer-presence";
import { usePowerDialerPresence } from "@/lib/use-power-dialer-presence";
import { PowerDialerPhone, type PowerPhoneState } from "@/app/components/power-dialer-phone";
import { useActivityRecordingPoll } from "@/lib/use-activity-recording-poll";
import { scrollWorkspaceToTop } from "@/lib/scroll-workspace-to-top";
import { KNOWN_LEAD_SOURCES, parseLeadNavigation } from "@/lib/lead-navigation";
import { DIALER_AUTO_PAUSED_KEY, DIALER_START_PATH, markDialerPauseExit } from "@/lib/dialer-pause-exit";

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
  meetingCompanyName?: string;
  lockedByUserId?: string | null;
  lockedAt?: string | null;
  lockExpiresAt?: string | null;
  lockedByUser?: { id: string; name: string; username: string } | null;
  callbackScheduledFor?: string | null;
  callbackReservedByUserId?: string | null;
  callbackStatus?: string | null;
  assignedUserId?: string | null;
};

type Props = {
  campaignId: string;
  preferredLeadId?: string;
  /** true når brugeren er kommet ind via «Start» på kampagneoversigten — slår VoIP/auto-opkald til. */
  voipSession?: boolean;
  /** «Ring alle tildelte»: reserve via pool-API, skift kampagne-kontekst pr. lead. */
  poolMode?: boolean;
};

const LOCK_HEARTBEAT_MS = 25_000;

function preferStorageKey(campaignId: string) {
  return `kampagne-arbejd-prefer:${campaignId}`;
}

function poolPreferStorageKey() {
  return "kampagne-arbejd-prefer:pool";
}

type ReserveNextResult = {
  ok: boolean;
  lead: Lead | null;
  campaignId: string | null;
  dialMode: string | null;
  error?: string;
};

async function postReserveNext(opts: {
  poolMode: boolean;
  campaignId: string;
  afterCampaignId?: string | null;
  preferLeadId?: string;
  excludeLeadId?: string;
  excludeLeadIds?: string[];
}): Promise<ReserveNextResult> {
  if (opts.poolMode) {
    const body: Record<string, unknown> = {};
    if (opts.afterCampaignId) body.afterCampaignId = opts.afterCampaignId;
    if (opts.preferLeadId) body.preferLeadId = opts.preferLeadId;
    if (opts.excludeLeadId) body.excludeLeadId = opts.excludeLeadId;
    if (opts.excludeLeadIds?.length) body.excludeLeadIds = opts.excludeLeadIds;
    const res = await fetch("/api/dialer/pool/reserve-next", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => ({}))) as {
      lead?: Lead | null;
      campaignId?: string | null;
      dialMode?: string | null;
      error?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        lead: null,
        campaignId: null,
        dialMode: null,
        error: typeof j.error === "string" ? j.error : "Kunne ikke hente næste lead.",
      };
    }
    return {
      ok: true,
      lead: j.lead ?? null,
      campaignId: typeof j.campaignId === "string" ? j.campaignId : null,
      dialMode: typeof j.dialMode === "string" ? j.dialMode : null,
    };
  }

  const res = await fetch(`/api/campaigns/${opts.campaignId}/reserve-next`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: buildReserveNextRequestBody(opts.campaignId, {
      preferLeadId: opts.preferLeadId,
      excludeLeadId: opts.excludeLeadId,
      excludeLeadIds: opts.excludeLeadIds,
    }),
  });
  const j = (await res.json().catch(() => ({}))) as { lead?: Lead | null; error?: string };
  if (!res.ok) {
    return {
      ok: false,
      lead: null,
      campaignId: opts.campaignId,
      dialMode: null,
      error: typeof j.error === "string" ? j.error : "Kunne ikke hente næste lead.",
    };
  }
  return {
    ok: true,
    lead: j.lead ?? null,
    campaignId: opts.campaignId,
    dialMode: null,
  };
}

const POWER_STATUS_LABELS: Record<string, string> = {
  ready: "Klar — ringer op",
  ringing: "Forbinder til lead",
  talking: "I samtale",
  wrap_up: "Efterbehandling",
  draining: "Pauser…",
  paused: "Pause",
  offline: "Ikke startet",
};

function formatClockTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
}

async function releaseLockHttp(leadId: string) {
  await fetch(`/api/leads/${leadId}/lock`, { method: "DELETE", keepalive: true }).catch(() => {});
}

const BG_SAVE_RETRIES = 3;
const FIXED_MAIL_FROM = "hej@allio.dk";

function delayMs(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/** PATCH lead med de samme retries som baggrundsgem / flush før bridge. */
async function patchLeadDocument(
  leadId: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  for (let attempt = 0; attempt < BG_SAVE_RETRIES; attempt++) {
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      });
      if (res.ok) return true;
    } catch {
      /* prøv igen */
    }
    await delayMs(350 * (attempt + 1));
  }
  return false;
}

export function CampaignWorkspace({
  campaignId: initialCampaignId,
  preferredLeadId,
  voipSession = false,
  poolMode = false,
}: Props) {
  const searchParams = useSearchParams();
  const [campaignId, setCampaignId] = useState(initialCampaignId);
  const afterCampaignIdRef = useRef<string | null>(null);
  const leadNavigation = useMemo(
    () =>
      parseLeadNavigation(searchParams, {
        campaignIdForLegacy: campaignId || undefined,
        defaultPath: KNOWN_LEAD_SOURCES.kampagner.path,
      }),
    [searchParams, campaignId],
  );
  const returnPath = leadNavigation.openedFrom.path;
  const { data: session } = useSession();
  const sessionUserId = session?.user?.id ?? "";
  const isAdmin = session?.user?.role === "ADMIN";
  const [campaignName, setCampaignName] = useState(poolMode ? "Alle tildelte" : "");
  const [campaignDialMode, setCampaignDialMode] = useState<CampaignDialMode>("NO_DIAL");
  const [campaignSystemType, setCampaignSystemType] = useState<string | null>(null);
  /** Auto-dial pause-toggle (sessionStorage). Når true: agenten styrer selv hver opringning. */
  const [autoDialPaused, setAutoDialPaused] = useState<boolean>(() => {
    if (typeof sessionStorage === "undefined") return false;
    try {
      return sessionStorage.getItem(DIALER_AUTO_PAUSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  /** Power-session: sælgerens hensigt (serveren afgør den faktiske status). */
  const [powerIntent, setPowerIntent] = useState<"ready" | "pause">("ready");
  const [powerPhone, setPowerPhone] = useState<PowerPhoneState>({
    webrtcReady: false,
    lineStatus: "idle",
    problem: null,
  });
  /** Power-session afgøres ved sidens start: «Start» (voipSession=1) uden et bestemt lead i URL'en. */
  const [initialPreferredLeadId] = useState(() => preferredLeadId?.trim() ?? "");
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const [fieldConfigJson, setFieldConfigJson] = useState("{}");
  const [campaignLeadCount, setCampaignLeadCount] = useState<number | null>(null);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const activeLeadRef = useRef<Lead | null>(null);
  const workspaceRootRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollToTopRef = useRef(false);
  const [prefetchedLead, setPrefetchedLead] = useState<Lead | null>(null);
  const prefetchedLeadRef = useRef<Lead | null>(null);
  const prefetchInFlightRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /** Kort blokering af «Gem og næste» under optimistisk skift (dobbeltklik / prefetch-promovering). */
  const [nextAdvanceBusy, setNextAdvanceBusy] = useState(false);
  /** Fejl ved baggrundsgem af forrige lead (blokér ikke næste lead). */
  const [backgroundSyncError, setBackgroundSyncError] = useState<string | null>(null);
  const [integrationsSyncHint, setIntegrationsSyncHint] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  /** Lås på leads der stadig gemmes i baggrunden — heartbeat som aktivt lead. */
  const [backgroundLockLeadIds, setBackgroundLockLeadIds] = useState<string[]>([]);
  const backgroundLockLeadIdsRef = useRef<string[]>([]);
  const pendingPatchBodiesRef = useRef<Map<string, Record<string, unknown>>>(new Map());
  /** Undgå to samtidige baggrundsk PATCH-job for samme lead (fx gentagne klik når reserve-next fejler). */
  const backgroundPatchWorkerLeadIdsRef = useRef<Set<string>>(new Set());
  const onNextInFlightRef = useRef(false);
  const [powerDialerConnecting, setPowerDialerConnecting] = useState(false);

  const preferKeyFor = useCallback(
    (cid: string) => (poolMode ? poolPreferStorageKey() : preferStorageKey(cid)),
    [poolMode],
  );

  useEffect(() => {
    if (!poolMode && initialCampaignId) {
      setCampaignId(initialCampaignId);
    }
  }, [poolMode, initialCampaignId]);

  const applyCampaignMeta = useCallback(async (nextCampaignId: string) => {
    if (!nextCampaignId) return;
    const cRes = await fetch(`/api/campaigns/${nextCampaignId}`);
    if (!cRes.ok) return;
    const c = await cRes.json();
    setCampaignId(nextCampaignId);
    setCampaignName(
      poolMode
        ? `${typeof c.name === "string" ? c.name : "Kampagne"} · Alle tildelte`
        : (c.name ?? ""),
    );
    setCampaignDialMode(normalizeCampaignDialMode(c.dialMode));
    setCampaignSystemType(
      typeof c.systemCampaignType === "string" && c.systemCampaignType.trim()
        ? c.systemCampaignType.trim()
        : null,
    );
    setFieldConfigJson(c.fieldConfig ?? "{}");
    setCampaignLeadCount(typeof c._count?.leads === "number" ? c._count.leads : null);
  }, [poolMode]);

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
  const [meetingCompanyName, setMeetingCompanyName] = useState("");
  const [meetingContactErrors, setMeetingContactErrors] = useState<MeetingContactFieldErrors>({});
  const [meetingNotesRequiredOpen, setMeetingNotesRequiredOpen] = useState(false);
  const [callbackDialogOpen, setCallbackDialogOpen] = useState(false);
  const [callbackSubmitError, setCallbackSubmitError] = useState<string | null>(null);
  const [mailDialogOpen, setMailDialogOpen] = useState(false);
  const [defaultMeetingAssigneeId, setDefaultMeetingAssigneeId] = useState<string | undefined>();
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
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/users/meeting-assignees");
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { defaultUserId: string | null };
      if (!cancelled) setDefaultMeetingAssigneeId(data.defaultUserId ?? undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setMailSuccess(null);
    setMailError(null);
    setActivityOpen(false);
  }, [activeLead?.id]);

  useEffect(() => {
    if (!pendingScrollToTopRef.current || !activeLead?.id) return;
    pendingScrollToTopRef.current = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollWorkspaceToTop(workspaceRootRef.current);
      });
    });
  }, [activeLead?.id]);

  function requestScrollToTopAfterLeadChange() {
    pendingScrollToTopRef.current = true;
  }

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
    setMeetingCompanyName(l.meetingCompanyName ?? "");
  }, [campaignSystemType]);

  const resetFormForPowerWaiting = useCallback(() => {
    setCompanyName("");
    setPhone("");
    setEmail("");
    setCvr("");
    setAddress("");
    setPostalCode("");
    setCity("");
    setIndustry("");
    setNotes("");
    setCustom({});
    setStatus("NEW");
    setMeetingScheduledFor("");
    setMeetingBookedAt(null);
    setBookedByUser(null);
    setMeetingContactName("");
    setMeetingContactEmail("");
    setMeetingContactPhonePrivate("");
    setMeetingCompanyName("");
    setMeetingContactErrors({});
  }, []);

  /**
   * Power-session: låst ved sidens start og ændres ikke af URL'en bagefter (tildelte leads vises uden
   * at skrive leadId i URL'en, så arbejdsfladen aldrig falder tilbage til manuel kø).
   */
  const isPowerAutoDialSession =
    !poolMode && campaignDialMode === "POWER_DIALER" && voipSession && !initialPreferredLeadId;
  /** Pause er slået til: næste gem lukker kampagnen og sender sælgeren til Start. */
  const leaveAfterSave = isPowerAutoDialSession
    ? powerIntent === "pause"
    : autoDialPaused;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setDone(false);

      if (poolMode) {
        const preferRaw =
          typeof window !== "undefined" ? sessionStorage.getItem(preferKeyFor("")) : null;
        const preferLeadId = preferredLeadId?.trim() || preferRaw?.trim() || undefined;
        const rj = await postReserveNext({
          poolMode: true,
          campaignId: "",
          afterCampaignId: afterCampaignIdRef.current,
          preferLeadId,
        });
        if (cancelled) return;
        if (!rj.ok) {
          setError(rj.error ?? "Kunne ikke reservere lead.");
          setActiveLead(null);
          setLoading(false);
          return;
        }
        if (rj.lead && rj.campaignId) {
          afterCampaignIdRef.current = rj.campaignId;
          await applyCampaignMeta(rj.campaignId);
          if (cancelled) return;
          setActiveLead(rj.lead);
          try {
            sessionStorage.setItem(preferKeyFor(rj.campaignId), rj.lead.id);
          } catch {
            /* ignore */
          }
        } else {
          setActiveLead(null);
          setDone(true);
          try {
            sessionStorage.removeItem(preferKeyFor(""));
          } catch {
            /* ignore */
          }
        }
        setLoading(false);
        return;
      }

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
      const dialMode = normalizeCampaignDialMode(c.dialMode);
      // Power-session («Start» uden leadId): ingen manuel reservation — heller ikke fra en gammel
      // prefer-nøgle i sessionStorage, som ellers ville åbne et almindeligt lead i stedet.
      const skipReserveForPowerAuto =
        dialMode === "POWER_DIALER" && Boolean(voipSession) && !initialPreferredLeadId;
      const preferRaw =
        typeof window !== "undefined" && !skipReserveForPowerAuto
          ? sessionStorage.getItem(preferKeyFor(campaignId))
          : null;
      const preferLeadId = preferredLeadId?.trim() || preferRaw?.trim() || undefined;

      setCampaignName(c.name ?? "");
      setCampaignDialMode(dialMode);
      setCampaignSystemType(
        typeof c.systemCampaignType === "string" && c.systemCampaignType.trim()
          ? c.systemCampaignType.trim()
          : null,
      );
      setFieldConfigJson(c.fieldConfig ?? "{}");
      setCampaignLeadCount(total);

      if (skipReserveForPowerAuto) {
        if (!cancelled) {
          setActiveLead(null);
          resetFormForPowerWaiting();
          try {
            sessionStorage.removeItem(preferKeyFor(campaignId));
          } catch {
            /* ignore */
          }
          setLoading(false);
        }
        return;
      }

      const rj = await postReserveNext({
        poolMode: false,
        campaignId,
        preferLeadId,
      });
      if (cancelled) return;
      if (!rj.ok) {
        setError(rj.error ?? "Kunne ikke reservere lead.");
        setActiveLead(null);
        setLoading(false);
        return;
      }
      if (rj.lead) {
        setActiveLead(rj.lead);
        try {
          sessionStorage.setItem(preferKeyFor(campaignId), rj.lead.id);
        } catch {
          /* ignore */
        }
      } else {
        setActiveLead(null);
        try {
          sessionStorage.removeItem(preferKeyFor(campaignId));
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
    // Pool: genindlæs ikke når campaignId skifter midt i sessionen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    poolMode ? "pool" : campaignId,
    preferredLeadId,
    voipSession,
    resetFormForPowerWaiting,
    preferKeyFor,
    applyCampaignMeta,
  ]);

  useEffect(() => {
    if (!activeLead?.id) {
      const prevId = prefetchedLeadRef.current?.id ?? null;
      if (prevId) void releaseLockHttp(prevId);
      setPrefetchedLead(null);
      return;
    }
    // Power: næste lead kommer fra dispatcheren — ingen manuel forhåndsreservation.
    if (isPowerAutoDialSession) return;
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
      if (autoDialPaused) sessionStorage.setItem(DIALER_AUTO_PAUSED_KEY, "1");
      else sessionStorage.removeItem(DIALER_AUTO_PAUSED_KEY);
    } catch {
      /* no-op */
    }
  }, [autoDialPaused]);

  // VoIP-strip linje-status (bruges til at rapportere agentens dialer-presence)
  const [voipLineStatus, setVoipLineStatus] = useState<LineStatus>("idle");
  const [voipHangupSignal, setVoipHangupSignal] = useState(0);

  /**
   * Predictive: mapper voip-strip's lokale lineStatus + auto-dial-pause til presence-status.
   * Power Dialer bruger sin egen serverstyrede presence (usePowerDialerPresence).
   * - autoDialPaused → offline (server skal ikke ringe os op)
   * - voipLineStatus=ringing/connecting → ringing (vi venter på et opkald)
   * - voipLineStatus=live → talking (vi er i samtale)
   * - voipLineStatus=idle → ready (vi er klar til at modtage et bridge)
   * - andet → offline
   */
  const isAutoDialModeForPresence = campaignDialMode === "PREDICTIVE";
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

  /** Før hard navigation (bridge): gem pending udfald så de ikke tabes og parallel-AMD ikke vinder racet. */
  const flushPendingLeadPatches = useCallback(async () => {
    const entries = Array.from(pendingPatchBodiesRef.current.entries());
    if (entries.length === 0) return;
    pendingPatchBodiesRef.current.clear();
    const batchIds = new Set(entries.map(([id]) => id));
    for (const [leadId, body] of entries) {
      await patchLeadDocument(leadId, body);
      await releaseLockHttp(leadId);
    }
    setBackgroundLockLeadIds((prev) => prev.filter((id) => !batchIds.has(id)));
  }, []);

  /** Gem lead i baggrunden efter optimistisk skift til næste (Gem og næste). */
  const queueBackgroundPatch = useCallback((leadId: string, body: Record<string, unknown>) => {
    setBackgroundSyncError(null);
    setBackgroundLockLeadIds((prev) => (prev.includes(leadId) ? prev : [...prev, leadId]));
    pendingPatchBodiesRef.current.set(leadId, body);
    if (backgroundPatchWorkerLeadIdsRef.current.has(leadId)) return;
    backgroundPatchWorkerLeadIdsRef.current.add(leadId);
    void (async () => {
      try {
        const snapshot = pendingPatchBodiesRef.current.get(leadId) ?? body;
        const ok = await patchLeadDocument(leadId, snapshot);
        pendingPatchBodiesRef.current.delete(leadId);
        setBackgroundLockLeadIds((prev) => prev.filter((id) => id !== leadId));
        if (ok) {
          await releaseLockHttp(leadId);
        } else {
          setBackgroundSyncError(
            "Kunne ikke gemme forrige lead i baggrunden. Tjek netværk eller åbn leadet fra listen for at gemme igen.",
          );
          await releaseLockHttp(leadId);
        }
      } finally {
        backgroundPatchWorkerLeadIdsRef.current.delete(leadId);
      }
    })();
  }, []);

  const handleAssignedLead = useCallback(
    async (lead: AssignedLead) => {
      if (typeof window === "undefined") return;
      await flushPendingLeadPatches();
      if (campaignDialMode === "POWER_DIALER") {
        setError(null);
        setPowerDialerConnecting(true);
        try {
          const res = await fetch(`/api/leads/${encodeURIComponent(lead.id)}`);
          if (!res.ok) {
            setPowerDialerConnecting(false);
            setError("Kunne ikke hente lead efter opkald.");
            return;
          }
          const full = (await res.json()) as Lead & { campaignId?: string };
          if (full.campaignId && full.campaignId !== campaignId) {
            setPowerDialerConnecting(false);
            setError("Lead tilhører en anden kampagne.");
            return;
          }
          const lockRes = await fetch(`/api/leads/${encodeURIComponent(lead.id)}/lock`, {
            method: "POST",
          });
          if (!lockRes.ok) {
            setPowerDialerConnecting(false);
            const j = await lockRes.json().catch(() => ({}));
            setError(typeof j.error === "string" ? j.error : "Kunne ikke låse lead.");
            return;
          }
          const lockedPayload = (await lockRes.json()) as { lead?: Lead };
          const toShow = lockedPayload.lead ?? full;
          setActiveLead(toShow);
          setPowerDialerConnecting(false);
        } catch {
          setPowerDialerConnecting(false);
          setError("Netværksfejl ved hentning af lead.");
        }
        return;
      }
      const q = new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : "",
      );
      q.set("leadId", lead.id);
      q.set("voipSession", "1");
      if (!q.has("from")) q.set("from", KNOWN_LEAD_SOURCES.kampagner.path);
      if (!q.has("source")) q.set("source", "dialer");
      const targetUrl = `/kampagner/${campaignId}/arbejd?${q.toString()}`;
      if (!window.location.pathname.endsWith("/arbejd") || activeLeadRef.current?.id !== lead.id) {
        window.location.assign(targetUrl);
      }
    },
    [campaignId, campaignDialMode, flushPendingLeadPatches],
  );

  const {
    server: powerServer,
    lastDispatch: powerLastDispatch,
    error: powerPresenceError,
    skipWrapUp,
    takeOver,
  } = usePowerDialerPresence({
    campaignId: isPowerAutoDialSession && campaignId ? campaignId : null,
    intent: powerIntent,
    leadOpen: Boolean(activeLead),
    lineLive: powerPhone.lineStatus === "live",
    webrtcReady: powerPhone.webrtcReady,
    onAssignedLead: handleAssignedLead,
  });

  const { stats: dialerStats, sipReady } = useDialerPresence({
    campaignId: isAutoDialModeForPresence && campaignId ? campaignId : null,
    status: presenceStatus,
    intervalMs: 5000,
    onAssignedLead: handleAssignedLead,
    enableDispatch: false,
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
      meetingCompanyName,
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
      if (j?.code === "MEETING_NOTES_INSUFFICIENT") {
        setMeetingNotesRequiredOpen(true);
        return null;
      }
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
    setMeetingCompanyName(updated.meetingCompanyName ?? "");
    setError(null);
    return { next: [], updated };
  }

  async function advanceToNextReservedAfterSave(savedLeadId: string) {
    if (leaveAfterSave) {
      await releaseLockHttp(savedLeadId);
      leaveDialerAfterPause();
      return;
    }
    if (isPowerAutoDialSession) {
      await releaseLockHttp(savedLeadId);
      setActiveLead(null);
      resetFormForPowerWaiting();
      setDone(false);
      try {
        sessionStorage.removeItem(preferKeyFor(campaignId));
      } catch {
        /* ignore */
      }
      return;
    }
    await releaseLockHttp(savedLeadId);
    const excludedLeadIds = Array.from(new Set([
      savedLeadId,
      ...backgroundLockLeadIdsRef.current,
    ]));
    const rj = await postReserveNext({
      poolMode,
      campaignId,
      afterCampaignId: poolMode ? afterCampaignIdRef.current : null,
      excludeLeadId: savedLeadId,
      excludeLeadIds: excludedLeadIds,
    });
    if (!rj.ok) {
      setError(rj.error ?? "Kunne ikke hente næste lead.");
      setDone(true);
      try {
        sessionStorage.removeItem(preferKeyFor(campaignId));
      } catch {
        /* ignore */
      }
      return;
    }
    if (rj.lead) {
      if (poolMode && rj.campaignId) {
        afterCampaignIdRef.current = rj.campaignId;
        await applyCampaignMeta(rj.campaignId);
      }
      requestScrollToTopAfterLeadChange();
      setActiveLead(rj.lead);
      try {
        sessionStorage.setItem(preferKeyFor(campaignId), rj.lead.id);
      } catch {
        /* ignore */
      }
    } else {
      setActiveLead(null);
      setDone(true);
      try {
        sessionStorage.removeItem(preferKeyFor(campaignId));
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
      const rj = await postReserveNext({
        poolMode,
        campaignId,
        afterCampaignId: poolMode ? afterCampaignIdRef.current : null,
        excludeLeadId,
        excludeLeadIds: excludedLeadIds,
      });
      if (!rj.ok) return;
      const next = rj.lead ?? null;
      const prevId = prefetchedLeadRef.current?.id ?? null;
      const activeId = activeLeadRef.current?.id ?? null;
      if (prevId && prevId !== next?.id && prevId !== activeId) {
        void releaseLockHttp(prevId);
      }
      // Gem pool-kampagne på prefetched lead via campaign relation hvis muligt
      setPrefetchedLead(next);
      if (poolMode && next && rj.campaignId) {
        (next as Lead & { _poolCampaignId?: string })._poolCampaignId = rj.campaignId;
      }
    } catch {
      /* prefetch-fejl må ikke blokere arbejdsflow */
    } finally {
      prefetchInFlightRef.current = false;
    }
  }

  /** Kassér forudhentet næste-lead (fx ved udfaldsændring eller før ordnet gem+navigation). */
  const clearPrefetchReservation = useCallback(() => {
    const pid = prefetchedLeadRef.current?.id;
    setPrefetchedLead(null);
    if (pid) void releaseLockHttp(pid);
  }, []);

  function leaveDialerAfterPause() {
    clearPrefetchReservation();
    const path = markDialerPauseExit({ preferStorageKey: preferKeyFor(campaignId) });
    window.location.assign(path || DIALER_START_PATH);
  }

  async function onNext(
    meetingScheduledForISO?: string,
    adminSkipBookingOverlap?: boolean,
    predictiveOutcome?: LeadStatus,
  ) {
    if (!activeLead) return;
    requestCallHangupBeforeAdvance();

    /** Mødebooking: overlap-validering synkront; Cal.eu/Podio sync kører i baggrunden på serveren. */
    if (status === "MEETING_BOOKED" && predictiveOutcome === undefined) {
      const iso =
        meetingScheduledForISO ??
        (meetingScheduledFor ? new Date(meetingScheduledFor).toISOString() : undefined);
      const contactErr = validateMeetingContactFields(
        meetingContactName,
        meetingContactEmail,
        meetingContactPhonePrivate,
        meetingCompanyName,
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

      // Kræv rigtige noter ved ny booking-bekræftelse (samme regel som serveren).
      const isNewBookingConfirm =
        !meetingBookedAt ||
        !activeLead.meetingScheduledFor ||
        new Date(activeLead.meetingScheduledFor).getTime() !== new Date(iso).getTime();
      if (isNewBookingConfirm && !isMeetingNotesSufficient(notes)) {
        setMeetingNotesRequiredOpen(true);
        return;
      }

      const currentId = activeLead.id;
      const pf = prefetchedLeadRef.current;
      const usePrefetch =
        Boolean(pf && pf.id !== currentId && !backgroundLockLeadIdsRef.current.includes(pf.id));

      setSaving(true);
      setError(null);
      const saved = await saveLead(activeLead, meetingScheduledForISO, adminSkipBookingOverlap);
      setSaving(false);
      if (!saved) return;

      if ((saved.updated as Lead & { integrationsPending?: boolean }).integrationsPending) {
        setIntegrationsSyncHint(true);
        window.setTimeout(() => setIntegrationsSyncHint(false), 30_000);
      }

      if (meetingScheduledForISO) {
        const d = new Date(meetingScheduledForISO);
        const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
        setMeetingScheduledFor(local.toISOString().slice(0, 16));
      }

      if (leaveAfterSave) {
        void releaseLockHttp(currentId);
        leaveDialerAfterPause();
        return;
      }

      if (usePrefetch && pf) {
        setPrefetchedLead(null);
        prefetchInFlightRef.current = false;
        void releaseLockHttp(currentId);
        if (poolMode) {
          const cid =
            (pf as Lead & { _poolCampaignId?: string })._poolCampaignId ||
            (pf as Lead & { campaign?: { id?: string } }).campaign?.id;
          if (cid) {
            afterCampaignIdRef.current = cid;
            await applyCampaignMeta(cid);
          }
        }
        requestScrollToTopAfterLeadChange();
        setActiveLead(pf);
        loadFormFromLead(pf);
        try {
          sessionStorage.setItem(preferKeyFor(campaignId), pf.id);
        } catch {
          /* ignore */
        }
        void prefetchNextLead(pf.id);
        return;
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

    if (isPowerAutoDialSession) {
      setError(null);
      if (onNextInFlightRef.current) return;
      onNextInFlightRef.current = true;
      setNextAdvanceBusy(true);
      try {
        clearPrefetchReservation();
        queueBackgroundPatch(currentId, patchBody);
        void releaseLockHttp(currentId);
        if (leaveAfterSave) {
          leaveDialerAfterPause();
          return;
        }
        setActiveLead(null);
        resetFormForPowerWaiting();
        setDone(false);
        try {
          sessionStorage.removeItem(preferKeyFor(campaignId));
        } catch {
          /* ignore */
        }
      } finally {
        onNextInFlightRef.current = false;
        setNextAdvanceBusy(false);
      }
      return;
    }

    setError(null);

    if (onNextInFlightRef.current) return;
    onNextInFlightRef.current = true;
    setNextAdvanceBusy(true);

    try {
      if (leaveAfterSave) {
        clearPrefetchReservation();
        queueBackgroundPatch(currentId, patchBody);
        void releaseLockHttp(currentId);
        leaveDialerAfterPause();
        return;
      }

      const pf = prefetchedLeadRef.current;
      const usePrefetch =
        Boolean(pf && pf.id !== currentId && !backgroundLockLeadIdsRef.current.includes(pf.id));

      const applyNextLead = async (next: Lead | null, nextCampaignId?: string | null) => {
        if (!next) {
          setActiveLead(null);
          setDone(true);
          try {
            sessionStorage.removeItem(preferKeyFor(campaignId));
          } catch {
            /* ignore */
          }
          return;
        }
        if (poolMode) {
          const cid =
            nextCampaignId ||
            (next as Lead & { _poolCampaignId?: string })._poolCampaignId ||
            (next as Lead & { campaign?: { id?: string } }).campaign?.id;
          if (cid) {
            afterCampaignIdRef.current = cid;
            await applyCampaignMeta(cid);
          }
        }
        requestScrollToTopAfterLeadChange();
        setActiveLead(next);
        loadFormFromLead(next);
        try {
          sessionStorage.setItem(preferKeyFor(campaignId), next.id);
        } catch {
          /* ignore */
        }
        void prefetchNextLead(next.id);
      };

      if (usePrefetch && pf) {
        setPrefetchedLead(null);
        prefetchInFlightRef.current = false;
        await applyNextLead(pf);
        queueBackgroundPatch(currentId, patchBody);
        return;
      }

      clearPrefetchReservation();

      setSaving(true);
      const excludedLeadIds = Array.from(new Set([currentId, ...backgroundLockLeadIdsRef.current]));
      const rj = await postReserveNext({
        poolMode,
        campaignId,
        afterCampaignId: poolMode ? afterCampaignIdRef.current : null,
        excludeLeadId: currentId,
        excludeLeadIds: excludedLeadIds,
      });
      setSaving(false);

      queueBackgroundPatch(currentId, patchBody);

      if (!rj.ok) {
        setError(rj.error ?? "Kunne ikke hente næste lead.");
        return;
      }

      await applyNextLead(rj.lead, rj.campaignId);
    } finally {
      onNextInFlightRef.current = false;
      setNextAdvanceBusy(false);
    }
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
    setVoipHangupSignal((n) => n + 1);
  }

  const handleUpdateLeadPhoneFromVoip = useCallback(async (nextPhoneRaw: string) => {
    const lead = activeLeadRef.current;
    if (!lead) {
      return { ok: false, message: "Intet aktivt lead." };
    }
    const nextPhone = nextPhoneRaw.trim();
    setPhone(nextPhone);
    setActiveLead((prev) => (prev ? { ...prev, phone: nextPhone } : prev));
    const patchBody = {
      ...buildCampaignLeadPatchBody(getFormSnapshot()),
      phone: nextPhone,
    };
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        return {
          ok: false,
          message: typeof j.error === "string" ? j.error : "Kunne ikke gemme nummer på lead.",
        };
      }
      const updated = (await res.json()) as Lead;
      setActiveLead(updated);
      setPhone(updated.phone ?? nextPhone);
      setError(null);
      return { ok: true, message: "Nummer opdateret på lead." };
    } catch {
      return { ok: false, message: "Netværksfejl ved gem af nummer." };
    }
  }, [getFormSnapshot]);

  const handleOutcomeStatusChange = useCallback(
    (next: LeadStatus) => {
      clearPrefetchReservation();
      setStatus(next);
      /** Power + Predictive: gem+skift uden «Gem og næste». Ikke NO_DIAL / CLICK_TO_CALL. */
      const autoAdvanceOnOutcome =
        (campaignDialMode === "POWER_DIALER" || campaignDialMode === "PREDICTIVE") &&
        next !== "NEW" &&
        next !== "MEETING_BOOKED" &&
        next !== "CALLBACK_SCHEDULED";
      if (!autoAdvanceOnOutcome) return;
      queueMicrotask(() => void onNextRef.current(undefined, undefined, next));
    },
    [campaignDialMode, clearPrefetchReservation],
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
    return <div className="py-12 text-center text-stone-500">Henter kampagne…</div>;
  }

  if (error && !campaignName && activeLead === null && !done) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-600">{error}</p>
        <Link href={returnPath} className="text-sm font-medium text-stone-700 underline-offset-2 hover:underline">
          ← Tilbage
        </Link>
      </div>
    );
  }

  if (campaignLeadCount === 0) {
    return (
      <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="text-lg font-semibold text-stone-900">Ingen leads i denne kampagne</h1>
        <Link href={returnPath} className="text-sm font-medium text-stone-700 underline-offset-2 hover:underline">
          ← Tilbage
        </Link>
      </div>
    );
  }

  if (!done && !activeLead && !isPowerAutoDialSession) {
    return (
      <div className="space-y-6">
        <div>
          <Link href={returnPath} className="text-sm text-stone-500 hover:text-stone-800">
            ← Tilbage
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
                  const rj = await postReserveNext({
                    poolMode,
                    campaignId,
                    afterCampaignId: poolMode ? afterCampaignIdRef.current : null,
                  });
                  if (rj.ok) {
                    if (rj.lead) {
                      if (poolMode && rj.campaignId) {
                        afterCampaignIdRef.current = rj.campaignId;
                        await applyCampaignMeta(rj.campaignId);
                      }
                      setActiveLead(rj.lead);
                      setDone(false);
                      try {
                        sessionStorage.setItem(preferKeyFor(campaignId), rj.lead.id);
                      } catch {
                        /* ignore */
                      }
                    }
                  } else {
                    setError(rj.error ?? "Kunne ikke reservere.");
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
              href={returnPath}
              className="inline-block text-sm font-medium text-stone-800 underline-offset-2 hover:underline"
            >
              ← Tilbage
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (done && !isPowerAutoDialSession) {
    return (
      <div className="space-y-6 rounded-xl border border-emerald-200 bg-emerald-50/80 p-10 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-emerald-950">Du er igennem køen</h1>
        <p className="text-sm text-emerald-900">
          Der er ikke flere ledige «Ny»-leads i «{campaignName}» lige nu (med dit arbejdsflow).
        </p>
        <Link
          href={returnPath}
          className="inline-block rounded-md bg-emerald-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-900"
        >
          ← Tilbage
        </Link>
      </div>
    );
  }

  const current = activeLead;
  const isAutoDialMode = campaignDialMode === "POWER_DIALER" || campaignDialMode === "PREDICTIVE";
  const voipAutoStart = voipAutoDialAllowed && campaignDialMode === "PREDICTIVE" && !autoDialPaused;
  const showVoipStrip = campaignUsesVoipUi(campaignDialMode) && !isPowerAutoDialSession;
  const showAutoDialBadge = voipAutoDialAllowed && isAutoDialMode;
  const powerStats = powerServer?.stats ?? null;
  const powerQueueEmpty = powerLastDispatch?.code === "QUEUE_EMPTY" && (powerLastDispatch.inFlight ?? 0) === 0;
  const wrapUpMsLeft =
    powerServer?.status === "wrap_up" && powerServer.wrapUpUntil
      ? Math.max(0, new Date(powerServer.wrapUpUntil).getTime() - nowTick)
      : 0;

  const showOriginalCancelledMeetingInfo =
    current != null &&
    campaignSystemType === "rebooking" &&
    current.status === "MEETING_BOOKED" &&
    String(current.meetingOutcomeStatus ?? "").trim().toUpperCase() === MEETING_OUTCOME_REBOOK &&
    Boolean(current.meetingScheduledFor);

  const canScheduleCallback =
    current != null &&
    (current.status === "NEW" ||
      (current.status === "CALLBACK_SCHEDULED" &&
        String(current.callbackStatus ?? "PENDING").trim().toUpperCase() === "PENDING"));

  const showNextForMeeting = status !== "MEETING_BOOKED";
  const nextLabel = leaveAfterSave
    ? saving || nextAdvanceBusy
      ? "Gemmer…"
      : "Gem og gå til pause"
    : saving
      ? "Henter næste…"
      : nextAdvanceBusy
        ? "Skifter…"
        : "Gem og næste";
  const showBackgroundSaveHint = backgroundLockLeadIds.length > 0;
  const nextButtonClass = leaveAfterSave
    ? "rounded-xl bg-amber-800 px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-amber-900 disabled:opacity-60 shrink-0"
    : "rounded-xl bg-stone-900 px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-stone-800 disabled:opacity-60 shrink-0";

  function renderNextButton() {
    if (isPowerAutoDialSession && !leaveAfterSave) return null;
    if (!showNextForMeeting) return null;
    return (
      <button
        type="button"
        disabled={saving || nextAdvanceBusy}
        onClick={() => void onNext()}
        className={nextButtonClass}
      >
        {nextLabel}
      </button>
    );
  }

  return (
    <div
      ref={workspaceRootRef}
      className="relative flex min-h-[calc(100dvh-5.5rem)] flex-col gap-4 pb-4"
    >
      {isPowerAutoDialSession ? (
        <PowerDialerPhone
          campaignId={campaignId}
          enabled={!powerServer?.superseded}
          leadLabel={current?.companyName ?? null}
          reportLeadId={current?.id ?? null}
          hangupSignal={voipHangupSignal}
          onStateChange={setPowerPhone}
        />
      ) : null}

      {isPowerAutoDialSession && powerServer?.superseded ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p>Power Dialer kører i en anden fane eller på en anden computer.</p>
          <button
            type="button"
            onClick={() => takeOver()}
            className="mt-2 rounded-md bg-amber-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-900"
          >
            Tag over her
          </button>
        </div>
      ) : null}

      {isPowerAutoDialSession && !current ? (
        <div className="min-h-[40vh] px-2 py-4">
          <div className="sticky top-0 z-10 -mx-2 bg-stone-50/90 px-2 pb-3 pt-1 backdrop-blur-sm">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
              <div
                className={`h-full rounded-full ${
                  powerQueueEmpty ? "w-full bg-emerald-600/40" : "w-full bg-emerald-600 animate-power-dialer-wait-fill"
                }`}
              />
            </div>
          </div>
          <p className="mt-4 text-center text-sm font-medium text-stone-800">
            {powerQueueEmpty
              ? "Ingen flere leads i køen lige nu — Power Dialer prøver igen, når der er nogen."
              : powerServer?.status === "wrap_up"
                ? wrapUpMsLeft > 0
                  ? `Efterbehandling — klar om ${Math.ceil(wrapUpMsLeft / 1000)} sek.`
                  : "Gemmer udfald — du er snart klar igen."
                : powerServer?.status === "draining" || powerIntent === "pause"
                  ? "Pause: der startes ikke nye opkald. Når et lead åbner og du gemmer, lukkes kampagnen."
                  : powerDialerConnecting || powerServer?.status === "ringing"
                    ? "Forbinder samtale…"
                    : "Power Dialer ringer flere numre parallelt — lead åbnes når nogen svarer."}
          </p>
          {powerStats || powerLastDispatch ? (
            <div
              className="mx-auto mt-3 flex max-w-lg flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-lg border border-stone-200 bg-white/90 px-3 py-2 text-xs text-stone-700"
              aria-live="polite"
            >
              {powerStats ? (
                <>
                  <span>
                    <span className="font-semibold text-emerald-800 tabular-nums">{powerStats.inFlight}</span> i luften
                  </span>
                  <span className="text-stone-300">·</span>
                  <span>
                    mål <span className="font-semibold tabular-nums">{powerStats.target}</span>
                  </span>
                  <span className="text-stone-300">·</span>
                  <span>
                    <span className="font-semibold tabular-nums">{powerStats.ready}</span> klar
                  </span>
                  {powerStats.channelLimit != null ? (
                    <>
                      <span className="text-stone-300">·</span>
                      <span>
                        kanaler{" "}
                        <span className="tabular-nums">
                          {powerStats.channelsInUse}/{powerStats.channelLimit}
                        </span>
                      </span>
                    </>
                  ) : null}
                  {powerStats.brakeActive ? (
                    <>
                      <span className="text-stone-300">·</span>
                      <span className="font-semibold text-amber-800">drop-bremse</span>
                    </>
                  ) : null}
                </>
              ) : null}
              {powerLastDispatch ? (
                <>
                  {powerStats ? <span className="text-stone-300">·</span> : null}
                  <span>
                    sidst +<span className="tabular-nums">{powerLastDispatch.dispatched}</span>
                  </span>
                </>
              ) : null}
            </div>
          ) : null}
          <div className="mt-4 flex flex-col items-center gap-2">
            {powerServer?.status === "wrap_up" && wrapUpMsLeft > 0 ? (
              <button
                type="button"
                onClick={() => skipWrapUp()}
                className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100"
              >
                Klar nu
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setPowerIntent((p) => (p === "pause" ? "ready" : "pause"))}
              className={`rounded-lg border px-4 py-2 text-sm font-medium shadow-sm ${
                powerIntent === "pause"
                  ? "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800"
                  : "border-stone-300 bg-white text-stone-800 hover:bg-stone-50"
              }`}
            >
              {powerIntent === "pause" ? "Fortsæt" : "Pause"}
            </button>
          </div>
          {powerPhone.problem ? (
            <p className="mt-3 text-center text-xs font-medium text-red-700">{powerPhone.problem}</p>
          ) : null}
          {powerPresenceError ? (
            <p className="mt-3 text-center text-xs text-red-700">{powerPresenceError}</p>
          ) : null}
          {error ? <p className="mt-3 text-center text-sm text-red-600">{error}</p> : null}
          <p className="mt-10 text-center">
            <Link href={returnPath} className="text-xs text-stone-500 underline-offset-2 hover:text-stone-800 hover:underline">
              ← Tilbage
            </Link>
          </p>
        </div>
      ) : null}

      {current ? (
      <>
      <div className="shrink-0">
        <Link href={returnPath} className="text-sm text-stone-500 hover:text-stone-800">
          ← Kampagner
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-stone-900">{campaignName}</h1>
          {!showAutoDialBadge && autoDialPaused ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900"
              aria-live="polite"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-600" aria-hidden="true" />
              På pause
            </span>
          ) : null}
          {showAutoDialBadge ? (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                (isPowerAutoDialSession ? powerIntent === "pause" : autoDialPaused)
                  ? "bg-amber-100 text-amber-900"
                  : campaignDialMode === "PREDICTIVE"
                    ? "bg-violet-100 text-violet-900"
                    : "bg-emerald-100 text-emerald-900"
              }`}
              aria-live="polite"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  (isPowerAutoDialSession ? powerIntent === "pause" : autoDialPaused)
                    ? "bg-amber-600"
                    : campaignDialMode === "PREDICTIVE"
                      ? "bg-violet-600 motion-safe:animate-pulse"
                      : "bg-emerald-600 motion-safe:animate-pulse"
                }`}
                aria-hidden="true"
              />
              {isPowerAutoDialSession
                ? powerIntent === "pause"
                  ? "Power Dialer på pause"
                  : "Power Dialer aktiv"
                : autoDialPaused
                  ? "Auto-opkald sat på pause"
                  : campaignDialMode === "PREDICTIVE"
                    ? "Predictive aktiv"
                    : "Power Dialer aktiv"}
            </span>
          ) : null}
          {showAutoDialBadge && !isPowerAutoDialSession ? (
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
          {isPowerAutoDialSession ? (
            <button
              type="button"
              onClick={() => setPowerIntent((p) => (p === "pause" ? "ready" : "pause"))}
              className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold shadow-sm transition ${
                powerIntent === "pause"
                  ? "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800"
                  : "border-stone-300 bg-white text-stone-800 hover:border-stone-400 hover:bg-stone-50"
              }`}
              aria-pressed={powerIntent === "pause"}
            >
              {powerIntent === "pause" ? "Fortsæt" : "Pause"}
            </button>
          ) : null}
          {!showAutoDialBadge && !isPowerAutoDialSession ? (
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
              {autoDialPaused ? "Fortsæt" : "Pause"}
            </button>
          ) : null}
          {isPowerAutoDialSession && powerServer?.status === "wrap_up" && wrapUpMsLeft > 0 ? (
            <button
              type="button"
              onClick={() => skipWrapUp()}
              className="inline-flex items-center rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
            >
              Klar nu ({Math.ceil(wrapUpMsLeft / 1000)}s)
            </button>
          ) : null}
          {isPowerAutoDialSession && powerStats ? (
            <span
              className="inline-flex items-center gap-2 rounded-md border border-stone-200 bg-white/80 px-2.5 py-1 text-xs font-medium text-stone-700"
              aria-live="polite"
            >
              <span className="text-stone-500">Hold:</span>
              <span className="text-emerald-700">{powerStats.ready} klar</span>
              <span className="text-stone-300">·</span>
              <span className="text-stone-700">{powerStats.inFlight} i luften</span>
              <span className="text-stone-300">·</span>
              <span>mål {powerStats.target}</span>
              {powerStats.brakeActive ? (
                <>
                  <span className="text-stone-300">·</span>
                  <span className="text-amber-800">drop-bremse</span>
                </>
              ) : null}
            </span>
          ) : null}
          {showAutoDialBadge && !isPowerAutoDialSession && dialerStats ? (
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
          {showAutoDialBadge &&
          (isPowerAutoDialSession ? powerServer?.sipReady === false : sipReady === false) ? (
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
        {leaveAfterSave ? (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            Pause er slået til. Når du gemmer, lukkes kampagnen, og du kommer tilbage til starten.
          </p>
        ) : null}
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
        <LeadIdBadge leadId={current.id} className="mt-2" />
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
            setStatus("VOICEMAIL");
            queueMicrotask(() => void onNextRef.current(undefined, undefined, "VOICEMAIL"));
          }}
          onPredictiveAutoOutcome={(outcome) => {
            setStatus(outcome);
            queueMicrotask(() => void onNextRef.current(undefined, undefined, outcome));
          }}
          onUpdateLeadPhone={handleUpdateLeadPhoneFromVoip}
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
      {integrationsSyncHint && (
        <p className="shrink-0 text-xs text-stone-500" aria-live="polite">
          Synkroniserer møde til Cal/Podio…
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
          meetingCompanyName,
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
          onMeetingCompanyName: (v) => {
            setMeetingCompanyName(v);
            setMeetingContactErrors((prev) => ({ ...prev, meetingCompany: undefined }));
          },
          contactRequired: status === "MEETING_BOOKED",
          meetingContactErrors: status === "MEETING_BOOKED" ? meetingContactErrors : undefined,
        }}
        booking={{
          campaignId,
          leadId: current.id,
          calendarUserId: current.assignedUserId ?? defaultMeetingAssigneeId,
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
      </>
      ) : null}

      <MeetingNotesRequiredDialog
        open={meetingNotesRequiredOpen}
        onClose={() => setMeetingNotesRequiredOpen(false)}
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
