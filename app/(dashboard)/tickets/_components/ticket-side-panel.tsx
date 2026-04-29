"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  TICKET_PRIORITY_LABELS,
  TICKET_PRIORITY_ORDER,
  type TicketPriority,
} from "@/lib/ticket-priority";
import {
  TICKET_STATUS_LABELS,
  TICKET_STATUS_ORDER,
  type TicketStatus,
} from "@/lib/ticket-status";
import { canDeleteTicket, canEditTicket } from "@/lib/ticket-access";
import type { TicketDto } from "./tickets-shared";

export type TicketSidePanelMode = "create" | "view" | "edit";

type Viewer = { id: string; role: string };
type AssignableUser = { id: string; name: string; username: string };

type Props = {
  open: boolean;
  mode: TicketSidePanelMode;
  /** Eksisterende ticket — kun nødvendig ved view/edit. */
  ticket?: TicketDto | null;
  viewer: Viewer;
  assignees: AssignableUser[];
  defaultAssigneeId?: string | null;
  onClose: () => void;
  onSaved: (ticket: TicketDto) => void;
  onDeleted: (id: string) => void;
  onModeChange: (mode: TicketSidePanelMode) => void;
};

const DETAIL_FORMATTER = new Intl.DateTimeFormat("da-DK", {
  timeZone: "Europe/Copenhagen",
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function TicketSidePanel(props: Props) {
  const { open, mode, ticket, viewer, assignees, defaultAssigneeId, onClose, onSaved, onDeleted, onModeChange } = props;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [status, setStatus] = useState<TicketStatus>("open");
  const [deadline, setDeadline] = useState<string>("");
  const [assignedUserId, setAssignedUserId] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const assigneeRef = useRef<HTMLSelectElement | null>(null);

  const isCreate = mode === "create";
  const isView = mode === "view";
  const isEdit = mode === "edit";
  const isFormMode = isCreate || isEdit;

  const accessTicket = ticket
    ? { createdByUserId: ticket.createdBy.id, assignedUserId: ticket.assignedUser.id }
    : null;
  const userCanEdit = isCreate || (accessTicket ? canEditTicket(viewer, accessTicket) : false);
  const userCanDelete = !isCreate && accessTicket ? canDeleteTicket(viewer, accessTicket) : false;

  useEffect(() => {
    if (!open) return;
    if (isCreate) {
      setTitle("");
      setDescription("");
      setPriority("normal");
      setStatus("open");
      setDeadline("");
      setAssignedUserId(defaultAssigneeId ?? viewer.id ?? "");
    } else if (ticket) {
      setTitle(ticket.title);
      setDescription(ticket.description);
      setPriority(ticket.priority);
      setStatus(ticket.status);
      setDeadline(ticket.deadline ?? "");
      setAssignedUserId(ticket.assignedUser.id);
    }
    setError(null);
  }, [open, isCreate, ticket, defaultAssigneeId, viewer.id]);

  useEffect(() => {
    if (!open || !isFormMode) return;
    const id = window.setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 60);
    return () => window.clearTimeout(id);
  }, [open, isFormMode]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const headerTitle = useMemo(() => {
    if (isCreate) return "Opret ticket";
    if (isEdit) return "Rediger ticket";
    return ticket?.title ?? "Ticket";
  }, [isCreate, isEdit, ticket]);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!isFormMode) return;
    if (!title.trim()) {
      setError("Titel er påkrævet.");
      return;
    }
    if (!assignedUserId) {
      setError("Vælg en bruger der er ansvarlig.");
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      title: title.trim(),
      description: description.trim(),
      priority,
      status,
      deadline: deadline || null,
      assignedUserId,
    };

    try {
      if (isCreate) {
        const res = await fetch("/api/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(typeof data.error === "string" ? data.error : "Kunne ikke oprette ticket.");
          setSaving(false);
          return;
        }
        onSaved(data.ticket as TicketDto);
      } else if (isEdit && ticket) {
        const res = await fetch(`/api/tickets/${ticket.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(typeof data.error === "string" ? data.error : "Kunne ikke gemme.");
          setSaving(false);
          return;
        }
        onSaved(data.ticket as TicketDto);
      }
    } catch (err) {
      setError("Netværksfejl. Prøv igen.");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!ticket) return;
    if (!window.confirm(`Slet «${ticket.title}»? Dette kan ikke fortrydes.`)) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : "Kunne ikke slette ticket.");
        setDeleting(false);
        return;
      }
      onDeleted(ticket.id);
    } catch (err) {
      setError("Netværksfejl. Prøv igen.");
      console.error(err);
    } finally {
      setDeleting(false);
    }
  }

  async function quickPatch(payload: Record<string, unknown>, fallbackError: string) {
    if (!ticket) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : fallbackError);
        return;
      }
      onSaved(data.ticket as TicketDto);
    } catch {
      setError(fallbackError);
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!isFormMode) return;
    // Cmd/Ctrl+Enter submitter formularen
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal aria-label={headerTitle}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <aside
        onKeyDown={handleKeyDown}
        className="absolute right-0 top-0 flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-stone-200 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-stone-500">
              {isCreate ? "Ny opgave" : isEdit ? "Redigerer" : "Opgave"}
            </p>
            <h2 className="mt-0.5 truncate text-lg font-semibold text-stone-900">{headerTitle}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Luk"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-100 hover:text-stone-900"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 px-5 py-4">
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {error}
            </p>
          ) : null}

          <Field label="Titel" required>
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                  e.preventDefault();
                  assigneeRef.current?.focus();
                }
              }}
              disabled={!isFormMode}
              placeholder="Hvad skal gøres?"
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none ring-emerald-500 focus:border-emerald-500 focus:ring-2 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-700"
              maxLength={200}
            />
          </Field>

          <Field label="Tildelt bruger" required>
            <select
              ref={assigneeRef}
              value={assignedUserId}
              onChange={(e) => setAssignedUserId(e.target.value)}
              disabled={!isFormMode}
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none ring-emerald-500 focus:border-emerald-500 focus:ring-2 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-700"
            >
              {assignees.length === 0 ? (
                <option value="">Henter brugere…</option>
              ) : (
                <>
                  {!assignedUserId ? <option value="" disabled>Vælg ansvarlig</option> : null}
                  {assignees.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.username})
                    </option>
                  ))}
                </>
              )}
            </select>
          </Field>

          <Field label="Prioritet">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TICKET_PRIORITY_ORDER.map((p) => {
                const active = p === priority;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => isFormMode && setPriority(p)}
                    disabled={!isFormMode}
                    className={[
                      "rounded-lg border px-2 py-1.5 text-xs font-semibold transition",
                      active
                        ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                        : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-white",
                    ].join(" ")}
                  >
                    {TICKET_PRIORITY_LABELS[p]}
                  </button>
                );
              })}
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Deadline">
              <div className="flex gap-2">
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  disabled={!isFormMode}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none ring-emerald-500 focus:border-emerald-500 focus:ring-2 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-700"
                />
                {deadline && isFormMode ? (
                  <button
                    type="button"
                    onClick={() => setDeadline("")}
                    className="shrink-0 rounded-lg border border-stone-300 bg-white px-2 text-xs font-medium text-stone-700 hover:bg-stone-50"
                    title="Fjern deadline"
                  >
                    Fjern
                  </button>
                ) : null}
              </div>
              <p className="mt-1 text-[11px] text-stone-500">
                Optional. Tickets uden deadline ligger lavt i kalenderen.
              </p>
            </Field>

            {isCreate ? null : (
              <Field label="Status">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TicketStatus)}
                  disabled={!isFormMode}
                  className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none ring-emerald-500 focus:border-emerald-500 focus:ring-2 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-700"
                >
                  {TICKET_STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {TICKET_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>

          <Field label="Beskrivelse">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!isFormMode}
              rows={5}
              placeholder="Detaljer, kontekst, links…"
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none ring-emerald-500 focus:border-emerald-500 focus:ring-2 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-700"
            />
          </Field>

          {!isCreate && ticket ? (
            <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
              Oprettet af{" "}
              <span className="font-semibold text-stone-800">{ticket.createdBy.name}</span> · {" "}
              {DETAIL_FORMATTER.format(new Date(ticket.createdAt))}
              {ticket.completedAt ? (
                <>
                  <br />
                  Afsluttet {DETAIL_FORMATTER.format(new Date(ticket.completedAt))}
                </>
              ) : null}
            </div>
          ) : null}
        </form>

        <footer className="sticky bottom-0 mt-auto flex items-center justify-between gap-3 border-t border-stone-200 bg-white px-5 py-3">
          <div className="flex items-center gap-2">
            {!isCreate && userCanDelete ? (
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-60"
              >
                {deleting ? "Sletter…" : "Slet"}
              </button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
            >
              {isFormMode ? "Annuller" : "Luk"}
            </button>
            {isView && userCanEdit ? (
              <button
                type="button"
                onClick={() => onModeChange("edit")}
                className="rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-stone-800"
              >
                Rediger
              </button>
            ) : null}
            {isView && ticket?.status === "done" ? (
              <button
                type="button"
                onClick={() => void quickPatch({ status: "open" }, "Kunne ikke genåbne ticket.")}
                disabled={saving}
                className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-60"
              >
                Genåbn
              </button>
            ) : null}
            {isView && ticket?.status !== "done" ? (
              <>
                <button
                  type="button"
                  onClick={() => void quickPatch({ hiddenFromDailyUntil: "tomorrow" }, "Kunne ikke udskyde ticket.")}
                  disabled={saving}
                  className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100 disabled:opacity-60"
                >
                  Udskyd til i morgen
                </button>
                {ticket?.status !== "in_progress" ? (
                  <button
                    type="button"
                    onClick={() => void quickPatch({ status: "in_progress" }, "Kunne ikke sætte til I gang.")}
                    disabled={saving}
                    className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800 transition hover:bg-blue-100 disabled:opacity-60"
                  >
                    I gang
                  </button>
                ) : null}
                {ticket?.status !== "waiting" ? (
                  <button
                    type="button"
                    onClick={() => void quickPatch({ status: "waiting" }, "Kunne ikke sætte til Afventer.")}
                    disabled={saving}
                    className="rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100 disabled:opacity-60"
                  >
                    Afventer
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void quickPatch({ status: "done" }, "Kunne ikke markere som færdig.")}
                  disabled={saving}
                  className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-60"
                >
                  Færdig
                </button>
              </>
            ) : null}
            {isFormMode ? (
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={saving}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-400"
              >
                {saving ? "Gemmer…" : isCreate ? "Opret" : "Gem"}
              </button>
            ) : null}
          </div>
        </footer>
      </aside>
    </div>
  );
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-600">
        {label}
        {required ? <span className="ml-0.5 text-red-600">*</span> : null}
      </span>
      {children}
    </label>
  );
}
