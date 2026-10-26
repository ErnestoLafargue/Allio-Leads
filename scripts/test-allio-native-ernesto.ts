/**
 * Lokal smoke-test af Allio-Native booking-sync — KUN Ernesto Frank Lafargue (SMS=nej).
 *
 * Kører: create (Online) → update (notify_customer:false) → cancel.
 * Bruger Ernesto's eksisterende booking-kunde-id (CRM createCustomer virker ikke til bookinger).
 *
 * Usage (fra repo-rod, med .env.local):
 *   npx tsx scripts/test-allio-native-ernesto.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import {
  cancelBooking,
  createBooking,
  createCustomer,
  formatAllioStartTime,
  getBooking,
  isAllioNativeConfigured,
  serviceIdForMeetingType,
  updateBooking,
  allioEmployeeId,
} from "../lib/allio-native/client";
import { buildAllioNativeNotes } from "../lib/allio-native/notes";

const ERNESTO_CUSTOMER_ID = "1d8e68bb-6dd8-4e03-ac0a-51bdc99dc3bf";

async function smokeMeetingType(type: "ONLINE" | "PHYSICAL", startIso: string, moveIso: string) {
  const serviceId = serviceIdForMeetingType(type);
  console.log(`\n=== ${type} (${serviceId}) ===`);

  const created = await createBooking({
    customer_id: ERNESTO_CUSTOMER_ID,
    service_ids: [serviceId],
    start_time: formatAllioStartTime(new Date(startIso)),
    employee_id: allioEmployeeId(),
    notes: buildAllioNativeNotes(`local-test-${type.toLowerCase()}`, "Ernesto SMS=nej"),
    allow_outside_opening_hours: true,
  });
  console.log("CREATE", {
    id: created.id,
    duration_minutes: created.duration_minutes,
    total_price_cents: created.total_price_cents,
    start_time: created.start_time,
  });

  const updated = await updateBooking(created.id, {
    start_time: formatAllioStartTime(new Date(moveIso)),
    notify_customer: false,
  });
  console.log("UPDATE notify=false", { id: updated.id, start_time: updated.start_time });

  const fetched = await getBooking(created.id);
  console.log("GET", { id: fetched?.id, start_time: fetched?.start_time });

  const cancelled = await cancelBooking(created.id);
  console.log("CANCEL", { id: cancelled?.id, status: cancelled?.status });
}

async function main() {
  console.log("configured:", isAllioNativeConfigured());
  console.log("online:", serviceIdForMeetingType("ONLINE"));
  console.log("physical:", serviceIdForMeetingType("PHYSICAL"));
  console.log("employee:", allioEmployeeId() ?? "(none)");

  if (!isAllioNativeConfigured()) {
    throw new Error("ALLIO_* env mangler — tjek .env.local");
  }

  // Dokumentér kendt Allio-API begrænsning: CRM-kunder kan ikke bookes.
  console.log("\n=== createCustomer → book (forventet FAIL) ===");
  try {
    const c = await createCustomer({
      first_name: "Scope",
      last_name: "Test",
      email: `leads-scope-${Date.now()}@allio.dk`,
      phone: "53577020",
    });
    console.log("CRM customer", c.id);
    try {
      await createBooking({
        customer_id: c.id,
        service_ids: [serviceIdForMeetingType("ONLINE")],
        start_time: formatAllioStartTime(new Date("2026-11-06T10:00:00+01:00")),
        allow_outside_opening_hours: true,
        notes: "scope probe",
      });
      console.log("UNEXPECTED: booking succeeded with CRM customer");
    } catch (err) {
      console.log("EXPECTED book fail:", (err as Error).message);
    }
  } catch (err) {
    console.log("createCustomer fail:", (err as Error).message);
  }

  await smokeMeetingType("ONLINE", "2026-11-03T10:00:00+01:00", "2026-11-03T14:00:00+01:00");
  await smokeMeetingType("PHYSICAL", "2026-11-05T10:00:00+01:00", "2026-11-05T13:00:00+01:00");

  console.log("\n✅ Allio-Native client smoke OK (Ernesto only)");
}

main().catch((err) => {
  console.error("\n❌ FAIL", err);
  process.exit(1);
});
