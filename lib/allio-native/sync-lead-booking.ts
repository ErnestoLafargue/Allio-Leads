import { prisma } from "@/lib/prisma";
import {
  allioEmployeeId,
  createBooking,
  createCustomer,
  formatAllioStartTime,
  isAllioNativeConfigured,
  listBookings,
  serviceIdForMeetingType,
  sleep,
  splitName,
  updateBooking,
  cancelBooking,
  type AllioBooking,
} from "@/lib/allio-native/client";
import { buildAllioNativeNotes, parseLeadIdFromAllioNotes } from "@/lib/allio-native/notes";
import {
  removeNativeOccupancy,
  upsertNativeOccupancyFromBooking,
} from "@/lib/allio-native/occupancy";
import {
  acquireAllioNativeSyncLock,
  releaseAllioNativeSyncLock,
} from "@/lib/allio-native/sync-lock";
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

/** Leadets aktive booking i Allio, fundet på "allio-leads:<id>" i noterne omkring mødetidspunktet. */
async function findAllioBookingForLead(leadId: string, start: Date): Promise<AllioBooking | null> {
  const bookings = await listBookings({
    from: new Date(start.getTime() - 12 * 60 * 60 * 1000).toISOString(),
    to: new Date(start.getTime() + 12 * 60 * 60 * 1000).toISOString(),
    limit: 100,
  });
  return (
    bookings.find(
      (b) =>
        parseLeadIdFromAllioNotes(b.notes) === leadId &&
        String(b.status ?? "").toLowerCase() !== "cancelled",
    ) ?? null
  );
}

/**
 * Opdatér leadets booking i Allio. Leads bestemmer, hvem der holder mødet: skifter et møde sælger, må den nye sælger
 * gerne have et andet møde på samme tid i Allio (fx mens to møder byttes om). Kender Allio ikke
 * allow_double_booking endnu, prøves igen uden.
 */
async function updateLeadBooking(
  bookingId: string,
  patch: Parameters<typeof updateBooking>[1],
): Promise<AllioBooking> {
  try {
    return await updateBooking(bookingId, { ...patch, allow_double_booking: true });
  } catch (err) {
    if (err instanceof Error && err.message.includes("allow_double_booking")) {
      return updateBooking(bookingId, patch);
    }
    throw err;
  }
}

/**
 * Opretter eller opdaterer booking i Allio-Native for et Allio-Leads-møde.
 *
 * 1) Kunde fra mødefelterne (navn/email/privat tlf + adresse + CVR), SMS=nej / E-mail=nej.
 * 2) Booking med Online- eller Fysisk-ydelse. Længden følger ydelsen i Allio (60 / 90 min); kunden er oprettet
 *    uden SMS og e-mail, så der går ingen bekræftelse ud.
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
      assignedUser: { select: { allioNativeEmployeeId: true } },
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
    // Mødet lægges i den tildelte sælgers kalender i Allio-Native (ellers standard-medarbejderen).
    const employeeId = lead.assignedUser?.allioNativeEmployeeId?.trim() || allioEmployeeId();

    if (lead.allioBookingId) {
      const updated = await updateLeadBooking(lead.allioBookingId, {
        start_time: startTime,
        notes,
        notify_customer: false,
        ...(employeeId ? { employee_id: employeeId } : {}),
      });
      await upsertNativeOccupancyFromBooking(updated).catch(() => {});
      return { customerId, bookingId: updated.id };
    }

    // Et tidligere forsøg kan have oprettet bookingen, selvom Allios gateway svarede med en fejl.
    let booking = await findAllioBookingForLead(leadId, lead.meetingScheduledFor);
    if (!booking) {
      try {
        booking = await createBooking({
          customer_id: customerId,
          service_ids: [serviceId],
          start_time: startTime,
          notes,
          employee_id: employeeId,
          allow_outside_opening_hours: true,
        });
      } catch (err) {
        if (!(err as { transient?: boolean }).transient) throw err;
        for (const wait of [2000, 4000, 6000]) {
          await sleep(wait);
          booking = await findAllioBookingForLead(leadId, lead.meetingScheduledFor);
          if (booking) break;
        }
        if (!booking) throw err;
      }
    }

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

/** Aflys bookingen i Allio, når mødet i Leads sættes til Genbook. */
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
