import { leadDomainFromCustomFields } from "@/lib/custom-fields";
import { normalizeCVR } from "@/lib/cvr-import";
import { normalizePhone } from "@/lib/normalize-phone";

export type DuplicateLeadInput = {
  id: string;
  companyName: string;
  customFields?: string | null;
  cvr: string;
  phone: string;
  status: string;
  importedAt: Date | string;
  lastOutcomeAt: Date | string | null;
  campaign?: { id: string; name: string } | null;
};

export type DuplicateLeadRow = {
  id: string;
  companyName: string;
  domain: string;
  cvr: string;
  phone: string;
  status: string;
  importedAt: string;
  lastOutcomeAt: string | null;
  campaignId: string | null;
  campaignName: string | null;
};

export type DuplicateGroup = {
  id: string;
  matchKind: "cvr" | "phone" | "mixed";
  matchLabel: string;
  leads: DuplicateLeadRow[];
};

export type DuplicateGroupsResult = {
  groupCount: number;
  duplicateLeadCount: number;
  groups: DuplicateGroup[];
};

class UnionFind {
  private parent = new Map<string, string>();

  add(id: string) {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }

  find(id: string): string {
    let root = id;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    let cur = id;
    while (cur !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }

  groups(): Map<string, string[]> {
    const out = new Map<string, string[]>();
    for (const id of this.parent.keys()) {
      const root = this.find(id);
      if (!out.has(root)) out.set(root, []);
      out.get(root)!.push(id);
    }
    return out;
  }
}

function toRow(lead: DuplicateLeadInput): DuplicateLeadRow {
  return {
    id: lead.id,
    companyName: lead.companyName,
    domain: leadDomainFromCustomFields(lead.customFields),
    cvr: lead.cvr,
    phone: lead.phone,
    status: lead.status,
    importedAt:
      lead.importedAt instanceof Date ? lead.importedAt.toISOString() : String(lead.importedAt),
    lastOutcomeAt: lead.lastOutcomeAt
      ? lead.lastOutcomeAt instanceof Date
        ? lead.lastOutcomeAt.toISOString()
        : String(lead.lastOutcomeAt)
      : null,
    campaignId: lead.campaign?.id ?? null,
    campaignName: lead.campaign?.name ?? null,
  };
}

/** Vis grupper hvor mindst ét lead ligger i en valgt kampagne (hele gruppen vises). */
export function filterDuplicateGroupsByCampaigns(
  groups: DuplicateGroup[],
  selectedCampaignIds: ReadonlySet<string>,
): DuplicateGroup[] {
  if (selectedCampaignIds.size === 0) return groups;
  return groups.filter((g) =>
    g.leads.some((l) => l.campaignId != null && selectedCampaignIds.has(l.campaignId)),
  );
}

function groupMatchMeta(
  leadIds: string[],
  byId: Map<string, DuplicateLeadInput>,
  cvrBuckets: Map<string, string[]>,
  phoneBuckets: Map<string, string[]>,
): { matchKind: "cvr" | "phone" | "mixed"; matchLabel: string } {
  const cvrKeys = new Set<string>();
  const phoneKeys = new Set<string>();

  for (const id of leadIds) {
    const cvr = normalizeCVR(byId.get(id)?.cvr);
    if (cvr) cvrKeys.add(cvr);
    const phone = normalizePhone(byId.get(id)?.phone);
    if (phone) phoneKeys.add(phone);
  }

  let sharedCvr: string | null = null;
  for (const [cvr, ids] of cvrBuckets) {
    const inGroup = ids.filter((i) => leadIds.includes(i));
    if (inGroup.length >= 2) {
      sharedCvr = cvr;
      break;
    }
  }

  let sharedPhone: string | null = null;
  for (const [phone, ids] of phoneBuckets) {
    const inGroup = ids.filter((i) => leadIds.includes(i));
    if (inGroup.length >= 2) {
      sharedPhone = phone;
      break;
    }
  }

  if (sharedCvr && sharedPhone) {
    return {
      matchKind: "mixed",
      matchLabel: `CVR: ${sharedCvr} · Telefon: ${sharedPhone}`,
    };
  }
  if (sharedCvr) {
    return { matchKind: "cvr", matchLabel: `CVR: ${sharedCvr}` };
  }
  if (sharedPhone) {
    return { matchKind: "phone", matchLabel: `Telefon: ${sharedPhone}` };
  }
  if (cvrKeys.size === 1 && phoneKeys.size <= 1) {
    const c = [...cvrKeys][0];
    return { matchKind: "cvr", matchLabel: `CVR: ${c}` };
  }
  if (phoneKeys.size === 1 && cvrKeys.size <= 1) {
    const p = [...phoneKeys][0];
    return { matchKind: "phone", matchLabel: `Telefon: ${p}` };
  }
  return { matchKind: "mixed", matchLabel: "Flere match-nøgler" };
}

export function buildDuplicateGroups(leads: DuplicateLeadInput[]): DuplicateGroupsResult {
  const byId = new Map(leads.map((l) => [l.id, l]));
  const uf = new UnionFind();
  const cvrBuckets = new Map<string, string[]>();
  const phoneBuckets = new Map<string, string[]>();

  for (const lead of leads) {
    uf.add(lead.id);
    const cvr = normalizeCVR(lead.cvr);
    if (cvr) {
      if (!cvrBuckets.has(cvr)) cvrBuckets.set(cvr, []);
      cvrBuckets.get(cvr)!.push(lead.id);
    }
    const phone = normalizePhone(lead.phone);
    if (phone) {
      if (!phoneBuckets.has(phone)) phoneBuckets.set(phone, []);
      phoneBuckets.get(phone)!.push(lead.id);
    }
  }

  function unionBucket(ids: string[]) {
    if (ids.length < 2) return;
    const [first, ...rest] = ids;
    for (const id of rest) uf.union(first, id);
  }

  for (const ids of cvrBuckets.values()) unionBucket(ids);
  for (const ids of phoneBuckets.values()) unionBucket(ids);

  const components = [...uf.groups().entries()].filter(([, ids]) => ids.length >= 2);

  const groups: DuplicateGroup[] = components
    .map(([root, ids], index) => {
      const sortedIds = [...ids].sort((a, b) => {
        const ta = new Date(byId.get(a)!.importedAt).getTime();
        const tb = new Date(byId.get(b)!.importedAt).getTime();
        return ta - tb;
      });
      const meta = groupMatchMeta(sortedIds, byId, cvrBuckets, phoneBuckets);
      return {
        id: `dup-${root.slice(0, 8)}-${index}`,
        matchKind: meta.matchKind,
        matchLabel: meta.matchLabel,
        leads: sortedIds.map((id) => toRow(byId.get(id)!)),
      };
    })
    .sort((a, b) => a.leads[0].companyName.localeCompare(b.leads[0].companyName, "da"));

  const duplicateLeadIds = new Set<string>();
  for (const g of groups) {
    for (const l of g.leads) duplicateLeadIds.add(l.id);
  }

  return {
    groupCount: groups.length,
    duplicateLeadCount: duplicateLeadIds.size,
    groups,
  };
}
