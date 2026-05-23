/**
 * Lead navigation context: where a lead was opened from (return path + queue mode).
 * New list pages should use KNOWN_LEAD_SOURCES + buildLeadDetailHref / buildCampaignArbejdHref.
 */

export type LeadOpenSource =
  | "dialer"
  | "campaign"
  | "leads"
  | "mine-salg"
  | "meetings-upcoming"
  | "meetings-past"
  | "meetings-new"
  | "callbacks"
  | "history"
  | "recordings"
  | string;

export type LeadOpenedFrom = {
  path: string;
  label?: string;
  source?: LeadOpenSource;
};

export const LEAD_NAV_FALLBACK_PATH = "/leads";

export const KNOWN_LEAD_SOURCES = {
  leads: { source: "leads" as const, path: "/leads", label: "Leads" },
  recordings: { source: "recordings" as const, path: "/leads/lydfiler", label: "Lydfiler" },
  mineSalg: { source: "mine-salg" as const, path: "/mine-salg", label: "Mine salg" },
  meetingsUpcoming: {
    source: "meetings-upcoming" as const,
    path: "/meetings/upcoming",
    label: "Kommende møder",
  },
  meetingsPast: { source: "meetings-past" as const, path: "/meetings/past", label: "Tidligere møder" },
  meetingsNew: { source: "meetings-new" as const, path: "/meetings/new", label: "Nyt møde" },
  leadsDuplicates: {
    source: "leads-duplicates" as const,
    path: "/leads/duplicates",
    label: "Dubletter",
  },
  callbacks: { source: "callbacks" as const, path: "/tilbagekald-kalender", label: "Tilbagekald" },
  history: { source: "history" as const, path: "/historik", label: "Historik" },
  kampagner: { source: "campaign" as const, path: "/kampagner", label: "Kampagner" },
} satisfies Record<string, LeadOpenedFrom & { source: LeadOpenSource }>;

/** True when lead is opened in dialer / campaign queue (arbejd), not standalone detail. */
export function isQueueMode(source: string | undefined | null): boolean {
  const s = String(source ?? "").trim().toLowerCase();
  return s === "campaign" || s === "dialer";
}

/** Validates internal app paths only (open-redirect safe). */
export function sanitizeReturnPath(raw: string | null | undefined): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed.startsWith("/")) return LEAD_NAV_FALLBACK_PATH;
  if (trimmed.includes("://") || trimmed.startsWith("//")) return LEAD_NAV_FALLBACK_PATH;
  if (trimmed.includes("..")) return LEAD_NAV_FALLBACK_PATH;
  return trimmed;
}

export function buildLeadNavigationQuery(openedFrom: LeadOpenedFrom): string {
  const params = new URLSearchParams();
  params.set("from", sanitizeReturnPath(openedFrom.path));
  if (openedFrom.source?.trim()) params.set("source", openedFrom.source.trim());
  if (openedFrom.label?.trim()) params.set("fromLabel", openedFrom.label.trim());
  return params.toString();
}

export function buildLeadDetailHref(leadId: string, openedFrom: LeadOpenedFrom): string {
  const q = buildLeadNavigationQuery(openedFrom);
  return `/leads/${encodeURIComponent(leadId)}?${q}`;
}

export type BuildCampaignArbejdOpts = {
  openedFrom: LeadOpenedFrom;
  leadId?: string;
  voipSession?: boolean;
};

export function buildCampaignArbejdHref(campaignId: string, opts: BuildCampaignArbejdOpts): string {
  const params = new URLSearchParams();
  params.set("from", sanitizeReturnPath(opts.openedFrom.path));
  if (opts.openedFrom.source?.trim()) params.set("source", opts.openedFrom.source.trim());
  if (opts.openedFrom.label?.trim()) params.set("fromLabel", opts.openedFrom.label.trim());
  if (opts.leadId?.trim()) params.set("leadId", opts.leadId.trim());
  if (opts.voipSession) params.set("voipSession", "1");
  const qs = params.toString();
  return `/kampagner/${encodeURIComponent(campaignId)}/arbejd${qs ? `?${qs}` : ""}`;
}

