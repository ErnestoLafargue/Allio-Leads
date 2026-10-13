import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { activePlaybook } from "@/lib/objection-playbook/read";
import type { PlaybookEntry, PlaybookExample, PlaybookMove } from "@/lib/objection-playbook/schema";
import { OBJECTION_LABELS } from "@/lib/scripts-traening/labels";
import { callScope, getViewer } from "@/lib/scripts-traening/queries";
import { Empty } from "../_components/ui";

const MOVE: Record<PlaybookMove, { label: string; className: string }> = {
  sporg: { label: "Spørg ind", className: "bg-sky-100 text-sky-800" },
  forklar: { label: "Forklar", className: "bg-violet-100 text-violet-800" },
  behandl: { label: "Behandl", className: "bg-amber-100 text-amber-800" },
  luk: { label: "Luk mødet", className: "bg-emerald-100 text-emerald-800" },
};

const pct = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)} %`);

/** Skabelonen med [pladsholdere] fremhævet. */
function Template({ text }: { text: string }) {
  return (
    <p className="text-[15px] leading-relaxed text-stone-900">
      {text.split(/(\[[^\]]+\])/).map((part, i) =>
        part.startsWith("[") ? (
          <span key={i} className="rounded bg-amber-100 px-1 text-amber-900">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

function Example({ title, ex, why, tone, canOpen }: { title: string; ex: PlaybookExample | null; why: string; tone: "good" | "bad"; canOpen: ReadonlySet<string> }) {
  if (!ex) return null;
  const border = tone === "good" ? "border-emerald-200 bg-emerald-50/40" : "border-rose-200 bg-rose-50/40";
  const head = tone === "good" ? "text-emerald-800" : "text-rose-800";
  return (
    <div className={`rounded-lg border p-3 ${border}`}>
      <div className="flex items-center justify-between gap-2">
        <p className={`text-xs font-semibold uppercase tracking-wide ${head}`}>{title}</p>
        <span className="text-[11px] text-stone-500">
          {ex.booked ? "endte med møde" : "intet møde"}
          {canOpen.has(ex.callRecordingId) ? (
            <>
              {" · "}
              <Link href={`/scripts-og-traening/samtaler/${ex.callRecordingId}?t=${Math.floor(ex.t)}`} className="underline hover:text-stone-800">
                hør den
              </Link>
            </>
          ) : null}
        </span>
      </div>
      <dl className="mt-2 space-y-1.5 text-sm">
        <div>
          <dt className="inline font-medium text-stone-500">Kunde: </dt>
          <dd className="inline italic text-stone-800">«{ex.customer}»</dd>
        </div>
        <div>
          <dt className="inline font-medium text-stone-500">Sælger: </dt>
          <dd className="inline text-stone-800">{ex.response ? `«${ex.response}»` : "(intet svar)"}</dd>
        </div>
        {ex.reaction ? (
          <div>
            <dt className="inline font-medium text-stone-500">Reaktion: </dt>
            <dd className="inline italic text-stone-800">«{ex.reaction}»</dd>
          </div>
        ) : null}
      </dl>
      <p className="mt-2 text-xs text-stone-600">{why}</p>
    </div>
  );
}

function Entry({ e, canOpen }: { e: PlaybookEntry; canOpen: ReadonlySet<string> }) {
  const move = MOVE[e.move];
  return (
    <details className="group rounded-xl border border-stone-200/90 bg-white shadow-sm open:shadow-md">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
        <span className="w-6 shrink-0 text-right text-sm font-semibold tabular-nums text-stone-400">{e.rank}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-stone-900">{e.title}</p>
          <p className="text-xs text-stone-500">
            {OBJECTION_LABELS[e.category as keyof typeof OBJECTION_LABELS] ?? e.category} · {e.count} gange ({pct(e.share)})
          </p>
        </div>
        <span className="hidden text-right text-xs text-stone-500 sm:block" title="Andel med møde booket ved god / svag behandling">
          Møde: <span className="font-semibold text-emerald-700">{pct(e.bookedGood)}</span> godt vs <span className="font-semibold text-rose-700">{pct(e.bookedBad)}</span> svagt
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${move.className}`}>{move.label}</span>
      </summary>
      <div className="space-y-4 border-t border-stone-100 px-4 pb-4 pt-3">
        <section className="rounded-lg border-l-4 border-emerald-600 bg-stone-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Skabelon</p>
          <div className="mt-1">
            <Template text={e.template} />
          </div>
          <p className="mt-2 text-xs text-stone-600">
            <span className="font-semibold">Princip: </span>
            {e.principle}
          </p>
          {e.adapt.length ? (
            <ul className="mt-1 space-y-0.5 text-xs text-stone-600">
              {e.adapt.map((a, i) => (
                <li key={i}>• {a}</li>
              ))}
            </ul>
          ) : null}
        </section>

        <section>
          <p className="text-sm leading-relaxed text-stone-700">{e.analysis}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Virker</p>
              <ul className="mt-1 space-y-0.5 text-sm text-stone-700">{e.works.map((w, i) => <li key={i}>• {w}</li>)}</ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Virker ikke</p>
              <ul className="mt-1 space-y-0.5 text-sm text-stone-700">{e.fails.map((f, i) => <li key={i}>• {f}</li>)}</ul>
            </div>
          </div>
        </section>

        <section className="grid gap-3 lg:grid-cols-2">
          <Example title="Bedste behandling" ex={e.best} why={e.bestWhy} tone="good" canOpen={canOpen} />
          <Example title="Dårligste behandling" ex={e.worst} why={e.worstWhy} tone="bad" canOpen={canOpen} />
        </section>
      </div>
    </details>
  );
}

export default async function ObjectionsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const book = await activePlaybook();
  if (!book) return <Empty>Indvendingsbogen er ikke lavet endnu.</Empty>;

  const ids = [...new Set(book.entries.flatMap((e) => [e.best?.callRecordingId, e.worst?.callRecordingId]).filter((x): x is string => !!x))];
  const canOpen = new Set(
    viewer.isAdmin
      ? ids
      : (await prisma.callRecording.findMany({ where: { ...callScope(viewer), id: { in: ids } }, select: { id: true } })).map((r) => r.id),
  );

  return (
    <div className="space-y-5">
      <header className="max-w-3xl">
        <h2 className="text-2xl font-semibold text-stone-900">De {book.entries.length} hyppigste indvendinger</h2>
        <p className="mt-1 text-sm text-stone-500">
          Bygget på {book.stats.objections} indvendinger fra {book.stats.calls} salgssamtaler
          {book.publishedAt ? ` · opdateret ${book.publishedAt.toLocaleDateString("da-DK")}` : ""}. Hver har en skabelon, som live-coachen
          tager udgangspunkt i og tilpasser kunden — de gule felter udfyldes med kundens egne ord.
        </p>
      </header>
      <div className="space-y-2">
        {book.entries.map((e) => (
          <Entry key={e.key} e={e} canOpen={canOpen} />
        ))}
      </div>
    </div>
  );
}
