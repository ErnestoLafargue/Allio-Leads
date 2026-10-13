"use client";

/**
 * Live-coach: lytter med på sælgerens og kundens lydspor (Soniox realtime direkte fra browseren) og
 * hjælper KUN med indvendinger — plus en kort vurdering af kunden. Den gentager ikke scriptet.
 *  - Når kunden kommer med en indvending, spørges Claude Haiku (~1 s) om det bedste svar til netop
 *    denne kunde. Kommer AI-svaret ikke hurtigt nok, vises jeres bedste svar fra ugens script.
 *  - Kortet bliver stående, til sælgeren har sagt noget, der ligner (card-lock.ts). Ellers skifter
 *    det højst hvert 25. sekund, og kun når samtalen har udviklet sig (ny indvending, eller AI
 *    vurderer, at kortet ikke længere passer).
 *  - Tavs ved telefonsvarere og omstillinger (machine-gate.ts).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ObjectionCategory } from "@/lib/call-analysis/schema";
import { OBJECTION_LABELS, SIGNAL_LABELS } from "@/lib/scripts-traening/labels";
import { startSonioxStream, SpeakerTranscript, type SonioxStream } from "@/lib/live-coach/soniox-stream";
import { ScriptTracker, type ScriptLine } from "@/lib/live-coach/script-tracker";
import { detectBuyingSignal, detectObjection, triggerCard, type CoachCard } from "@/lib/live-coach/triggers";
import { parseCoachText, splitReply, type CoachLine, type CoachMove } from "@/lib/live-coach/card";
import { MachineGate, type GateState } from "@/lib/live-coach/machine-gate";
import { CardLock } from "@/lib/live-coach/card-lock";

export type LiveCoachLine = CoachLine & { final: boolean };

type Session = { responses: Partial<Record<ObjectionCategory, string>>; script: ScriptLine[]; agentName: string };
type ShownCard = CoachCard & { eventId: string | null; helpful: boolean | null; used: boolean; move?: CoachMove | null };

/** Vent så længe på AI-svaret, før jeres svar fra ugens script vises i stedet. */
const FALLBACK_AFTER_MS = 3_500;
/** Højst ét vurderings-kald pr. så mange ms, når kunden ikke kommer med en indvending. */
const ASSESS_EVERY_MS = 12_000;

const SIGNAL_STYLE: Record<string, string> = {
  tryghed: "bg-sky-100 text-sky-800",
  klarhed: "bg-violet-100 text-violet-800",
  okonomi: "bg-amber-100 text-amber-800",
  skepsis: "bg-rose-100 text-rose-800",
  timing: "bg-orange-100 text-orange-800",
  lav_interesse: "bg-stone-200 text-stone-700",
};

const MOVE_STYLE: Record<CoachMove, { label: string; className: string }> = {
  sporg: { label: "Spørg ind", className: "bg-sky-600 text-white" },
  forklar: { label: "Forklar", className: "bg-violet-600 text-white" },
  behandl: { label: "Behandl", className: "bg-amber-500 text-white" },
  luk: { label: "Luk mødet", className: "bg-emerald-600 text-white" },
};

const objectionLabel = (c: string | null) => (c ? (OBJECTION_LABELS[c as ObjectionCategory] ?? c) : null);