export type ParsedLeadNavigation = {
  openedFrom: LeadOpenedFrom;
  isQueueMode: boolean;
  /** Suffix for prev/next links, e.g. `?from=...&source=...` */
  querySuffix: string;
  /** Campaign id when browsing queue on lead detail (legacy + new). */
  queueCampaignId: string | null;
};

type SearchParamsLike = {
  get(name: string): string | null;
};

function readSearchParam(sp: SearchParamsLike, name: string): string {
  return sp.get(name)?.trim() ?? "";
}

/** Parse navigation context from URL search params (lead detail or arbejd). */
export function parseLeadNavigation(
  searchParams: SearchParamsLike,
  options?: { campaignIdForLegacy?: string; defaultPath?: string },
): ParsedLeadNavigation {
  const legacyCampaignId = readSearchParam(searchParams, "fromCampaign");
  const fromRaw = readSearchParam(searchParams, "from");
  const source = readSearchParam(searchParams, "source");
  const fromLabel = readSearchParam(searchParams, "fromLabel");

  let path = fromRaw
    ? sanitizeReturnPath(fromRaw)
    : options?.defaultPath
      ? sanitizeReturnPath(options.defaultPath)
      : LEAD_NAV_FALLBACK_PATH;
  let resolvedSource = source;
  let queueCampaignId: string | null = null;

  if (!fromRaw && legacyCampaignId) {
    queueCampaignId = legacyCampaignId;
    path = `/kampagner/${encodeURIComponent(legacyCampaignId)}`;
    if (!resolvedSource) resolvedSource = "campaign";
  }

  if (options?.campaignIdForLegacy && !queueCampaignId && resolvedSource === "campaign") {
    queueCampaignId = options.campaignIdForLegacy;
  }

  const campaignPathMatch = path.match(/^\/kampagner\/([^/]+)$/);
  if (!queueCampaignId && campaignPathMatch && resolvedSource === "campaign") {
    queueCampaignId = decodeURIComponent(campaignPathMatch[1]!);
  }

  const openedFrom: LeadOpenedFrom = {
    path,
    ...(fromLabel ? { label: fromLabel } : {}),
    ...(resolvedSource ? { source: resolvedSource } : {}),
  };

  const q = buildLeadNavigationQuery(openedFrom);
  const extraLegacy =
    queueCampaignId && !fromRaw
      ? `fromCampaign=${encodeURIComponent(queueCampaignId)}`
      : "";
  const querySuffix =
    extraLegacy && q ? `?${q}&${extraLegacy}` : extraLegacy ? `?${extraLegacy}` : q ? `?${q}` : "";

  return {
    openedFrom,
    isQueueMode: isQueueMode(resolvedSource),
    querySuffix,
    queueCampaignId,
  };
}

export function campaignDetailOpenedFrom(campaignId: string): LeadOpenedFrom {
  return {
    path: `/kampagner/${campaignId}`,
    source: "campaign",
    label: "Kampagne",
  };
}

/** Return path for dubletvisning under Leads. */
export function leadsDuplicatesOpenedFrom(): LeadOpenedFrom {
  return { ...KNOWN_LEAD_SOURCES.leadsDuplicates };
}

/** Return path for Kommende møder (liste eller kalender med uge). */
export function meetingsUpcomingOpenedFrom(opts?: {
  view?: "list" | "calendar";
  weekStart?: string;
}): LeadOpenedFrom {
  const params = new URLSearchParams();
  if (opts?.view === "calendar") params.set("view", "calendar");
  if (opts?.weekStart?.trim()) params.set("weekStart", opts.weekStart.trim());
  const qs = params.toString();
  return {
    ...KNOWN_LEAD_SOURCES.meetingsUpcoming,
    path: `/meetings/upcoming${qs ? `?${qs}` : ""}`,
  };
}
