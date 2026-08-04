import { prisma } from "@/lib/prisma";

/** Nøgle i AppSetting for mødeblok-minutter (buffer før/efter mødestart). */
export const MEETING_BLOCK_SETTING_KEY = "meeting_block_minutes";

/** Tilladte værdier for mødeblok (minutter før og efter start). */
export const MEETING_BLOCK_OPTIONS = [55, 75] as const;

export type MeetingBlockMinutes = (typeof MEETING_BLOCK_OPTIONS)[number];

/** Standard når ingen indstilling er gemt. */
export const DEFAULT_MEETING_BLOCK_MINUTES: MeetingBlockMinutes = 55;

export function isMeetingBlockMinutes(value: unknown): value is MeetingBlockMinutes {
  return MEETING_BLOCK_OPTIONS.includes(value as MeetingBlockMinutes);
}

/** Læs aktuel mødeblok (55|75) fra DB — mangler rækken (eller er værdien ugyldig) → 55. */
export async function getMeetingBlockMinutes(): Promise<MeetingBlockMinutes> {
  const row = await prisma.appSetting.findUnique({
    where: { key: MEETING_BLOCK_SETTING_KEY },
    select: { value: true },
  });
  const parsed = row ? Number.parseInt(row.value, 10) : Number.NaN;
  return isMeetingBlockMinutes(parsed) ? parsed : DEFAULT_MEETING_BLOCK_MINUTES;
}

/** Gem mødeblok — kun 55 eller 75 er tilladt. */
export async function setMeetingBlockMinutes(minutes: MeetingBlockMinutes): Promise<void> {
  if (!isMeetingBlockMinutes(minutes)) {
    throw new Error(`Ugyldig mødeblok: ${minutes} (tilladt: ${MEETING_BLOCK_OPTIONS.join(", ")})`);
  }
  await prisma.appSetting.upsert({
    where: { key: MEETING_BLOCK_SETTING_KEY },
    update: { value: String(minutes) },
    create: { key: MEETING_BLOCK_SETTING_KEY, value: String(minutes) },
  });
}
