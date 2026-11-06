import { prisma } from "@/lib/prisma";
import {
  BOOKING_SETTINGS_KEY,
  parseBookingSettings,
  type BookingSettings,
} from "@/lib/booking/booking-settings";

export async function getBookingSettings(): Promise<BookingSettings> {
  const row = await prisma.appSetting.findUnique({
    where: { key: BOOKING_SETTINGS_KEY },
    select: { value: true },
  });
  if (!row) return parseBookingSettings(null);
  try {
    return parseBookingSettings(JSON.parse(row.value));
  } catch {
    return parseBookingSettings(null);
  }
}

export async function saveBookingSettings(input: unknown): Promise<BookingSettings> {
  const settings = parseBookingSettings(input);
  const value = JSON.stringify(settings);
  await prisma.appSetting.upsert({
    where: { key: BOOKING_SETTINGS_KEY },
    update: { value },
    create: { key: BOOKING_SETTINGS_KEY, value },
  });
  return settings;
}