export function LiveCoach(props: {
  micStream: MediaStream | null;
  remoteStream: MediaStream | null;
  active: boolean;
  /** Leadet der ringes til — giver coachen kundens profil og tidligere samtaler. */
  leadId?: string | null;
  /** Valgfrit: vis/brug transskriptionen (fx testsiden). */
  onTranscript?: (lines: LiveCoachLine[]) => void;
  /** Valgfrit: målt tid fra kundens ord til kortet (ms). */
  onLatency?: (ms: number, source: CoachCard["source"]) => void;
}) {
  const { micStream, remoteStream, active, onTranscript, onLatency, leadId = null } = props;
  /** Stemningen gennem samtalen: de signaler, kunden har vist indtil nu. */
  const signalsSeen = useRef<string[]>([]);
  const [card, setCard] = useState<ShownCard | null>(null);
  const [assessment, setAssessment] = useState<string | null>(null);
  const [pending, setPending] = useState<ObjectionCategory | null>(null);
  const [status, setStatus] = useState<"off" | "starting" | "listening" | "error">("off");
  const [error, setError] = useState<string | null>(null);
  const [machine, setMachine] = useState<GateState>("unknown");

  const tracker = useRef<ScriptTracker | null>(null);
  const session = useRef<Session | null>(null);
  const history = useRef<LiveCoachLine[]>([]);
  const agent = useRef(new SpeakerTranscript());
  const customer = useRef(new SpeakerTranscript());
  const customerStart = useRef(0);
  const gate = useRef(new MachineGate());
  const lock = useRef(new CardLock());
  /** Indvendingen i den igangværende ytring (så den ikke udløses igen for hvert nyt ord). */
  const heardCategory = useRef<ObjectionCategory | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAskAt = useRef(0);
  /** Konteksten til AI: hvornår opkaldet startede, og hvilke indvendinger kunden har haft. */
  const callStartedAt = useRef(0);
  const objectionsSeen = useRef<string[]>([]);

  const logEvent = useCallback(async (body: Record<string, unknown>): Promise<string | null> => {
    try {
      const res = await fetch("/api/live-coach/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.ok ? (((await res.json()) as { id?: string }).id ?? null) : null;
    } catch {
      return null;
    }
  }, []);

  const rate = useCallback(
    (helpful: boolean) => {
      setCard((c) => (c ? { ...c, helpful } : c));
      if (card?.eventId) void logEvent({ id: card.eventId, helpful });
    },
    [card?.eventId, logEvent],
  );

  const dismiss = useCallback(() => {
    lock.current.dismiss();
    setCard(null);
  }, []);

  const publish = useCallback(() => {
    if (!onTranscript) return;
    const live: LiveCoachLine[] = [];
    if (agent.current.utterance) live.push({ speaker: "agent", text: agent.current.utterance, final: false });
    if (customer.current.utterance) live.push({ speaker: "customer", text: customer.current.utterance, final: false });
    onTranscript([...history.current, ...live]);
  }, [onTranscript]);

  /** Viser et kort, hvis låsen tillader det — ellers huskes en ny indvending som «også nævnt». */
  const tryShow = useCallback(
    (next: Omit<ShownCard, "used">, heardAt: number, fresh = false): boolean => {
      const now = performance.now();
      if (!lock.current.canShow(next.category, next.source, now, fresh)) {
        if (next.category && next.category !== lock.current.current?.category) setPending(next.category);
        return false;
      }
      lock.current.show({ category: next.category, line: next.line, source: next.source, shownAt: now });
      tracker.current?.onDeviation();
      setCard({ ...next, used: false });
      setPending((p) => (p === next.category ? null : p));
      onLatency?.(now - heardAt, next.source);
      return true;
    },
    [onLatency],
  );

  const askClaude = useCallback(
    async (trigger: ObjectionCategory | null, heardAt: number) => {
      // Et vurderings-kald (uden indvending) afbryder aldrig et igangværende kald.
      if (!trigger && inFlight.current) return;
      inFlight.current?.abort();
      const ctrl = new AbortController();
      inFlight.current = ctrl;
      lastAskAt.current = performance.now();
      const lines: CoachLine[] = history.current.map(({ speaker, text }) => ({ speaker, text }));
      if (customer.current.utterance) lines.push({ speaker: "customer", text: customer.current.utterance });
      const shown = lock.current.active;
      try {
        const res = await fetch("/api/live-coach/suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lines,
            trigger,
            leadId,
            mood: {
              signals: signalsSeen.current.slice(-6),
              phase: tracker.current?.nextLine?.phase ?? null,
              seconds: (performance.now() - callStartedAt.current) / 1000,
              objections: objectionsSeen.current,
            },
            shown: shown ? { category: shown.category, line: shown.line } : null,
          }),
          signal: ctrl.signal,
        });
        if (!res.ok) return; // fx månedsloftet (429): coachen forbliver tavs
        const eventId = res.headers.get("X-Coach-Event");
        // Kortet vises først, når det er færdigskrevet — så teksten ikke ændrer sig, mens man læser.
        const parsed = parseCoachText(await res.text());
        if (parsed.customer) setAssessment(parsed.customer);
        if (parsed.signal) signalsSeen.current.push(parsed.signal);
        // Kun indvendinger, nysgerrighed og lukke-øjeblikke giver et kort — ellers bruges svaret kun til vurderingen.
        const moveWithoutObjection = parsed.move === "luk" || parsed.move === "forklar";
        if (parsed.silent || !parsed.line || (!trigger && !parsed.objection && !moveWithoutObjection)) return;
        const category = trigger ?? parsed.objection;
        if (category && !objectionsSeen.current.includes(category)) objectionsSeen.current.push(category);
        const shownNow = tryShow(
          {
            source: "ai",
            category,
            signal: parsed.signal ?? "klarhed",
            move: parsed.move,
            why: parsed.why,
            line: parsed.line,
            eventId,
            helpful: null,
          },
          heardAt,
          parsed.fresh,
        );
        if (shownNow) {
          if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
          if (eventId) void logEvent({ id: eventId, latencyMs: performance.now() - heardAt });
        }
      } catch {
        /* afbrudt af en nyere indvending */
      } finally {
        if (inFlight.current === ctrl) inFlight.current = null;
      }
    },
    [leadId, logEvent, tryShow],
  );

  /** Kunden kom med en indvending: spørg AI, og vis ugens svar, hvis AI ikke når det. */
  const onObjection = useCallback(
    (category: ObjectionCategory, heardAt: number, why: string, signal: CoachCard["signal"]) => {
      signalsSeen.current.push(signal);
      if (!objectionsSeen.current.includes(category)) objectionsSeen.current.push(category);
      if (!lock.current.canShow(category, "trigger", performance.now())) {
        if (category !== lock.current.current?.category) setPending(category);
        // Har kortet stået længe nok, må AI vurdere, om samtalen har udviklet sig (NYT: ja).
        if (lock.current.canShow(category, "ai", performance.now(), true)) void askClaude(category, heardAt);
        return;
      }
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
      fallbackTimer.current = setTimeout(() => {
        const instant = triggerCard({ category, signal, why, patterns: [] }, session.current?.responses ?? {});
        if (!instant || !tryShow({ ...instant, eventId: null, helpful: null }, heardAt)) return;
        void logEvent({ source: "trigger", category, signal, line: instant.line, latencyMs: performance.now() - heardAt }).then((id) =>
          setCard((c) => (c && c.source === "trigger" && c.line === instant.line ? { ...c, eventId: id } : c)),
        );
      }, FALLBACK_AFTER_MS);
      void askClaude(category, heardAt);
    },
    [askClaude, tryShow, logEvent],
  );

  useEffect(() => {
    if (!active || !remoteStream) return;
    let cancelled = false;
    const streams: SonioxStream[] = [];
    history.current = [];
    signalsSeen.current = [];
    agent.current = new SpeakerTranscript();
    customer.current = new SpeakerTranscript();
    heardCategory.current = null;
    gate.current = new MachineGate();
    lock.current = new CardLock();
    lastAskAt.current = 0;
    callStartedAt.current = performance.now();
    objectionsSeen.current = [];
    setMachine("unknown");
    setCard(null);
    setAssessment(null);
    setPending(null);
    setError(null);
    setStatus("starting");

    (async () => {
      const res = await fetch("/api/live-coach/session", { method: "POST" });
      if (!res.ok) throw new Error("Kunne ikke starte live-coachen");
      const data = (await res.json()) as Session & { agentKey: string; customerKey: string };
      if (cancelled) return;
      session.current = { responses: data.responses, script: data.script ?? [], agentName: data.agentName };
      tracker.current = data.script?.length ? new ScriptTracker(data.script) : null;
      const terms = ["Allio", ...data.agentName.split(/\s+/).slice(0, 1)];

      const customerStream = await startSonioxStream({
        apiKey: data.customerKey,
        stream: remoteStream,
        terms,
        onError: (m) => setError(m),
        onTokens: (tokens) => {
          const completed = customer.current.apply(tokens);
          const allowed = gate.current.onCustomer(completed ?? customer.current.utterance, completed !== null);
          setMachine(gate.current.state);
          if (!allowed) {
            // Telefonsvarer/omstilling: ingen kort, intet AI-kald, og maskinens tekst kommer ikke med i samtalen.
            inFlight.current?.abort();
            if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
            heardCategory.current = null;
            setCard(null);
            publish();
            return;
          }
          const heardAt = customerStart.current + customer.current.lastEndMs;
          const trigger = detectObjection(completed ?? customer.current.utterance);
          if (trigger && trigger.category !== heardCategory.current) {
            heardCategory.current = trigger.category;
            onObjection(trigger.category, heardAt, trigger.why, trigger.signal);
          }
          if (completed) {
            history.current.push({ speaker: "customer", text: completed, final: true });
            // Købssignal: lad AI vurdere med det samme, om det er tid til at lukke. Ellers vurderes kunden
            // (og skjulte indvendinger fanges) højst hvert 12. sekund.
            if (!trigger && (detectBuyingSignal(completed) || performance.now() - lastAskAt.current >= ASSESS_EVERY_MS)) {
              void askClaude(null, heardAt);
            }
            heardCategory.current = null;
          }
          publish();
        },
      });
      customerStart.current = customerStream.startedAt;
      streams.push(customerStream);

      if (micStream) {
        streams.push(
          await startSonioxStream({
            apiKey: data.agentKey,
            stream: micStream,
            terms,
            onError: (m) => setError(m),
            onTokens: (tokens) => {
              const completed = agent.current.apply(tokens);
              if (lock.current.onAgentSpeech(completed ?? agent.current.utterance, completed !== null)) {
                setCard((c) => (c ? { ...c, used: true } : c));
              }
              if (completed) {
                history.current.push({ speaker: "agent", text: completed, final: true });
                tracker.current?.onAgentUtterance(completed);
              }
              publish();
            },
          }),
        );
      }
      if (cancelled) streams.forEach((s) => s.stop());
      else setStatus("listening");
    })().catch((err: unknown) => {
      if (cancelled) return;
      setStatus("error");
      setError(err instanceof Error ? err.message : String(err));
    });

    return () => {
      cancelled = true;
      inFlight.current?.abort();
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
      streams.forEach((s) => s.stop());
      setStatus("off");
    };
  }, [active, micStream, remoteStream, askClaude, onObjection, publish]);

  // Efter opkaldet bliver det sidste kort og vurderingen stående, til næste opkald starter.
  if (!active && !card && !assessment) return null;
  const silent = machine === "voicemail" || machine === "ivr";
  return (
    <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-stone-500">
        <span>Live-coach</span>
        <span>
          {!active ? "opkald slut" : status === "listening" ? "● lytter" : status === "starting" ? "starter…" : status === "error" ? "fejl" : ""}
        </span>
      </div>
      {error ? <p className="mt-1 text-xs text-rose-700">{error}</p> : null}
      {silent ? (
        <p className="mt-2 text-xs text-stone-400">
          {machine === "voicemail" ? "Telefonsvarer — coachen er tavs." : "Omstilling/kø — coachen venter på en person."}
        </p>
      ) : (
        <>
          {assessment ? (
            <p className="mt-2 text-xs text-stone-600">
              <span className="font-semibold text-stone-700">Kunden: </span>
              {assessment}
            </p>
          ) : null}
          {card ? (
            <div className={`mt-2 space-y-1 transition-opacity ${card.used ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-2">
                {card.move ? (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${MOVE_STYLE[card.move].className}`}>
                    {MOVE_STYLE[card.move].label}
                  </span>
                ) : null}
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${SIGNAL_STYLE[card.signal] ?? "bg-stone-100 text-stone-700"}`}>
                  {(objectionLabel(card.category) ?? SIGNAL_LABELS[card.signal]).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-stone-600">{card.why}</span>
                <button
                  type="button"
                  onClick={dismiss}
                  className="rounded px-1 text-sm leading-none text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                  aria-label="Luk kortet"
                  title="Luk kortet"
                >
                  ×
                </button>
              </div>
              <div className="space-y-1 border-l-2 border-emerald-600 pl-2.5 text-sm leading-snug text-stone-900">
                {splitReply(card.line).map((part, i, all) => (
                  <p key={i} className={i === all.length - 1 && part.endsWith("?") ? "font-semibold" : "font-medium"}>
                    {part}
                  </p>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-stone-400">
                  {card.used ? "✓ sagt" : ""}
                </p>
                <div className="flex gap-1" aria-label="Var kortet brugbart?">
                  {([true, false] as const).map((v) => (
                    <button
                      key={String(v)}
                      type="button"
                      onClick={() => rate(v)}
                      aria-pressed={card.helpful === v}
                      className={`rounded px-1.5 py-0.5 text-xs ${card.helpful === v ? "bg-stone-800 text-white" : "bg-stone-100 hover:bg-stone-200"}`}
                    >
                      {v ? "👍" : "👎"}
                    </button>
                  ))}
                </div>
              </div>
              {pending && pending !== card.category ? (
                <p className="text-[11px] text-stone-500">Kunden nævnte også: {objectionLabel(pending)}</p>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
