/**
 * Lille in-memory-erstatning for Prisma til tests af kø/lås/tilbagekald.
 * Evaluerer de samme `where`-filtre som koden sender til databasen (AND/OR/NOT, not/in/lt/lte/gt/gte,
 * relation `is`) med SQL-lignende NULL-semantik, så testene rammer de rigtige filtre — ikke kopier af dem.
 */

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const OPERATORS = new Set(["equals", "not", "in", "notIn", "lt", "lte", "gt", "gte", "is"]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !(v instanceof Date) && !Array.isArray(v);
}

function comparable(v: unknown): unknown {
  return v instanceof Date ? v.getTime() : v;
}

function same(a: unknown, b: unknown): boolean {
  return comparable(a ?? null) === comparable(b ?? null);
}

function compare(value: unknown, arg: unknown, op: "lt" | "lte" | "gt" | "gte"): boolean {
  if (value == null || arg == null) return false;
  const a = comparable(value) as number | string;
  const b = comparable(arg) as number | string;
  if (op === "lt") return a < b;
  if (op === "lte") return a <= b;
  if (op === "gt") return a > b;
  return a >= b;
}

function matchesField(value: unknown, filter: unknown): boolean {
  if (!isPlainObject(filter)) return same(value, filter);
  const keys = Object.keys(filter);
  if (keys.length === 0 || !keys.every((k) => OPERATORS.has(k))) {
    // Indlejret relationsfilter uden operator.
    return isPlainObject(value) && matchesWhere(value, filter);
  }
  for (const [op, arg] of Object.entries(filter)) {
    if (arg === undefined) continue;
    switch (op) {
      case "equals":
        if (!same(value, arg)) return false;
        break;
      case "not":
        if (isPlainObject(arg)) {
          if (matchesField(value, arg)) return false;
        } else if (arg === null) {
          if (value == null) return false;
        } else if (value == null || same(value, arg)) {
          // SQL: NULL <> 'x' er ikke sandt.
          return false;
        }
        break;
      case "in":
        if (value == null || !(arg as unknown[]).some((x) => same(value, x))) return false;
        break;
      case "notIn":
        if (value == null || (arg as unknown[]).some((x) => same(value, x))) return false;
        break;
      case "is":
        if (arg === null) {
          if (value != null) return false;
        } else if (!isPlainObject(value) || !matchesWhere(value, arg as Where)) {
          return false;
        }
        break;
      default:
        if (!compare(value, arg, op as "lt" | "lte" | "gt" | "gte")) return false;
    }
  }
  return true;
}

export function matchesWhere(row: Row, where: Where | undefined): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    if (key === "AND") {
      const parts = (Array.isArray(cond) ? cond : [cond]) as Where[];
      if (!parts.every((w) => matchesWhere(row, w))) return false;
    } else if (key === "OR") {
      if (!(cond as Where[]).some((w) => matchesWhere(row, w))) return false;
    } else if (key === "NOT") {
      const parts = (Array.isArray(cond) ? cond : [cond]) as Where[];
      if (parts.some((w) => matchesWhere(row, w))) return false;
    } else if (!matchesField(row[key], cond)) {
      return false;
    }
  }
  return true;
}

export type InMemoryLead = {
  id: string;
  campaignId: string | null;
  companyName: string;
  phone: string;
  privatePhone: string;
  notes: string;
  customFields: string;
  industry: string;
  bookingSystem: string;
  postalCode: string;
  address: string;
  status: string;
  meetingOutcomeStatus: string;
  meetingScheduledFor: Date | null;
  importedAt: Date;
  updatedAt: Date;
  lastOutcomeAt: Date | null;
  lastDialAttemptAt: Date | null;
  unansweredAttempts: number;
  powerDialerEligibleAfter: Date | null;
  voicemailMarkedAt: Date | null;
  notHomeMarkedAt: Date | null;
  dialFailoverPendingE164: string;
  lockedByUserId: string | null;
  lockedAt: Date | null;
  lockExpiresAt: Date | null;
  callbackScheduledFor: Date | null;
  callbackReservedByUserId: string | null;
  callbackCreatedByUserId: string | null;
  callbackStatus: string;
  callbackNote: string;
  callbackSeenByAssigneeAt: Date | null;
};

