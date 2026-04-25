import { normalizeCVR } from "@/lib/cvr-import";

const VIRK_ENDPOINT =
  process.env.VIRK_API_URL?.trim() || "https://distribution.virk.dk/cvr-permanent/virksomhed/_search";

type RoleKind = "stifter" | "direktor" | "fuldtAnsvarligPerson";

export type VirkEnrichmentResult = Partial<Record<RoleKind, string>>;

function normText(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toLowerCase();
}

function collectRoleTextsShallow(input: Record<string, unknown>, out: string[]) {
  for (const [k, v] of Object.entries(input)) {
    const key = normText(k);
    if (typeof v === "string") {
      const txt = v.trim();
      if (!txt) continue;
      if (
        key.includes("rolle") ||
        key.includes("role") ||
        key.includes("titel") ||
        key.includes("title") ||
        key.includes("egenskab") ||
        key.includes("funktion")
      ) {
        out.push(txt.toLowerCase());
      }
    }
  }
}

function extractName(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  if (Array.isArray(input)) {
    for (const item of input) {
      const n = extractName(item);
      if (n) return n;
    }
    return null;
  }

  const obj = input as Record<string, unknown>;
  const direct = [
    obj.navn,
    obj["navn"],
    obj["enhedsNavn"],
    obj["deltagerNavn"],
    obj["fuldeNavn"],
    obj["name"],
  ].find((v) => typeof v === "string" && v.trim().length > 0);
  if (typeof direct === "string") return direct.trim();

  const first = typeof obj["fornavn"] === "string" ? obj["fornavn"].trim() : "";
  const last = typeof obj["efternavn"] === "string" ? obj["efternavn"].trim() : "";
  const combined = [first, last].filter(Boolean).join(" ").trim();
  if (combined) return combined;

  const nestedKeys = [
    "deltager",
    "deltagerNavn",
    "virksomhedsdeltager",
    "deltagerInfo",
    "enhedsoplysninger",
    "navne",
    "organisation",
    "person",
    "entity",
    "participant",
  ];
  for (const key of nestedKeys) {
    if (key in obj) {
      const n = extractName(obj[key]);
      if (n) return n;
    }
  }

  for (const v of Object.values(obj)) {
    const n = extractName(v);
    if (n) return n;
  }
  return null;
}

function scoreRole(roleTexts: string[]): Partial<Record<RoleKind, number>> {
  const score: Partial<Record<RoleKind, number>> = {};
  for (const txt of roleTexts) {
    const t = txt
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[øØ]/g, "o")
      .replace(/[æÆ]/g, "ae")
      .replace(/[åÅ]/g, "aa");
    if (t.includes("stifter") || t.includes("founder")) {
      score.stifter = Math.max(score.stifter ?? 0, 100);
    }
    if (t.includes("direktor") || t.includes("director")) {
      score.direktor = Math.max(score.direktor ?? 0, 100);
    }
    if (
      t.includes("fuldt ansvarlig") ||
      t.includes("personligt ansvar") ||
      t.includes("personlig haeftelse") ||
      t.includes("personligt haeftende") ||
      /\bfad\b/.test(t)
    ) {
      score.fuldtAnsvarligPerson = Math.max(score.fuldtAnsvarligPerson ?? 0, 100);
    }
  }
  return score;
}

type Candidate = { name: string; score: Partial<Record<RoleKind, number>> };

function collectCandidates(input: unknown, out: Candidate[]) {
  if (!input || typeof input !== "object") return;
  if (Array.isArray(input)) {
    for (const item of input) collectCandidates(item, out);
    return;
  }
  const obj = input as Record<string, unknown>;
  const roleTexts: string[] = [];
  collectRoleTextsShallow(obj, roleTexts);
  const score = scoreRole(roleTexts);
  if (Object.keys(score).length > 0) {
    const name = extractName(obj);
    if (name) out.push({ name, score });
  }
  for (const v of Object.values(obj)) {
    collectCandidates(v, out);
  }
}

export function mapVirkParticipantsToLeadFields(virkPayload: unknown): VirkEnrichmentResult {
  const candidates: Candidate[] = [];
  collectCandidates(virkPayload, candidates);

  const best: Partial<Record<RoleKind, { name: string; score: number }>> = {};
  for (const candidate of candidates) {
    for (const role of ["stifter", "direktor", "fuldtAnsvarligPerson"] as const) {
      const s = candidate.score[role] ?? 0;
      if (!s) continue;
      const current = best[role];
      if (!current || s > current.score) {
        best[role] = { name: candidate.name, score: s };
      }
    }
  }

  const out: VirkEnrichmentResult = {};
  if (best.stifter?.name) out.stifter = best.stifter.name;
  if (best.direktor?.name) out.direktor = best.direktor.name;
  if (best.fuldtAnsvarligPerson?.name) out.fuldtAnsvarligPerson = best.fuldtAnsvarligPerson.name;
  return out;
}

export async function fetchVirkCompanyByCvr(rawCvr: string): Promise<unknown> {
  const cvr = normalizeCVR(rawCvr);
  if (!cvr) throw new Error("CVR-nummer mangler eller er ugyldigt");

  let auth = process.env.VIRK_API_BASIC_AUTH?.trim() || process.env.VIRK_BASIC_AUTH?.trim();
  if (!auth) throw new Error("VIRK API credentials mangler i server-miljø");
  auth = auth.replace(/^Basic\s+/i, "").trim();
  if (!auth) throw new Error("VIRK API credentials mangler i server-miljø");

  const controller = new AbortController();
  // Berig-knappen må føles responsiv i arbejdsflowet.
  // Hold kaldet kort og fail fast, så UI ikke hænger i 10-15 sekunder.
  const timeoutMs = Number(process.env.VIRK_TIMEOUT_MS || 2200);
  const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 2200);
  try {
    const t0 = Date.now();
    const res = await fetch(VIRK_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        size: 1,
        track_total_hits: false,
        _source: [
          "Vrvirksomhed.deltagerRelation",
          "deltagerRelation",
          "virksomhedsdeltager",
          "deltager",
          "rolle",
        ],
        query: {
          bool: {
            must: [{ term: { "Vrvirksomhed.cvrNummer": cvr } }],
          },
        },
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`VIRK request fejlede (${res.status})`);
    }
    const json = await res.json();
    if (process.env.NODE_ENV !== "production") {
      const elapsed = Date.now() - t0;
      const hits = Number(
        (json as { hits?: { total?: { value?: number } | number } })?.hits?.total &&
          typeof (json as { hits?: { total?: { value?: number } | number } }).hits?.total === "object"
          ? ((json as { hits?: { total?: { value?: number } } }).hits?.total?.value ?? 0)
          : ((json as { hits?: { total?: number } }).hits?.total ?? 0),
      );
      console.info(`[VIRK] lookup ok for CVR ${cvr}. hits=${hits}. elapsed_ms=${elapsed}`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}
