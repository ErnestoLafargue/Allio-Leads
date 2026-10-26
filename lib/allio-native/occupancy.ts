import { prisma } from "@/lib/prisma";
import type { AllioBooking } from "@/lib/allio-native/client";
import { serializeServiceIds } from "@/lib/allio-native/service-buffers";

/** Spejl Native-bookingens start/slut (+ service_ids) til occupancy — kilde til ledig tid i Leads. */
export async function upsertNativeOccupancyFromBooking(
  booking: AllioBooking,
  status?: string,
): Promise<void> {
  if (!booking.id || !booking.start_time || !booking.end_time) return;
  const start = new Date(booking.start_time);
  const end = new Date(booking.end_time);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return;

  const resolvedStatus = String(status ?? booking.status ?? "confirmed").toLowerCase() || "confirmed";
  const serviceIds = serializeServiceIds(booking.service_ids);

  await prisma.allioNativeOccupancy.upsert({
    where: { allioBookingId: booking.id },
    create: {
      allioBookingId: booking.id,
      startDateTime: start,
      endDateTime: end,
      serviceIds,
      status: resolvedStatus,
      source: "booking",
      title: booking.customer_name ?? booking.notes ?? "",
    },
    update: {
      startDateTime: start,
      endDateTime: end,
      serviceIds,
      status: resolvedStatus,
      title: booking.customer_name ?? booking.notes ?? "",
    },
  });
}

export async function removeNativeOccupancy(bookingId: string): Promise<void> {
  await prisma.allioNativeOccupancy.deleteMany({ where: { allioBookingId: bookingId } });
}
