/**
 * Browser-til-browser Medlyt: WebRTC-signalering (admin ↔ sælger).
 * Admin lytter til sælgerens mic hele tiden; kunde-lyd blandes ind når der er remote.
 */

import { prisma } from "@/lib/prisma";
import { PRESENCE_FRESH_WINDOW_MS } from "@/lib/dialer-shared";
import { normalizeMedlytSdp } from "@/lib/medlyt-webrtc";

const ACTIVE = ["requested", "negotiating", "live"] as const;

/** ICE-kandidat (browser RTCIceCandidateInit-form). */
export type MedlytIceCandidate = {
  candidate?: string | null;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
};

export type MedlytListenSessionRow = {
  id: string;
  adminUserId: string;
  targetUserId: string;
  status: string;
  offerSdp: string | null;
  answerSdp: string | null;
  adminIceJson: string | null;
  sellerIceJson: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function parseIce(json: string | null): MedlytIceCandidate[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? (parsed as MedlytIceCandidate[]) : [];
  } catch {
    return [];
  }
}

function serializeIce(cands: MedlytIceCandidate[]): string {
  return JSON.stringify(cands.slice(-80));
}

/** Afslut andre aktive sessioner for samme admin/target, så der kun er én ad gangen. */
async function endOverlapping(params: {
  adminUserId?: string;
  targetUserId?: string;
  exceptId?: string;
}) {
  const where: {
    status: { in: string[] };
    id?: { not: string };
    OR?: Array<{ adminUserId: string } | { targetUserId: string }>;
  } = { status: { in: [...ACTIVE] } };
  if (params.exceptId) where.id = { not: params.exceptId };
  const or: Array<{ adminUserId: string } | { targetUserId: string }> = [];
  if (params.adminUserId) or.push({ adminUserId: params.adminUserId });
  if (params.targetUserId) or.push({ targetUserId: params.targetUserId });
  if (or.length) where.OR = or;
  await prisma.medlytListenSession.updateMany({
    where,
    data: { status: "ended" },
  });
}

export async function createMedlytListenSession(params: {
  adminUserId: string;
  targetUserId: string;
}): Promise<
  | { ok: true; session: MedlytListenSessionRow }
  | { ok: false; status: number; error: string }
> {
  const freshAfter = new Date(Date.now() - PRESENCE_FRESH_WINDOW_MS);
  const target = await prisma.agentSession.findFirst({
    where: {
      userId: params.targetUserId,
      lastHeartbeat: { gte: freshAfter },
      status: { in: ["ready", "ringing", "talking", "wrap_up", "draining", "paused"] },
    },
    select: { userId: true },
  });
  if (!target) {
    return {
      ok: false,
      status: 409,
      error: "Sælgeren er ikke aktiv i dialeren lige nu.",
    };
  }

  await endOverlapping({
    adminUserId: params.adminUserId,
    targetUserId: params.targetUserId,
  });

  const session = await prisma.medlytListenSession.create({
    data: {
      adminUserId: params.adminUserId,
      targetUserId: params.targetUserId,
      status: "requested",
    },
  });
  return { ok: true, session };
}

export async function getMedlytListenSession(
  id: string,
): Promise<MedlytListenSessionRow | null> {
  return prisma.medlytListenSession.findUnique({ where: { id } });
}

export async function listPendingMedlytListenForSeller(
  targetUserId: string,
): Promise<MedlytListenSessionRow[]> {
  return prisma.medlytListenSession.findMany({
    where: {
      targetUserId,
      status: { in: [...ACTIVE] },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
}

export async function setMedlytListenOffer(params: {
  id: string;
  adminUserId: string;
  offerSdp: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const s = await prisma.medlytListenSession.findUnique({ where: { id: params.id } });
  if (!s || s.adminUserId !== params.adminUserId) {
    return { ok: false, status: 404, error: "Session ikke fundet." };
  }
  if (s.status === "ended") {
    return { ok: false, status: 409, error: "Session er afsluttet." };
  }
  await prisma.medlytListenSession.update({
    where: { id: params.id },
    data: { offerSdp: normalizeMedlytSdp(params.offerSdp), status: "negotiating" },
  });
  return { ok: true };
}

export async function setMedlytListenAnswer(params: {
  id: string;
  targetUserId: string;
  answerSdp: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const s = await prisma.medlytListenSession.findUnique({ where: { id: params.id } });
  if (!s || s.targetUserId !== params.targetUserId) {
    return { ok: false, status: 404, error: "Session ikke fundet." };
  }
  if (s.status === "ended") {
    return { ok: false, status: 409, error: "Session er afsluttet." };
  }
  await prisma.medlytListenSession.update({
    where: { id: params.id },
    data: { answerSdp: normalizeMedlytSdp(params.answerSdp), status: "live" },
  });
  return { ok: true };
}

export async function appendMedlytListenIce(params: {
  id: string;
  userId: string;
  role: "admin" | "seller";
  candidate: MedlytIceCandidate;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const s = await prisma.medlytListenSession.findUnique({ where: { id: params.id } });
  if (!s) return { ok: false, status: 404, error: "Session ikke fundet." };
  if (params.role === "admin" && s.adminUserId !== params.userId) {
    return { ok: false, status: 403, error: "Ikke din session." };
  }
  if (params.role === "seller" && s.targetUserId !== params.userId) {
    return { ok: false, status: 403, error: "Ikke din session." };
  }
  if (s.status === "ended") {
    return { ok: false, status: 409, error: "Session er afsluttet." };
  }
  const field = params.role === "admin" ? "adminIceJson" : "sellerIceJson";
  const existing = parseIce(params.role === "admin" ? s.adminIceJson : s.sellerIceJson);
  existing.push(params.candidate);
  await prisma.medlytListenSession.update({
    where: { id: params.id },
    data: { [field]: serializeIce(existing) },
  });
  return { ok: true };
}

export async function endMedlytListenSession(params: {
  id: string;
  userId: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const s = await prisma.medlytListenSession.findUnique({ where: { id: params.id } });
  if (!s) return { ok: false, status: 404, error: "Session ikke fundet." };
  if (s.adminUserId !== params.userId && s.targetUserId !== params.userId) {
    return { ok: false, status: 403, error: "Ikke din session." };
  }
  await prisma.medlytListenSession.update({
    where: { id: params.id },
    data: { status: "ended" },
  });
  return { ok: true };
}

export function iceCandidatesFromJson(json: string | null): MedlytIceCandidate[] {
  return parseIce(json);
}
