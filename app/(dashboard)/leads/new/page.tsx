"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LeadOutcomeStrip } from "@/app/components/lead-workspace/lead-outcome-strip";
import { LeadKundeNoterBooking } from "@/app/components/lead-workspace/lead-kunde-noter-booking";
import { validateMeetingContactFields } from "@/lib/meeting-contact-validation";
import type { LeadStatus } from "@/lib/lead-status";

type CampaignOption = { id: string; name: string };

export default function NewLeadPage() {
  const router = useRouter();
  const search = useSearchParams();
  const fromUrl = search.get("campaignId")?.trim() ?? "";
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [picked, setPicked] = useState("");
  const campaignId = fromUrl || picked;

  const [fieldConfigJson, setFieldConfigJson] = useState("{}");
  const [campaignName, setCampaignName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [cvr, setCvr] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [industry, setIndustry] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<LeadStatus>("NEW");
  const [meetingScheduledFor, setMeetingScheduledFor] = useState("");
  const [meetingBookedAt] = useState<string | null>(null);
  const [meetingContactName, setMeetingContactName] = useState("");
  const [meetingContactEmail, setMeetingContactEmail] = useState("");
  const [meetingContactPhonePrivate, setMeetingContactPhonePrivate] = useState("");
  const [meetingContactErrors, setMeetingContactErrors] = useState<{
    name?: string;
    email?: string;
    phone?: string;
  }>({});
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadCampaigns() {
      setLoadingCampaigns(true);
      const res = await fetch("/api/campaigns");
      if (!res.ok || cancelled) {
        setLoadingCampaigns(false);
        return;
      }
      const data = (await res.json()) as CampaignOption[];
      if (!cancelled) {
        setCampaigns(Array.isArray(data) ? data : []);
        setLoadingCampaigns(false);
      }
    }
    void loadCampaigns();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setPicked(fromUrl);
  }, [fromUrl]);

  useEffect(() => {
    if (!campaignId) return;
    let cancelled = false;
    async function load() {
      const res = await fetch(`/api/campaigns/${campaignId}`);
      if (!res.ok || cancelled) return;
      const c = await res.json();
      setFieldConfigJson(c.fieldConfig ?? "{}");
      setCampaignName(c.name ?? "");
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  function setCustomKey(key: string, value: string) {
    setCustom((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (!campaignId) {
      setError("Vælg en kampagne");
      return;
    }
    const trimmedCompanyName = companyName.trim();
    if (!trimmedCompanyName) {
      setError("Virksomhedsnavn er påkrævet");
      return;
    }
    if (status === "MEETING_BOOKED") {
      if (!meetingScheduledFor) {
        setError("Vælg mødedato og -tid i kalenderen.");
        return;
      }
      const contactErrors = validateMeetingContactFields(
        meetingContactName,
        meetingContactEmail,
        meetingContactPhonePrivate,
      );
      if (contactErrors) {
        setMeetingContactErrors(contactErrors);
        setError("Udfyld mødekontakt før du gemmer et booket møde.");
        return;
      }
    }
    setMeetingContactErrors({});
    setError(null);
    setLoading(true);
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId,
        companyName: trimmedCompanyName,
        phone,
        email,
        cvr,
        address,
        postalCode,
        city,
        industry,
        notes,
        meetingContactName: meetingContactName.trim(),
        meetingContactEmail: meetingContactEmail.trim(),
        meetingContactPhonePrivate: meetingContactPhonePrivate.trim(),
        status,
        meetingScheduledFor: status === "MEETING_BOOKED" ? meetingScheduledFor : null,
        customFields: custom,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Kunne ikke oprette");
      return;
    }
    router.push("/leads");
  }

  if (loadingCampaigns) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-stone-200 bg-white p-6 text-sm text-stone-600">
        Henter kampagner…
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="mx-auto max-w-lg space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
        <p>Der er ingen kampagner endnu.</p>
        <Link href="/import" className="font-medium underline-offset-2 hover:underline">
          Opret kampagne under Import
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Link href="/leads" className="text-sm text-stone-500 hover:text-stone-800">
          ← Tilbage til leads
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-stone-900">Nyt lead</h1>
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
        <label htmlFor="new-lead-campaign" className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          Kampagne
        </label>
        <select
          id="new-lead-campaign"
          value={campaignId}
          onChange={(e) => setPicked(e.target.value)}
          disabled={Boolean(fromUrl)}
          className="mt-2 w-full max-w-md rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2 disabled:bg-stone-50 disabled:text-stone-600"
          required
        >
          <option value="">— Vælg kampagne —</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {fromUrl && (
          <p className="mt-2 text-xs text-stone-500">
            Kampagne er låst via link.{" "}
            <Link href="/leads/new" className="font-medium text-stone-700 underline-offset-2 hover:underline">
              Vælg en anden
            </Link>
          </p>
        )}
        {campaignName && <p className="mt-2 text-sm text-stone-500">{campaignName}</p>}
      </div>

      {!campaignId ? (
        <p className="text-sm text-stone-600">Vælg hvilket kampagne leadet skal oprettes under.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <LeadOutcomeStrip
            status={status}
            onStatusChange={(nextStatus) => {
              setStatus(nextStatus);
              if (nextStatus !== "MEETING_BOOKED") {
                setMeetingContactErrors({});
              }
            }}
            meetingBookedAt={meetingBookedAt}
            bookedByUser={null}
            rightColumn={
              <button
                type="submit"
                disabled={loading}
                className="rounded-md bg-stone-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-900 disabled:opacity-60"
              >
                {loading ? "Gemmer…" : "Gem lead"}
              </button>
            }
          />
          <LeadKundeNoterBooking
            gridKey={`new-lead-${campaignId}`}
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
              initialMeetingLocal: status === "MEETING_BOOKED" ? meetingScheduledFor || undefined : undefined,
              isSubmitting: loading,
              allowMeetingConfirm: status === "MEETING_BOOKED",
              onConfirmBooking: async (detail) => {
                setMeetingScheduledFor(detail.localDateTimeISO);
                setStatus("MEETING_BOOKED");
                setError(null);
              },
            }}
          />
          {error && <p className="mt-6 text-sm text-red-600">{error}</p>}
        </form>
      )}
    </div>
  );
}
