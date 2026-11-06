"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { BookingSettings, WednesdayMode } from "@/lib/booking/booking-settings";

type PodioOption = { itemId: number; title: string };

type SellerRow = {
  id: string;
  name: string;
  username: string;
  sellerPriority: number | null;
  podioSellerItemId: number | null;
  allioNativeEmployeeId: string | null;
  podioAutoMatch: PodioOption | null;
};

type BookingAdminData = {
  settings: BookingSettings;
  sellers: SellerRow[];
  podioOptions: PodioOption[];
  podioError: string | null;
};

/** Hele og halve timer 09:00–17:00 til «Onsdag fra kl.». */
const HALF_HOURS = Array.from({ length: 17 }, (_, i) => 9 * 60 + i * 30);

function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

const card = "rounded-xl border border-stone-200 bg-white p-5 shadow-sm";
const input =
  "rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2";

export default function BookingAdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<BookingAdminData | null>(null);
  const [settings, setSettings] = useState<BookingSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    if (!session || session.user.role !== "ADMIN") router.replace("/leads");
  }, [session, status, router]);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/booking");
    if (!res.ok) {
      setError("Kunne ikke hente booking-indstillinger.");
      return;
    }
    const d = (await res.json()) as BookingAdminData;
    setData(d);
    setSettings(d.settings);
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || session?.user.role !== "ADMIN") return;
    // Første hentning ved mount — load() sætter state efter fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [status, session?.user.role, load]);

  function flash(msg: string) {
    setSavedHint(msg);
    window.setTimeout(() => setSavedHint(null), 1500);
  }

  async function send(method: "PUT" | "PATCH", body: unknown, okMsg: string) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/booking", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(typeof j.error === "string" ? j.error : "Kunne ikke gemme.");
      return false;
    }
    flash(okMsg);
    await load();
    return true;
  }

  function move(index: number, delta: -1 | 1) {
    if (!data) return;
    const ids = data.sellers.map((s) => s.id);
    const j = index + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j]!, ids[index]!];
    void send("PATCH", { order: ids }, "Prioritet gemt");
  }

  if (status === "loading" || !data || !settings) {
    return <p className="p-6 text-stone-500">{error ?? "Henter…"}</p>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-stone-900">Booking</h1>
        <p className="mt-1 text-sm text-stone-600">
          Kørende sælgere, rækkefølgen møder fordeles i, koblingen til Podio og reglerne for ledige tider.
        </p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {savedHint ? <p className="text-sm text-emerald-700">{savedHint}</p> : null}

      <section className={card}>
        <h2 className="text-sm font-semibold text-stone-900">Kørende sælgere</h2>
        <p className="mt-1 text-xs text-stone-500">
          Nr. 1 fyldes op først, derefter nr. 2 osv. En bruger bliver kørende sælger via fluebenet under
          Indstillinger → Brugere.
        </p>
        {data.podioError ? (
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Podio-sælgerlisten kunne ikke hentes: {data.podioError}
          </p>
        ) : null}

        {data.sellers.length === 0 ? (
          <p className="mt-4 text-sm text-stone-500">Ingen kørende sælgere endnu.</p>
        ) : (
          <ol className="mt-4 divide-y divide-stone-100">
            {data.sellers.map((s, i) => {
              const effectivePodio = s.podioSellerItemId ?? s.podioAutoMatch?.itemId ?? null;
              const podioTitle =
                data.podioOptions.find((o) => o.itemId === effectivePodio)?.title ?? null;
              return (
                <li key={s.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
                  <div className="flex shrink-0 items-center gap-3 sm:w-52">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-900 text-xs font-semibold text-white">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-stone-900">{s.name}</p>
                      <p className="truncate text-xs text-stone-500">{s.username}</p>
                    </div>
                    <div className="ml-auto flex gap-1 sm:ml-2">
                      <button
                        type="button"
                        disabled={busy || i === 0}
                        onClick={() => move(i, -1)}
                        className="rounded border border-stone-200 px-1.5 text-xs text-stone-700 hover:bg-stone-50 disabled:opacity-40"
                        aria-label={`Ryk ${s.name} op`}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        disabled={busy || i === data.sellers.length - 1}
                        onClick={() => move(i, 1)}
                        className="rounded border border-stone-200 px-1.5 text-xs text-stone-700 hover:bg-stone-50 disabled:opacity-40"
                        aria-label={`Ryk ${s.name} ned`}
                      >
                        ▼
                      </button>
                    </div>
                  </div>

                  <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-stone-600">
                    Podio «Sælger»
                    <select
                      value={s.podioSellerItemId ?? ""}
                      disabled={busy}
                      onChange={(e) =>
                        void send(
                          "PATCH",
                          { sellerId: s.id, podioSellerItemId: e.target.value || null },
                          "Podio-kobling gemt",
                        )
                      }
                      className={`${input} w-full min-w-0`}
                    >
                      <option value="">
                        Automatisk på navn
                        {s.podioAutoMatch
                          ? ` → ${s.podioAutoMatch.title} (#${s.podioAutoMatch.itemId})`
                          : " → intet match"}
                      </option>
                      {data.podioOptions.map((o) => (
                        <option key={o.itemId} value={o.itemId}>
                          {o.title} (#{o.itemId})
                        </option>
                      ))}
                    </select>
                    <span className={effectivePodio ? "text-stone-500" : "text-amber-700"}>
                      {effectivePodio
                        ? `Item-id ${effectivePodio}${podioTitle ? ` · ${podioTitle}` : ""}`
                        : "Ingen Podio-sælger — «Sælger» sættes ikke i Podio"}
                    </span>
                  </label>

                  <label className="flex shrink-0 flex-col gap-1 text-xs text-stone-600 sm:w-44">
                    Allio-Native medarbejder-id
                    <input
                      defaultValue={s.allioNativeEmployeeId ?? ""}
                      placeholder="Standard"
                      disabled={busy}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v === (s.allioNativeEmployeeId ?? "")) return;
                        void send(
                          "PATCH",
                          { sellerId: s.id, allioNativeEmployeeId: v || null },
                          "Native-id gemt",
                        );
                      }}
                      className={`${input} w-full`}
                    />
                  </label>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className={card}>
        <h2 className="text-sm font-semibold text-stone-900">Regler for fysiske møder</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-stone-700">Onsdag åbner, når</legend>
            {(
              [
                ["ALL_SELLERS", "Alle kørende sælgere er fyldt torsdag og fredag"],
                ["PER_SELLER", "Den enkelte sælger er fyldt torsdag og fredag (pr. sælger)"],
              ] as [WednesdayMode, string][]
            ).map(([value, label]) => (
              <label key={value} className="flex cursor-pointer items-start gap-2 text-sm text-stone-700">
                <input
                  type="radio"
                  name="wednesdayMode"
                  checked={settings.wednesdayMode === value}
                  onChange={() => setSettings({ ...settings, wednesdayMode: value })}
                  className="mt-0.5"
                />
                {label}
              </label>
            ))}
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs text-stone-600">
              Møder tor og fre hver
              <select
                value={settings.wednesdayOpensAtMeetingsPerDay}
                onChange={(e) =>
                  setSettings({ ...settings, wednesdayOpensAtMeetingsPerDay: Number(e.target.value) })
                }
                className={input}
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n} af 4
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-stone-600">
              Onsdag fra kl.
              <select
                value={settings.wednesdayEarliestStartMin}
                onChange={(e) =>
                  setSettings({ ...settings, wednesdayEarliestStartMin: Number(e.target.value) })
                }
                className={input}
              >
                {HALF_HOURS.map((m) => (
                  <option key={m} value={m}>
                    {hhmm(m)}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-xs text-stone-600">
              Kan bookes frem (uden admin)
              <select
                value={settings.horizonWeeks}
                onChange={(e) => setSettings({ ...settings, horizonWeeks: Number(e.target.value) })}
                className={input}
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    Denne uge + {n} {n === 1 ? "uge" : "uger"} (til og med fredag)
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <p className="mt-3 text-xs text-stone-500">
          Mandag og tirsdag er altid salgsdage uden fysiske møder. Onlinemøder er ikke omfattet.
        </p>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={() => void send("PUT", { settings }, "Regler gemt")}
            className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-60"
          >
            Gem regler
          </button>
        </div>
      </section>
    </div>
  );
}
