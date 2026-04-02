"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { LEAD_STATUSES, LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/lead-status";
import { isQueueEligibleStatus, sortLeadsForQueue } from "@/lib/lead-queue";
import { LeadDataLeftPanel } from "@/app/components/lead-data-left-panel";
import { LeadOutcomeModal } from "@/app/components/lead-outcome-modal";
import { MeetingContactFields } from "@/app/components/booking/meeting-contact-fields";
import { parseCustomFields } from "@/lib/custom-fields";
import {
  MEETING_OUTCOME_LABELS,
  MEETING_OUTCOME_PENDING,
} from "@/lib/meeting-outcome";

type Lead = {
  id: string;
  campaignId: string;
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
  campaign: { id: string; name: string; fieldConfig: string };
  lockedByUserId?: string | null;
  lockExpiresAt?: string | null;
  lockedByUser?: { name: string; username: string } | null;
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
  const [meetingOutcomeStatus, setMeetingOutcomeStatus] = useState(MEETING_OUTCOME_PENDING);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueInfo | null>(null);

  const leadWorkspaceRef = useRef<HTMLDivElement>(null);
  const [outcomeModalOpen, setOutcomeModalOpen] = useState(false);
  const [deletingLead, setDeletingLead] = useState(false);

  function setCustomKey(key: string, value: string) {
    setCustom((prev) => ({ ...prev, [key]: value }));
  }

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
      setStatus((LEAD_STATUSES as readonly string[]).includes(data.status) ? (data.status as LeadStatus) : "NEW");
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

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
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

  function openOutcomeModal() {
    setError(null);
    setOutcomeModalOpen(true);
  }

  function scrollToLeadWorkspace() {
    leadWorkspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function onOutcomeSaved(data?: Record<string, unknown>) {
    if (!data) return;
    const d = data as Lead;
    setLead(d);
    if (String(d.status).trim().toUpperCase() !== "NEW") {
      setHoldsEditLock(false);
      setEditLockBlocked(false);
      setLockBusyMessage(null);
    }
    setStatus((LEAD_STATUSES as readonly string[]).includes(d.status) ? (d.status as LeadStatus) : "NEW");
    if (d.meetingScheduledFor) {
      const dt = new Date(d.meetingScheduledFor);
      const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000);
      setMeetingScheduledFor(local.toISOString().slice(0, 16));
    } else {
      setMeetingScheduledFor("");
    }
    setMeetingContactName(d.meetingContactName ?? "");
    setMeetingContactEmail(d.meetingContactEmail ?? "");
    setMeetingContactPhonePrivate(d.meetingContactPhonePrivate ?? "");
    setMeetingOutcomeStatus(
      String(d.meetingOutcomeStatus ?? "").trim().toUpperCase() || MEETING_OUTCOME_PENDING,
    );
    router.refresh();
  }

  async function patchMeetingOutcome(o: "HELD" | "CANCELLED") {
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

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
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
        <p className="text-sm text-stone-500">Kampagne: {lead.campaign.name}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={scrollToLeadWorkspace}
            className="rounded-md border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 shadow-sm hover:bg-stone-50"
          >
            Åbn lead
          </button>
          <button
            type="button"
            disabled={editLockBlocked && !isAdmin}
            onClick={openOutcomeModal}
            className="rounded-md border border-stone-200 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 shadow-sm hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Ændre udfald
          </button>
          <button
            type="button"
            disabled={deletingLead || (editLockBlocked && !isAdmin)}
            onClick={() => void onDeleteLead()}
            className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-60"
          >
            {deletingLead ? "Sletter…" : "Slet lead"}
          </button>
          <span className="text-xs text-stone-500 sm:ml-auto">
            Udfald:{" "}
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                status === "NOT_INTERESTED"
                  ? "bg-red-100 text-red-900"
                  : status === "MEETING_BOOKED"
                    ? "bg-emerald-100 text-emerald-900"
                    : status === "VOICEMAIL"
                      ? "bg-amber-100 text-amber-950"
                      : status === "NOT_HOME"
                        ? "bg-blue-100 text-blue-950"
                        : "bg-stone-100 text-stone-800"
              }`}
            >
              {LEAD_STATUS_LABELS[status]}
            </span>
          </span>
        </div>
      </div>

      <form onSubmit={onSave} className="space-y-6">
        <fieldset
          disabled={editLockBlocked && !isAdmin}
          className="min-w-0 space-y-6 border-0 p-0 disabled:opacity-90"
        >
        <div className="flex flex-col gap-1 rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs text-stone-500">
            Gem ændringer opdaterer kundedata og noter. Udfald skifter du med <strong>Ændre udfald</strong>.
          </p>
          <button
            type="submit"
            disabled={saving || (editLockBlocked && !isAdmin)}
            className="shrink-0 rounded-md bg-stone-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-900 disabled:opacity-60"
          >
            {saving ? "Gemmer…" : "Gem ændringer"}
          </button>
        </div>

        <div
          id="lead-arbejdsvisning"
          ref={leadWorkspaceRef}
          className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6"
        >
          <div className="grid min-h-[min(70vh,36rem)] gap-8 lg:grid-cols-2 lg:gap-0">
            <div className="lg:border-r lg:border-stone-100 lg:pr-8">
              <LeadDataLeftPanel
                fieldConfigJson={lead.campaign.fieldConfig}
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
            <div className="flex min-h-[14rem] flex-col lg:min-h-0 lg:pl-8">
              <label htmlFor="notes-detail" className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Noter
              </label>
              <textarea
                id="notes-detail"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-2 min-h-[14rem] flex-1 resize-y rounded-lg border border-stone-200 bg-stone-50/50 px-3 py-3 text-sm text-stone-900 shadow-inner outline-none ring-stone-400 focus:ring-2 lg:min-h-[clamp(18rem,62vh,40rem)]"
                placeholder="Skriv noter, aftaler, opfølgning…"
              />
            </div>
          </div>
        </div>

        {status === "MEETING_BOOKED" && (
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-6 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-medium text-stone-800">Møde</h2>
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                  meetingOutcomeStatus === "HELD"
                    ? "bg-emerald-100 text-emerald-900"
                    : meetingOutcomeStatus === "CANCELLED"
                      ? "bg-red-100 text-red-900"
                      : "bg-amber-100 text-amber-950"
                }`}
              >
                {MEETING_OUTCOME_LABELS[meetingOutcomeStatus] ??
                  MEETING_OUTCOME_LABELS[MEETING_OUTCOME_PENDING]}
              </span>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-stone-600">Møde tid (dato og klokkeslæt)</label>
                <input
                  type="datetime-local"
                  required
                  value={meetingScheduledFor}
                  onChange={(e) => setMeetingScheduledFor(e.target.value)}
                  className="mt-1 w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
                />
              </div>
              {lead.meetingBookedAt && (
                <div>
                  <p className="text-xs text-stone-600">Booket den</p>
                  <p className="mt-1 text-sm text-stone-800">
                    {new Date(lead.meetingBookedAt).toLocaleString("da-DK")}
                  </p>
                </div>
              )}
              {lead.bookedByUser && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-stone-600">Booket af</p>
                  <p className="mt-1 text-sm text-stone-800">
                    {lead.bookedByUser.name} ({lead.bookedByUser.username})
                  </p>
                </div>
              )}
              <MeetingContactFields
                contactRequired
                className="sm:col-span-2 mt-2 border-stone-200 bg-white/80"
                meetingContactName={meetingContactName}
                meetingContactEmail={meetingContactEmail}
                meetingContactPhonePrivate={meetingContactPhonePrivate}
                onMeetingContactName={setMeetingContactName}
                onMeetingContactEmail={setMeetingContactEmail}
                onMeetingContactPhonePrivate={setMeetingContactPhonePrivate}
              />
            </div>
            {isAdmin && (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-stone-200 pt-4">
                <span className="text-xs font-medium text-stone-600">Admin — mødeudfald:</span>
                <button
                  type="button"
                  disabled={meetingOutcomeStatus === "HELD"}
                  onClick={() => void patchMeetingOutcome("HELD")}
                  className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Afholdt
                </button>
                <button
                  type="button"
                  disabled={meetingOutcomeStatus === "CANCELLED"}
                  onClick={() => void patchMeetingOutcome("CANCELLED")}
                  className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Annulleret
                </button>
              </div>
            )}
          </div>
        )}

        {error && !outcomeModalOpen && <p className="text-sm text-red-600">{error}</p>}
        </fieldset>
      </form>

      <LeadOutcomeModal
        open={outcomeModalOpen}
        onClose={() => setOutcomeModalOpen(false)}
        leadIds={[lead.id]}
        initialStatus={status}
        initialMeetingLocal={meetingScheduledFor}
        meetingContactSnapshot={{
          name: meetingContactName,
          email: meetingContactEmail,
          phone: meetingContactPhonePrivate,
        }}
        onSaved={onOutcomeSaved}
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
