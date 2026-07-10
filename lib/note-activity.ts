import type { Prisma } from "@prisma/client";
import { LEAD_ACTIVITY_KIND } from "@/lib/lead-activity-kinds";

/** Varighed af en note-redigeringssession (samme bruger + lead). */
export const NOTE_SESSION_WINDOW_MS = 60 * 60 * 1000;

export type NoteDiff = {
  added: string;
  removed: string;
};

/**
 * Simpel diff for fritekstnoter: fælles præfiks + suffiks, midten er ændringen.
 */
export function computeNoteDiff(prev: string, next: string): NoteDiff {
  const a = prev;
  const b = next;
  if (a === b) {
    return { added: "", removed: "" };
  }

  let prefixLen = 0;
  const minLen = Math.min(a.length, b.length);
  while (prefixLen < minLen && a[prefixLen] === b[prefixLen]) {
    prefixLen += 1;
  }

  let suffixLen = 0;
  while (
    suffixLen < minLen - prefixLen &&
    a[a.length - 1 - suffixLen] === b[b.length - 1 - suffixLen]
  ) {
    suffixLen += 1;
  }

  const removed = a.slice(prefixLen, a.length - suffixLen);
  const added = b.slice(prefixLen, b.length - suffixLen);
  return { added, removed };
}

export function buildNoteUpdateSummary(userLabel: string, diff: NoteDiff): string {
  const label = userLabel.trim() || "Bruger";
  if (diff.removed && diff.added) {
    return `${label} ændrede i noterne`;
  }
  if (diff.removed) {
    return `${label} fjernede fra noterne`;
  }
  return `${label} tilføjede til noter`;
}

function normalizeNoteFields(diff: NoteDiff, baseline: string) {
  const noteAdded = diff.added.trim() ? diff.added : null;
  const noteRemoved = diff.removed.trim() ? diff.removed : null;
  const noteBaseline = baseline;
  return { noteBaseline, noteAdded, noteRemoved };
}

type Tx = Prisma.TransactionClient;

export type LogNoteUpdateSessionArgs = {
  leadId: string;
  userId: string;
  userLabel: string;
  prevNotes: string;
  nextNotes: string;
};

/**
 * Logger noteændringer som journal: én post pr. bruger-session (1 time).
 * Genberegner diff fra sessionens baseline ved efterfølgende gem i samme vindue.
 */
export async function logNoteUpdateSession(
  tx: Tx,
  { leadId, userId, userLabel, prevNotes, nextNotes }: LogNoteUpdateSessionArgs,
): Promise<void> {
  const prev = String(prevNotes ?? "");
  const next = String(nextNotes ?? "");
  if (prev === next) return;

  const sessionSince = new Date(Date.now() - NOTE_SESSION_WINDOW_MS);

  const existing = await tx.leadActivityEvent.findFirst({
    where: {
      leadId,
      userId,
      kind: LEAD_ACTIVITY_KIND.NOTE_UPDATE,
      createdAt: { gte: sessionSince },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      noteBaseline: true,
    },
  });

  if (existing) {
    const baseline = existing.noteBaseline ?? prev;
    const diff = computeNoteDiff(baseline, next);

    if (!diff.added && !diff.removed) {
      await tx.leadActivityEvent.delete({ where: { id: existing.id } });
      return;
    }

    const fields = normalizeNoteFields(diff, baseline);
    await tx.leadActivityEvent.update({
      where: { id: existing.id },
      data: {
        summary: buildNoteUpdateSummary(userLabel, diff),
        ...fields,
      },
    });
    return;
  }

  const diff = computeNoteDiff(prev, next);
  if (!diff.added && !diff.removed) return;

  const fields = normalizeNoteFields(diff, prev);
  await tx.leadActivityEvent.create({
    data: {
      leadId,
      userId,
      kind: LEAD_ACTIVITY_KIND.NOTE_UPDATE,
      summary: buildNoteUpdateSummary(userLabel, diff),
      ...fields,
    },
  });
}
