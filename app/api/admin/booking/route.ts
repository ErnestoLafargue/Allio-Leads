import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-auth";
import { getBookingSettings, saveBookingSettings } from "@/lib/booking/booking-settings-db";
import { listDrivingSellers } from "@/lib/meeting-assignee";
import { isAllioNativeConfigured, listEmployees } from "@/lib/allio-native/client";
import { ensureAllioEmployeeForSeller } from "@/lib/allio-native/employees";

// Oprettelse af en kalender går gennem Allios API, der kan være flere sekunder om det.
export const maxDuration = 60;

/** Værdi i kalendervælgeren: opret en ny kalender i Allio til sælgeren. */
const CREATE_ALLIO_CALENDAR = "__create__";
import { listPodioSellerOptions, matchPodioSellerByName } from "@/lib/podio/sellers";

/** Administration → Booking: regler, kørende sælgere (prioritet) og Podio-/Native-kobling. */
export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const [settings, sellers] = await Promise.all([getBookingSettings(), listDrivingSellers()]);
  let allioEmployees: { id: string; name: string }[] = [];
  let allioError: string | null = null;
  if (isAllioNativeConfigured()) {
    try {
      allioEmployees = (await listEmployees()).map((e) => ({ id: e.id, name: e.name }));
    } catch (e) {
      allioError = e instanceof Error ? e.message : String(e);
    }
  }
  let podioOptions: { itemId: number; title: string }[] = [];
  let podioError: string | null = null;
  try {
    podioOptions = await listPodioSellerOptions({ fresh: true });
  } catch (e) {
    podioError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({
    settings,
    podioOptions,
    podioError,
    allioEmployees,
    allioError,
    sellers: sellers.map((s) => ({
      id: s.id,
      name: s.name,
      username: s.username,
      sellerPriority: s.sellerPriority,
      podioSellerItemId: s.podioSellerItemId,
      allioNativeEmployeeId: s.allioNativeEmployeeId,
      /** Det element Allio finder automatisk på navnet (bruges når intet er valgt manuelt). */
      podioAutoMatch: matchPodioSellerByName(podioOptions, s.name),
    })),
  });
}

/** PUT { settings } — gem booking-reglerne. */
export async function PUT(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;
  const body = await req.json().catch(() => null);
  const settings = await saveBookingSettings(body?.settings ?? {});
  return NextResponse.json({ settings });
}

/**
 * PATCH { order: string[] } — ny prioritet (første = 1), eller
 * PATCH { sellerId, podioSellerItemId: number | null, allioNativeEmployeeId: string | null }.
 */
export async function PATCH(req: Request) {
  const { response } = await requireAdmin();
  if (response) return response;
  const body = await req.json().catch(() => null);
  const sellers = await listDrivingSellers();
  const sellerIds = new Set(sellers.map((s) => s.id));

  if (Array.isArray(body?.order)) {
    const order = (body.order as unknown[]).filter(
      (id): id is string => typeof id === "string" && sellerIds.has(id),
    );
    if (order.length !== sellerIds.size) {
      return NextResponse.json({ error: "Rækkefølgen skal indeholde alle kørende sælgere." }, { status: 400 });
    }
    await prisma.$transaction(
      order.map((id, i) => prisma.user.update({ where: { id }, data: { sellerPriority: i + 1 } })),
    );
    return NextResponse.json({ ok: true });
  }

  const sellerId = typeof body?.sellerId === "string" ? body.sellerId : "";
  if (!sellerIds.has(sellerId)) {
    return NextResponse.json({ error: "Ukendt kørende sælger." }, { status: 400 });
  }
  const data: { podioSellerItemId?: number | null; allioNativeEmployeeId?: string | null } = {};
  if (body && "podioSellerItemId" in body) {
    const n = Number(body.podioSellerItemId);
    data.podioSellerItemId =
      body.podioSellerItemId === null || body.podioSellerItemId === "" ? null : Number.isInteger(n) && n > 0 ? n : null;
  }
  if (body && "allioNativeEmployeeId" in body) {
    const v = typeof body.allioNativeEmployeeId === "string" ? body.allioNativeEmployeeId.trim() : "";
    if (v === CREATE_ALLIO_CALENDAR) {
      // Ryd koblingen og find/opret en kalender i Allio til sælgeren.
      await prisma.user.update({ where: { id: sellerId }, data: { ...data, allioNativeEmployeeId: null } });
      try {
        const employeeId = await ensureAllioEmployeeForSeller(sellerId);
        return NextResponse.json({ ok: true, allioNativeEmployeeId: employeeId });
      } catch (e) {
        return NextResponse.json(
          { error: `Kalenderen kunne ikke oprettes i Allio: ${e instanceof Error ? e.message : String(e)}` },
          { status: 502 },
        );
      }
    }
    data.allioNativeEmployeeId = v || null;
  }
  await prisma.user.update({ where: { id: sellerId }, data });
  return NextResponse.json({ ok: true });
}
