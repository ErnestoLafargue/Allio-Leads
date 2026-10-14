"use client";

/**
 * Adrians principper (lag 3) og regressionstesten (lag 4): Sonnet foreslår en ny version ud fra al
 * feedback, du godkender eller afviser, og «Test Adrian» spiller dine 👎 igen for at se, om han har lært det.
 */
import { useEffect, useState } from "react";
import { kroner } from "@/lib/ai-saelger/money";

type Version = { id: string; version: number; text: string; status: string; lessonCount: number; rationale: string | null; costUsd: number; createdAt: string };
type TestResult = { model: string; passed: number; total: number; costUsd: number; results: { id: string; customerLine: string; newAnswer: string; pass: boolean; why: string }[] };

const STATUS: Record<string, string> = { active: "Aktiv", draft: "Forslag", rejected: "Afvist", retired: "Tidligere" };

const rules = (text: string) =>
  text
    .split("\n")
    .map((l) => l.replace(/^\s*[-•]\s*/, "").trim())
    .filter(Boolean);

/** Reglerne som nummereret liste: overskriften (før første kolon) med fed, nye regler markeret. */
function RuleList({ text, compareTo }: { text: string; compareTo?: string }) {
  const old = new Set(compareTo ? rules(compareTo) : []);
  return (
    <ol className="space-y-2">
      {rules(text).map((r, i) => {
        const cut = r.indexOf(":");
        const head = cut > 0 && cut < 70 ? r.slice(0, cut) : null;
        const body = head ? r.slice(cut + 1).trim() : r;
        const isNew = compareTo !== undefined && !old.has(r);
        return (
          <li key={i} className="flex gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-stone-200">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-100 text-xs font-semibold text-stone-600">{i + 1}</span>
            <p className="text-sm leading-relaxed text-stone-800">
              {isNew ? <span className="mr-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-800">Ny</span> : null}
              {head ? <b className="font-semibold text-stone-900">{head}: </b> : null}
              {body}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

export function PrinciplesPanel() {
  const [versions, setVersions] = useState<Version[]>([]);
  const [newFeedback, setNewFeedback] = useState(0);
  const [busy, setBusy] = useState<null | "foreslaa" | "test" | string>(null);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<TestResult | null>(null);
  const [showOld, setShowOld] = useState(false);

  const load = async () => {
    const res = await fetch("/api/ai-saelger/principper");
    if (!res.ok) return;
    const d = (await res.json()) as { versions: Version[]; newFeedback: number };
    setVersions(d.versions);
    setNewFeedback(d.newFeedback);
  };
  useEffect(() => {
    void load();
  }, []);

  const post = async (body: Record<string, string>, key: string) => {
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/ai-saelger/principper", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(d.error);
      await load();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Noget gik galt");
    } finally {
      setBusy(null);
    }
  };

  const runTest = async () => {
    setBusy("test");
    setError(null);
    try {
      const res = await fetch("/api/ai-saelger/feedback-test", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const d = (await res.json()) as TestResult & { error?: string };
      if (!res.ok) throw new Error(d.error);
      setTest(d);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Testen fejlede");
    } finally {
      setBusy(null);
    }
  };

  const active = versions.find((v) => v.status === "active");
  const drafts = versions.filter((v) => v.status === "draft");
  const old = versions.filter((v) => v.status === "retired" || v.status === "rejected");

  return (
    <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Adrians principper</p>
        <button
          type="button"
          onClick={() => void post({ action: "foreslaa" }, "foreslaa")}
          disabled={busy !== null}
          className="ml-auto rounded-lg bg-emerald-700 px-3 py-1.5 text-sm text-white disabled:opacity-40"
        >
          {busy === "foreslaa" ? "Sonnet læser din feedback …" : `Lær af feedback${newFeedback ? ` (${newFeedback} nye)` : ""}`}
        </button>
        <button type="button" onClick={runTest} disabled={busy !== null} className="rounded-lg px-3 py-1.5 text-sm text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50 disabled:opacity-40">
          {busy === "test" ? "Tester …" : "Test Adrian på dine 👎"}
        </button>
      </div>
      <p className="text-xs text-stone-500">
        Din feedback virker med det samme som eksempler. «Lær af feedback» laver et forslag til faste principper ud fra al din feedback og dine begrundelser; først når du
        godkender, kommer de i Adrians hjerne. «Test» spiller dine 👎 igen og viser, om han nu svarer, som du ville.
      </p>

      {drafts.map((d) => {
        const decide = (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void post({ action: "godkend", id: d.id }, d.id)}
              disabled={busy !== null}
              className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-40"
            >
              ✓ Godkend
            </button>
            <button
              type="button"
              onClick={() => void post({ action: "afvis", id: d.id }, d.id)}
              disabled={busy !== null}
              className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50 disabled:opacity-40"
            >
              ✕ Afvis
            </button>
          </div>
        );
        return (
          <div key={d.id} className="space-y-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <p className="text-sm font-semibold text-amber-900">Forslag v{d.version}</p>
                <p className="text-xs text-amber-800">
                  Bygger på {d.lessonCount} svar · {kroner(d.costUsd)}
                </p>
              </div>
              <div className="ml-auto">{decide}</div>
            </div>
            {d.rationale ? <p className="rounded-xl bg-white/70 px-3 py-2 text-sm italic text-stone-700">{d.rationale}</p> : null}
            <RuleList text={d.text} compareTo={active?.text ?? ""} />
            <div className="flex justify-end">{decide}</div>
          </div>
        );
      })}

      {active ? (
        <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
          <p className="mb-2 text-sm font-semibold text-emerald-800">Aktiv v{active.version}</p>
          <RuleList text={active.text} />
        </div>
      ) : drafts.length ? null : (
        <p className="text-sm text-stone-500">Ingen principper endnu. Giv feedback i «Tal med Adrian» eller her, og tryk «Lær af feedback».</p>
      )}

      {old.length ? (
        <div>
          <button type="button" onClick={() => setShowOld(!showOld)} className="text-xs text-stone-500 hover:text-stone-800">
            {showOld ? "Skjul" : "Vis"} tidligere versioner ({old.length})
          </button>
          {showOld
            ? old.map((v) => (
                <div key={v.id} className="mt-2 rounded-xl bg-stone-50 p-3 text-sm ring-1 ring-stone-200">
                  <p className="text-xs text-stone-500">
                    v{v.version} · {STATUS[v.status] ?? v.status}
                  </p>
                  <div className="mt-2">
                    <RuleList text={v.text} />
                  </div>
                  <button type="button" onClick={() => void post({ action: "godkend", id: v.id }, v.id)} disabled={busy !== null} className="mt-1 text-xs text-emerald-700">
                    Gør aktiv igen
                  </button>
                </div>
              ))
            : null}
        </div>
      ) : null}

      {test ? (
        <div className="rounded-xl bg-stone-50 p-3 ring-1 ring-stone-200">
          <p className="text-sm font-medium text-stone-900">
            Adrian svarer som dig i {test.passed} af {test.total} af dine 👎 ({test.model}, {kroner(test.costUsd)})
          </p>
          <ul className="mt-2 space-y-2 text-sm">
            {test.results.map((r) => (
              <li key={r.id}>
                <p className="text-stone-500">
                  {r.pass ? "✅" : "❌"} Kunden: «{r.customerLine}»
                </p>
                <p className="text-stone-900">Adrian nu: «{r.newAnswer}»</p>
                <p className="text-xs text-stone-500">{r.why}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </section>
  );
}
