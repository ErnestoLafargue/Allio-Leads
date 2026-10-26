import { prisma } from "@/lib/prisma";
import {
  allioEmployeeId,
  createBooking,
  createCustomer,
  formatAllioStartTime,
  isAllioNativeConfigured,
  serviceIdForMeetingType,
  splitName,
  updateBooking,
  cancelBooking,
} from "@/lib/allio-native/client";
import { buildAllioNativeNotes } from "@/lib/allio-native/notes";
import {
  removeNativeOccupancy,
  upsertNativeOccupancyFromBooking,
} from "@/lib/allio-native/occupancy";
import {
  acquireAllioNativeSyncLock,
  releaseAllioNativeSyncLock,
} from "@/lib/allio-native/sync-lock";
import { meetingDurationMinutes } from "@/lib/booking/meeting-type-buffers";
import {
  MEETING_TYPE_PHYSICAL,
  normalizeMeetingType,
} from "@/lib/meeting-type";

export type EnsureAllioNativeBookingResult = {
  skipped?: boolean;
  customerId?: string;
  bookingId?: string;
};

function resolveCustomerAddress(lead: {
  meetingType: string;
  meetingAddress: string;
  address: string;
}): string | undefined {
  const meetingAddr = lead.meetingAddress.trim();
  const companyAddr = lead.address.trim();
  if (normalizeMeetingType(lead.meetingType) === MEETING_TYPE_PHYSICAL) {
    return meetingAddr || companyAddr || undefined;
  }
  return companyAddr || meetingAddr || undefined;
}

/**
 * Opretter eller opdaterer booking i Allio-Native for et Allio-Leads-møde.
 *
 * 1) Kunde fra mødefelterne (navn/email/privat tlf + adresse + CVR), SMS=nej / E-mail=nej.
 * 2) Booking med Online- eller Fysisk-ydelse — uden kunde-notifikation.
 *
 * Kaster ved fejl — kaldere behandler ikke-fatalt.
 */
export async function ensureAllioNativeBookingForLead(
  leadId: string,
): Promise<EnsureAllioNativeBookingResult> {
  if (!isAllioNativeConfigured()) {
    return { skipped: true };
  }

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      status: true,
      meetingScheduledFor: true,
      meetingContactName: true,
      meetingContactEmail: true,
      meetingContactPhonePrivate: true,
      meetingType: true,
      meetingAddress: true,
      meetingCompanyName: true,
      address: true,
      cvr: true,
      allioCustomerId: true,
      allioBookingId: true,
    },
  });
  if (!lead || lead.status !== "MEETING_BOOKED") return { skipped: true };
  if (!lead.meetingScheduledFor || !lead.meetingContactName || !lead.meetingContactEmail) {
    return { skipped: true };
  }

  const meetingType = normalizeMeetingType(lead.meetingType);
  const serviceId = serviceIdForMeetingType(meetingType);
  if (!serviceId) {
    throw new Error(
      `Allio-Native service-id mangler for ${meetingType} (ALLIO_SERVICE_ID_ONLINE / ALLIO_SERVICE_ID_PHYSICAL)`,
    );
  }

  const locked = await acquireAllioNativeSyncLock(leadId);
  if (!locked) {
    console.log(`[allio-native] lead=${leadId} sync lock held — skip`);
    return { skipped: true };
  }

  try {
    let customerId = lead.allioCustomerId ?? undefined;
    if (!customerId) {
      const { first_name, last_name } = splitName(lead.meetingContactName);
      const customer = await createCustomer({
        first_name,
        last_name,
        email: lead.meetingContactEmail.trim(),
        phone: lead.meetingContactPhonePrivate.trim() || undefined,
        address: resolveCustomerAddress(lead),
        cvr: lead.cvr.trim() || undefined,
      });
      customerId = customer.id;
      await prisma.lead.update({
        where: { id: leadId },
        data: { allioCustomerId: customerId },
      });
    }

    const startTime = formatAllioStartTime(lead.meetingScheduledFor);
    const durationMinutes = meetingDurationMinutes(meetingType);
    const customerAddress = resolveCustomerAddress(lead);
    const notes = buildAllioNativeNotes(
      leadId,
      [
        lead.meetingCompanyName?.trim() ? `Virksomhed: ${lead.meetingCompanyName.trim()}` : "",
        lead.cvr.trim() ? `CVR: ${lead.cvr.trim()}` : "",
        customerAddress ? `Adresse: ${customerAddress}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
    const employeeId = allioEmployeeId();

    if (lead.allioBookingId) {
      const updated = await updateBooking(lead.allioBookingId, {
        start_time: startTime,
        duration_minutes: durationMinutes,
        notes,
        notify_customer: false,
        ...(employeeId ? { employee_id: employeeId } : {}),
      });
      await upsertNativeOccupancyFromBooking(updated).catch(() => {});
      return { customerId, bookingId: updated.id };
    }

    const booking = await createBooking({
      customer_id: customerId,
      service_ids: [serviceId],
      start_time: startTime,
      duration_minutes: durationMinutes,
      notes,
      employee_id: employeeId,
      allow_outside_opening_hours: true,
      // Undgå bekræftelses-SMS/mail ved oprettelse; follow-ups/påmindelser følger stadig Native.
      notify_customer: false,
    });

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        allioBookingId: booking.id,
        allioCustomerId: customerId,
      },
    });
    await upsertNativeOccupancyFromBooking(booking).catch(() => {});

    return { customerId, bookingId: booking.id };
  } finally {
    await releaseAllioNativeSyncLock(leadId);
  }
}

/** Aflys Native-booking når Allio-Leads møde aflyses/genbookes. */
export async function cancelAllioNativeBookingForLead(leadId: string): Promise<void> {
  if (!isAllioNativeConfigured()) return;
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { allioBookingId: true },
  });
  if (!lead?.allioBookingId) return;

  const locked = await acquireAllioNativeSyncLock(leadId);
  try {
    const bookingId = lead.allioBookingId;
    await cancelBooking(bookingId);
    await removeNativeOccupancy(bookingId).catch(() => {});
    await prisma.lead.update({
      where: { id: leadId },
      data: { allioBookingId: null },
    });
  } finally {
    if (locked) await releaseAllioNativeSyncLock(leadId);
  }
}
