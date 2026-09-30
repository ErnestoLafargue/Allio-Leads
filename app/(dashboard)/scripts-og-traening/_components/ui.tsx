import { OUTCOME_BADGE, OUTCOME_LABELS, scoreColor } from "@/lib/scripts-traening/labels";

export function Card({ title, children, right }: { title?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-stone-200/90 bg-white p-4 shadow-sm">
      {title ? (
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
          {right}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-stone-200/90 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone ?? "text-stone-900"}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-stone-500">{hint}</p> : null}
    </div>
  );
}

export function OutcomeBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-stone-400">Intet udfald</span>;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${OUTCOME_BADGE[status] ?? "bg-stone-100 text-stone-700 ring-stone-200"}`}
    >
      {OUTCOME_LABELS[status] ?? status}
    </span>
  );
}

export function Score({ value, size = "md" }: { value: number | null | undefined; size?: "md" | "lg" }) {
  return (
    <span className={`font-semibold tabular-nums ${scoreColor(value)} ${size === "lg" ? "text-3xl" : "text-sm"}`}>
      {value ?? "–"}
    </span>
  );
}

export function Pct({ value }: { value: number | null }) {
  return <>{value === null ? "–" : `${Math.round(value * 100)} %`}</>;
}

/** Vises i stedet for en konklusion, når der er for få samtaler. */
export function TooFew({ n, min }: { n: number; min: number }) {
  return (
    <span className="text-xs text-stone-400" title={`Mindst ${min} samtaler før der sammenlignes`}>
      for få data ({n})
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-stone-50 px-3 py-6 text-center text-sm text-stone-500">{children}</p>;
}
