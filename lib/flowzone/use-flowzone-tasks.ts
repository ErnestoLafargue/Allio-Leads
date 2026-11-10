"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { ZoneTask } from "./zones";
import { clearLegacyTasks, fetchTasks, saveTaskChanges, takeLegacyTasks } from "./task-storage";

const SAVE_DELAY_MS = 400;

/**
 * Opgaverne i den valgte brugers FlowZone. Hentes fra databasen når brugeren skiftes, og ændringer
 * gemmes kort efter — kun de opgaver der faktisk er ændret, så andres samtidige opgaver ikke røres.
 * Første gang man åbner sin egen FlowZone flyttes opgaver fra browseren med over.
 */
export function useFlowZoneTasks(userId: string, ownUserId: string) {
  const [tasks, setTasks] = useState<ZoneTask[]>([]);
  /** Hvis opgaver `tasks` er (null indtil de første er hentet). */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<{ userId: string; message: string } | null>(null);
  /** Opgaverne som de står i databasen (id → JSON), til at finde ændringer. */
  const saved = useRef(new Map<string, string>());

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let loaded = await fetchTasks(userId);
      if (userId === ownUserId && loaded.length === 0) {
        const legacy = takeLegacyTasks();
        if (legacy.length) {
          await saveTaskChanges(userId, legacy, []);
          clearLegacyTasks();
          loaded = legacy;
        }
      }
      if (cancelled) return;
      saved.current = new Map(loaded.map((t) => [t.id, JSON.stringify(t)]));
      setTasks(loaded);
      setLoadedFor(userId);
      setError(null);
    })().catch(() => {
      if (!cancelled) setError({ userId, message: "Kunne ikke hente opgaverne" });
    });

    return () => {
      cancelled = true;
    };
  }, [userId, ownUserId]);

  // Den seneste udgave af de hentede opgaver og hvis de er — læses når der gemmes
  const latest = useRef<{ userId: string; tasks: ZoneTask[] } | null>(null);

  const save = useCallback(() => {
    if (!latest.current) return;
    const { userId: owner, tasks: current } = latest.current;
    const snapshot = new Map(current.map((t) => [t.id, JSON.stringify(t)]));
    const upserts = current.filter((t) => saved.current.get(t.id) !== snapshot.get(t.id));
    const deletes = [...saved.current.keys()].filter((id) => !snapshot.has(id));
    if (!upserts.length && !deletes.length) return;
    saved.current = snapshot;
    saveTaskChanges(owner, upserts, deletes).catch(() => {
      // Gemningen fejlede: glem øjebliksbilledet, så alt sendes igen ved næste ændring.
      saved.current = new Map();
      setError({ userId: owner, message: "Kunne ikke gemme opgaverne" });
    });
  }, []);

  useEffect(() => {
    if (loadedFor !== userId) return;
    latest.current = { userId, tasks };
    const timer = window.setTimeout(save, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [tasks, loadedFor, userId, save]);

  // Skiftes bruger eller forlades siden inden forsinkelsen, gemmes ændringerne med det samme
  useEffect(() => () => save(), [userId, save]);

  const currentError = error?.userId === userId ? error.message : null;
  return {
    tasks: loadedFor === userId ? tasks : [],
    setTasks: setTasks as Dispatch<SetStateAction<ZoneTask[]>>,
    loading: loadedFor !== userId && !currentError,
    error: currentError,
  };
}
