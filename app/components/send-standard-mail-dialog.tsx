"use client";

import { useEffect, useState } from "react";
import {
  ADAM_FOCUS_DRAFT_ID,
  DEFAULT_MAIL_DRAFT_ID,
  EMPTY_DRAFT_ID,
  MAIL_DRAFTS,
  REACTIVATION_DRAFT_ID,
} from "@/lib/mail-drafts";

function isLikelyHtml(value: string): boolean {
  return /<html|<body|<table|<div|<p|<a\s|<!doctype/i.test(value);
}

type Props = {
  open: boolean;
  fixedFrom: string;
  defaultTo: string;
  defaultSubject?: string;
  defaultMessage?: string;
  saving: boolean;
  errorText: string | null;
  onClose: () => void;
  onSubmit: (payload: { to: string; subject: string; message: string }) => void;
};

export function SendStandardMailDialog({
  open,
  fixedFrom,
  defaultTo,
  defaultSubject = "",
  defaultMessage = "",
  saving,
  errorText,
  onClose,
  onSubmit,
}: Props) {
  const [draftId, setDraftId] = useState<string>(DEFAULT_MAIL_DRAFT_ID);
  const [messageMode, setMessageMode] = useState<"preview" | "html">("preview");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    const initialDraft = MAIL_DRAFTS.find((d) => d.id === DEFAULT_MAIL_DRAFT_ID);
    setDraftId(DEFAULT_MAIL_DRAFT_ID);
    setTo(defaultTo);
    setSubject(initialDraft?.subject || defaultSubject);
    setMessage(initialDraft?.message || defaultMessage);
    setMessageMode("preview");
  }, [open, defaultTo, defaultSubject, defaultMessage]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-mail-title"
      onClick={() => !saving && onClose()}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-stone-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="send-mail-title" className="text-lg font-semibold text-stone-900">
          Send mail
        </h2>

        {errorText && <p className="mt-3 text-sm text-red-600">{errorText}</p>}

        <div className="mt-4 grid grid-cols-1 gap-3">
          <label className="text-xs font-medium text-stone-600">
            Til
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
              placeholder="modtager@firma.dk"
            />
          </label>

          <label className="text-xs font-medium text-stone-600">
            Fra
            <input
              type="text"
              value={fixedFrom}
              disabled
              className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-100 px-3 py-2 text-sm text-stone-700"
            />
          </label>

          <label className="text-xs font-medium text-stone-600">
            Emne
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
              placeholder="Skriv emne…"
            />
          </label>

          <label className="text-xs font-medium text-stone-600">
            Besked
            {isLikelyHtml(message) ? (
              <div className="mt-1 space-y-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMessageMode("preview")}
                    className={`rounded-md px-3 py-1 text-xs font-semibold ${
                      messageMode === "preview"
                        ? "bg-stone-900 text-white"
                        : "border border-stone-300 bg-white text-stone-700"
                    }`}
                  >
                    Forhåndsvisning
                  </button>
                  <button
                    type="button"
                    onClick={() => setMessageMode("html")}
                    className={`rounded-md px-3 py-1 text-xs font-semibold ${
                      messageMode === "html"
                        ? "bg-stone-900 text-white"
                        : "border border-stone-300 bg-white text-stone-700"
                    }`}
                  >
                    HTML-kode
                  </button>
                </div>
                {messageMode === "preview" ? (
                  <iframe
                    title="Mail preview"
                    srcDoc={message}
                    className="h-[24rem] w-full rounded-lg border border-stone-200 bg-white"
                  />
                ) : (
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="h-64 w-full resize-y rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
                    placeholder="Skriv din mail…"
                  />
                )}
              </div>
            ) : (
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="mt-1 h-48 w-full resize-y rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
                placeholder="Skriv din mail…"
              />
            )}
          </label>
        </div>

        <div className="mt-6 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-60"
          >
            Annuller
          </button>
          <label className="mx-2 min-w-0 flex-1 text-xs font-medium text-stone-600">
            Udkast
            <select
              value={draftId}
              disabled={saving}
              onChange={(e) => {
                const nextDraftId = e.target.value;
                setDraftId(nextDraftId);
                const selected = MAIL_DRAFTS.find((d) => d.id === nextDraftId);
                if (!selected) return;
                setSubject(selected.subject);
                setMessage(selected.message);
                setMessageMode(isLikelyHtml(selected.message) ? "preview" : "html");
              }}
              className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2 disabled:bg-stone-100"
            >
              <option value={EMPTY_DRAFT_ID}>Tom mail</option>
              <optgroup label="Klinikker">
                <option value={ADAM_FOCUS_DRAFT_ID}>Adam Fokus Mail</option>
                <option value={REACTIVATION_DRAFT_ID}>Genaktiverings mail</option>
              </optgroup>
            </select>
          </label>
          <button
            type="button"
            disabled={saving || !to.trim() || !subject.trim() || !message.trim()}
            onClick={() => onSubmit({ to: to.trim(), subject: subject.trim(), message: message.trim() })}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-60"
          >
            {saving ? "Sender…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
