"use client";

import { useEffect, useState } from "react";

type MailDraft = {
  id: string;
  label: string;
  subject: string;
  message: string;
};

const EMPTY_DRAFT_ID = "empty";
const CLINIC_DRAFT_ID = "clinics_allio_intro";

const CLINIC_DEFAULT_SUBJECT = "Tak for snakken - her er hvad Allio kan gore for jer";

const CLINIC_DEFAULT_MESSAGE = `<!DOCTYPE html>
<html lang="da">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Allio - Flere bookinger, mindre admin</title>
<!--[if mso]>
<noscript>
<xml>
<o:OfficeDocumentSettings>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
</noscript>
<![endif]-->
<style>
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { -ms-interpolation-mode: bicubic; }
  body { margin: 0; padding: 0; width: 100% !important; height: 100% !important; background-color: #f4f4f7; }
  body, td, p {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 1.6;
    color: #1a1a2e;
  }
  a { color: #6C5CE7; text-decoration: none; }
  a:hover { text-decoration: underline; }
  @media only screen and (max-width: 600px) {
    .email-container { width: 100% !important; padding: 0 16px !important; }
    .hero-section { padding: 32px 24px !important; }
    .content-section { padding: 24px !important; }
    .stat-box { display: block !important; width: 100% !important; margin-bottom: 12px !important; }
    h1 { font-size: 24px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f7;">
<div style="display:none; max-height:0; overflow:hidden; font-size:1px; line-height:1px; color:#f4f4f7;">
  Dine kunder skriver - men hvem svarer, mens du er i behandling? Se hvordan klinikker far 15-20 ekstra bookinger/maned.
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;">
<tr>
<td align="center" style="padding: 32px 16px;">
<table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
<tr>
<td align="center" style="padding: 28px 40px 12px 40px;">
  <span style="font-size: 28px; font-weight: 700; color: #6C5CE7; letter-spacing: -0.5px;">allio</span>
</td>
</tr>
<tr>
<td class="hero-section" style="padding: 20px 40px 32px 40px; text-align: center;">
  <h1 style="margin:0 0 16px 0; font-size:26px; font-weight:700; color:#1a1a2e; line-height:1.3;">
    Dine kunder kontakter dig lige nu.<br>
    <span style="color:#6C5CE7;">Men ingen svarer?</span>
  </h1>
  <p style="margin:0; font-size:17px; color:#4a4a68; line-height:1.6;">
    Du sidder midt i en behandling. Telefonen ringer. En ny kunde skriver pa Instagram. En anden sender en SMS. Og Messenger blinker.
  </p>
</td>
</tr>
<tr>
<td style="padding: 0 40px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFF8F0; border-radius:10px; border-left: 4px solid #F0A500;">
  <tr>
  <td class="content-section" style="padding: 24px 28px;">
    <p style="margin:0 0 8px 0; font-size:15px; font-weight:600; color:#D4850A;">Kender du det her?</p>
    <p style="margin:0; font-size:15px; color:#5a4e3a; line-height:1.7;">
      Nar du endelig er faerdig med behandlingen og tjekker din telefon, far du ikke fat pa kunden nar du ringer igen. Og SMS'en er glemt.
      Kunden er allerede videre - og har booket hos en anden.
    </p>
  </td>
  </tr>
  </table>
</td>
</tr>
<tr><td style="height: 32px;"></td></tr>
<tr>
<td style="padding: 0 40px;">
  <h2 style="margin:0 0 12px 0; font-size:20px; font-weight:700; color:#1a1a2e;">Mod Adam - din digitale receptionist</h2>
  <p style="margin:0 0 20px 0; font-size:15px; color:#4a4a68; line-height:1.7;">
    Allio samler al din kundekommunikation - SMS, Instagram, Messenger, mail og opkald - i <strong>en indbakke</strong>.
    Adam, din AI-assistent, svarer kunderne med det samme, i din tone, mens du fokuserer pa behandlingen.
  </p>
</td>
</tr>
<tr>
<td align="center" style="padding: 0 40px;">
  <h2 style="margin:0 0 8px 0; font-size:20px; font-weight:700; color:#1a1a2e;">Se hvad Allio kan gore for din klinik</h2>
  <p style="margin:0 0 24px 0; font-size:15px; color:#6b6b8a;">15 minutter. Ingen forpligtelser. Vi viser dig det hele.</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
  <tr>
  <td style="border-radius:10px; background-color:#6C5CE7;">
    <a href="https://calendly.com/victor-allio/onboarding" target="_blank" style="display:inline-block; padding:16px 40px; font-size:16px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:10px; letter-spacing:0.2px;">
      Book en demo ->
    </a>
  </td>
  </tr>
  </table>
</td>
</tr>
<tr><td style="height: 40px;"></td></tr>
<tr>
<td style="padding: 24px 40px; background-color:#F8F8FC; border-top: 1px solid #EEEEF2;">
  <p style="margin:0 0 4px 0; font-size:14px; font-weight:600; color:#6C5CE7;">allio</p>
  <p style="margin:0; font-size:12px; color:#9b9bb0; line-height:1.5;">
    En platform. Alle dine kunder. Fuld kalender.<br>
    <a href="https://allio.dk" style="color:#6C5CE7;">allio.dk</a>
  </p>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;

const MAIL_DRAFTS: MailDraft[] = [
  { id: EMPTY_DRAFT_ID, label: "Tom mail", subject: "", message: "" },
  {
    id: CLINIC_DRAFT_ID,
    label: "Klinikker - Tak for snakken",
    subject: CLINIC_DEFAULT_SUBJECT,
    message: CLINIC_DEFAULT_MESSAGE,
  },
];

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
  const [draftId, setDraftId] = useState(CLINIC_DRAFT_ID);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    const initialDraft = MAIL_DRAFTS.find((d) => d.id === CLINIC_DRAFT_ID);
    setDraftId(CLINIC_DRAFT_ID);
    setTo(defaultTo);
    setSubject(initialDraft?.subject || defaultSubject);
    setMessage(initialDraft?.message || defaultMessage);
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
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="mt-1 h-48 w-full resize-y rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2"
              placeholder="Skriv din mail…"
            />
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
              }}
              className="mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm outline-none ring-stone-400 focus:ring-2 disabled:bg-stone-100"
            >
              <option value={EMPTY_DRAFT_ID}>Tom mail</option>
              <optgroup label="Klinikker">
                <option value={CLINIC_DRAFT_ID}>Tak for snakken - her er hvad Allio kan gore for jer</option>
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