export function makeLead(overrides: Partial<InMemoryLead> & { id: string }): InMemoryLead {
  return {
    campaignId: "camp-1",
    companyName: `Firma ${overrides.id}`,
    phone: "+4511111111",
    privatePhone: "",
    notes: "",
    customFields: "{}",
    industry: "",
    bookingSystem: "",
    postalCode: "",
    address: "",
    status: "NEW",
    meetingOutcomeStatus: "PENDING",
    meetingScheduledFor: null,
    importedAt: new Date("2026-11-01T08:00:00.000Z"),
    updatedAt: new Date("2026-11-01T08:00:00.000Z"),
    lastOutcomeAt: null,
    lastDialAttemptAt: null,
    unansweredAttempts: 0,
    powerDialerEligibleAfter: null,
    voicemailMarkedAt: null,
    notHomeMarkedAt: null,
    dialFailoverPendingE164: "",
    lockedByUserId: null,
    lockedAt: null,
    lockExpiresAt: null,
    callbackScheduledFor: null,
    callbackReservedByUserId: null,
    callbackCreatedByUserId: null,
    callbackStatus: "PENDING",
    callbackNote: "",
    callbackSeenByAssigneeAt: null,
    ...overrides,
  };
}

export type InMemoryUser = { id: string; name: string };

export function createInMemoryLeadDb() {
  let leads: InMemoryLead[] = [];
  let users: InMemoryUser[] = [];
  const visits: Row[] = [];
  const outcomeLogs: Row[] = [];

  function withRelations(l: InMemoryLead) {
    const user = (id: string | null) => users.find((u) => u.id === id) ?? null;
    return {
      ...l,
      campaign: l.campaignId ? { id: l.campaignId, name: "Kampagne", fieldConfig: "{}" } : null,
      lockedByUser: user(l.lockedByUserId),
      callbackReservedByUser: user(l.callbackReservedByUserId),
      bookedByUser: null,
    };
  }

  const db = {
    lead: {
      async findMany(args?: { where?: Where; orderBy?: Record<string, "asc" | "desc"> }) {
        const hit = leads.filter((l) => matchesWhere(l, args?.where));
        const [key, dir] = Object.entries(args?.orderBy ?? {})[0] ?? [];
        if (key) {
          hit.sort((a, b) => {
            const x = comparable((a as Row)[key]) as number;
            const y = comparable((b as Row)[key]) as number;
            return dir === "desc" ? y - x : x - y;
          });
        }
        return hit.map(withRelations);
      },
      async findUnique(args: { where: { id: string } }) {
        const l = leads.find((x) => x.id === args.where.id);
        return l ? withRelations(l) : null;
      },
      async updateMany(args: { where: Where; data: Partial<InMemoryLead> }) {
        const hit = leads.filter((l) => matchesWhere(l, args.where));
        for (const l of hit) Object.assign(l, args.data);
        return { count: hit.length };
      },
    },
    leadOutcomeLog: {
      async createMany(args: { data: Row[] }) {
        outcomeLogs.push(...args.data);
        return { count: args.data.length };
      },
    },
    leadVisitHistory: {
      async findFirst() {
        return null;
      },
      async create(args: { data: Row }) {
        visits.push(args.data);
        return args.data;
      },
    },
    /** markCallbackSeenByAssignee — registreringen er uden betydning for låsen. */
    async $executeRaw() {
      return 0;
    },
  };

  return {
    db,
    reset(nextLeads: InMemoryLead[], nextUsers: InMemoryUser[] = []) {
      leads = nextLeads;
      users = nextUsers;
      visits.length = 0;
      outcomeLogs.length = 0;
    },
    lead(id: string): InMemoryLead {
      const l = leads.find((x) => x.id === id);
      if (!l) throw new Error(`Lead ${id} findes ikke`);
      return l;
    },
    visits,
    outcomeLogs,
  };
}

/** Delt instans til `vi.mock("@/lib/prisma", …)` i tests, der rammer den globale klient. */
export const sharedInMemoryLeadDb = createInMemoryLeadDb();
