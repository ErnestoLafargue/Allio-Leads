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
<title>Allio — Flere bookinger, mindre admin</title>
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

<!-- Preheader (skjult tekst i inbox-preview) -->
<div style="display:none; max-height:0; overflow:hidden; font-size:1px; line-height:1px; color:#f4f4f7;">
  Dine kunder skriver — men hvem svarer, mens du er i behandling? Se hvordan klinikker får 15-20 ekstra bookinger/måned.
</div>

<!-- Wrapper -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;">
<tr>
<td align="center" style="padding: 32px 16px;">

<!-- Email Container -->
<table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">

<!-- ========== LOGO / HEADER ========== -->
<tr>
<td align="center" style="padding: 28px 40px 12px 40px;">
  <span style="font-size: 28px; font-weight: 700; color: #6C5CE7; letter-spacing: -0.5px;">allio</span>
</td>
</tr>

<!-- ========== HERO: PROBLEM ========== -->
<tr>
<td class="hero-section" style="padding: 20px 40px 32px 40px; text-align: center;">
  <h1 style="margin:0 0 16px 0; font-size:26px; font-weight:700; color:#1a1a2e; line-height:1.3;">
    Dine kunder kontakter dig lige nu.<br>
    <span style="color:#6C5CE7;">Men ingen svarer?</span>
  </h1>
  <p style="margin:0; font-size:17px; color:#4a4a68; line-height:1.6;">
    Du sidder midt i en behandling. Telefonen ringer. En ny kunde skriver på Instagram. En anden sender en SMS. Og Messenger blinker.
  </p>
</td>
</tr>

<!-- ========== AGITATE: HVAD DET KOSTER ========== -->
<tr>
<td style="padding: 0 40px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FFF8F0; border-radius:10px; border-left: 4px solid #F0A500;">
  <tr>
  <td class="content-section" style="padding: 24px 28px;">
    <p style="margin:0 0 8px 0; font-size:15px; font-weight:600; color:#D4850A;">Kender du det her?</p>
    <p style="margin:0; font-size:15px; color:#5a4e3a; line-height:1.7;">
      Når du endelig er færdig med behandlingen og tjekker din telefon, får du ikke fat på kunden når du ringer igen. Og SMS'en er glemt. Kunden er allerede videre — og har booket hos en anden. Ikke fordi du er dårligere, men fordi du ikke svarede først.
    </p>
    <p style="margin:12px 0 0 0; font-size:15px; color:#5a4e3a; line-height:1.7;">
      Og de kunder, der kun kom én eller to gange? De kender allerede jeres klinik og har haft tillid nok til at booke før — men uden opfølgning ender de som sovende kontakter i jeres kartotek. Imens bruger I tid og kræfter på at jagte nye kunder, selvom der allerede ligger omsætning gemt i dem, I har haft inde før.
    </p>
  </td>
  </tr>
  </table>
</td>
</tr>

<!-- Spacer -->
<tr><td style="height: 32px;"></td></tr>

<!-- ========== SOLUTION: ALLIO + ADAM ========== -->
<tr>
<td style="padding: 0 40px;">
  <h2 style="margin:0 0 12px 0; font-size:20px; font-weight:700; color:#1a1a2e;">
    Mød Adam — din digitale receptionist
  </h2>
  <p style="margin:0 0 20px 0; font-size:15px; color:#4a4a68; line-height:1.7;">
    Allio samler al din kundekommunikation — SMS, Instagram, Messenger, mail og opkald — i <strong>én indbakke</strong>. Og Adam, din AI-assistent, svarer kunderne med det samme, i din tone, mens du fokuserer på behandlingen.
  </p>
</td>
</tr>

<!-- Feature blocks -->
<tr>
<td style="padding: 0 40px;">
  <!-- Feature 1 -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
  <tr>
  <td width="48" valign="top" style="padding-right:14px;">
    <div style="width:40px; height:40px; background-color:#EDE9FF; border-radius:10px; text-align:center; line-height:40px; font-size:18px;">&#128172;</div>
  </td>
  <td valign="top">
    <p style="margin:0 0 2px 0; font-size:15px; font-weight:600; color:#1a1a2e;">Svar på sekunder, ikke timer</p>
    <p style="margin:0; font-size:14px; color:#6b6b8a; line-height:1.6;">Adam besvarer henvendelser øjeblikkeligt — personligt og relevant. Kunden føler sig set, og du mister ingen.</p>
  </td>
  </tr>
  </table>

  <!-- Feature 2 -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
  <tr>
  <td width="48" valign="top" style="padding-right:14px;">
    <div style="width:40px; height:40px; background-color:#EDE9FF; border-radius:10px; text-align:center; line-height:40px; font-size:18px;">&#128197;</div>
  </td>
  <td valign="top">
    <p style="margin:0 0 2px 0; font-size:15px; font-weight:600; color:#1a1a2e;">Automatisk booking</p>
    <p style="margin:0; font-size:14px; color:#6b6b8a; line-height:1.6;">Adam hjælper kunden med at booke direkte i din kalender — uden at du behøver løfte en finger.</p>
  </td>
  </tr>
  </table>

  <!-- Feature 3 -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:6px;">
  <tr>
  <td width="48" valign="top" style="padding-right:14px;">
    <div style="width:40px; height:40px; background-color:#EDE9FF; border-radius:10px; text-align:center; line-height:40px; font-size:18px;">&#128276;</div>
  </td>
  <td valign="top">
    <p style="margin:0 0 2px 0; font-size:15px; font-weight:600; color:#1a1a2e;">Genaktiver sovende kunder</p>
    <p style="margin:0; font-size:14px; color:#6b6b8a; line-height:1.6;">Adam finder kunder der ikke har været forbi i lang tid og sender dem en personlig SMS — og booker dem ind igen automatisk.</p>
  </td>
  </tr>
  </table>
</td>
</tr>

<!-- Spacer -->
<tr><td style="height: 32px;"></td></tr>

<!-- ========== SOCIAL PROOF: TAL ========== -->
<tr>
<td style="padding: 0 40px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #6C5CE7 0%, #8B7BF7 100%); border-radius:12px;">
  <tr>
  <td style="padding: 28px 28px 8px 28px; text-align:center;">
    <p style="margin:0 0 4px 0; font-size:13px; font-weight:600; color:rgba(255,255,255,0.8); text-transform:uppercase; letter-spacing:1px;">Resultater fra vores klinikker</p>
  </td>
  </tr>
  <tr>
  <td style="padding: 0 28px 28px 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td class="stat-box" width="33%" style="padding: 8px; text-align:center; vertical-align:top;">
        <div style="background:rgba(255,255,255,0.15); border-radius:10px; padding:16px 8px;">
          <p style="margin:0; font-size:28px; font-weight:800; color:#ffffff;">+15-20</p>
          <p style="margin:4px 0 0 0; font-size:12px; color:rgba(255,255,255,0.85); line-height:1.4;">ekstra bookinger<br>pr. måned</p>
        </div>
      </td>
      <td class="stat-box" width="33%" style="padding: 8px; text-align:center; vertical-align:top;">
        <div style="background:rgba(255,255,255,0.15); border-radius:10px; padding:16px 8px;">
          <p style="margin:0; font-size:28px; font-weight:800; color:#ffffff;">+30%</p>
          <p style="margin:4px 0 0 0; font-size:12px; color:rgba(255,255,255,0.85); line-height:1.4;">mere omsætning<br>uden ekstra ads</p>
        </div>
      </td>
      <td class="stat-box" width="33%" style="padding: 8px; text-align:center; vertical-align:top;">
        <div style="background:rgba(255,255,255,0.15); border-radius:10px; padding:16px 8px;">
          <p style="margin:0; font-size:28px; font-weight:800; color:#ffffff;">0 kr.</p>
          <p style="margin:4px 0 0 0; font-size:12px; color:rgba(255,255,255,0.85); line-height:1.4;">brugt på<br>markedsføring</p>
        </div>
      </td>
    </tr>
    </table>
  </td>
  </tr>
  </table>
</td>
</tr>

<!-- Spacer -->
<tr><td style="height: 12px;"></td></tr>

<!-- Testimonial-style quote -->
<tr>
<td style="padding: 12px 40px 0 40px; text-align:center;">
  <p style="margin:0; font-size:14px; color:#6b6b8a; font-style:italic; line-height:1.6;">
    "De fleste klinikker konverterer typisk 50% af nye kunder til faste kunder. Resten ligger som sovende kontakter i dit system. Allio vækker dem — automatisk."
  </p>
</td>
</tr>

<!-- Spacer -->
<tr><td style="height: 36px;"></td></tr>

<!-- ========== INGEN OMVÆLTNING ========== -->
<tr>
<td style="padding: 0 40px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F0FFF4; border-radius:10px; border-left: 4px solid #38B2AC;">
  <tr>
  <td style="padding: 20px 24px;">
    <p style="margin:0 0 4px 0; font-size:15px; font-weight:600; color:#1a6e5c;">Ingen systemer skal skiftes ud</p>
    <p style="margin:0; font-size:14px; color:#3d6b5f; line-height:1.6;">Allio integrerer med de værktøjer du allerede bruger. Tænk på det som et ekstra lag ovenpå — ikke en erstatning. Du er oppe at køre på under en time.</p>
  </td>
  </tr>
  </table>
</td>
</tr>

<!-- Spacer -->
<tr><td style="height: 36px;"></td></tr>

<!-- ========== CTA ========== -->
<tr>
<td align="center" style="padding: 0 40px;">
  <h2 style="margin:0 0 8px 0; font-size:20px; font-weight:700; color:#1a1a2e;">Se hvad Allio kan gøre for din klinik</h2>
  <p style="margin:0 0 24px 0; font-size:15px; color:#6b6b8a;">15 minutter. Ingen forpligtelser. Vi viser dig det hele.</p>

  <!-- Button -->
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
  <tr>
  <td style="border-radius:10px; background-color:#6C5CE7;">
    <a href="https://calendly.com/victor-allio/onboarding" target="_blank" style="display:inline-block; padding:16px 40px; font-size:16px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:10px; letter-spacing:0.2px;">
      Book en demo &rarr;
    </a>
  </td>
  </tr>
  </table>

  <p style="margin:16px 0 0 0; font-size:13px; color:#9b9bb0;">Helt uforpligtende — vi viser dig bare, hvad der er muligt.</p>
</td>
</tr>

<!-- Spacer -->
<tr><td style="height: 40px;"></td></tr>

<!-- ========== FOOTER ========== -->
<tr>
<td style="padding: 24px 40px; background-color:#F8F8FC; border-top: 1px solid #EEEEF2;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
  <tr>
  <td>
    <p style="margin:0 0 4px 0; font-size:14px; font-weight:600; color:#6C5CE7;">allio</p>
    <p style="margin:0; font-size:12px; color:#9b9bb0; line-height:1.5;">
      Én platform. Alle dine kunder. Fuld kalender.<br>
      <a href="https://allio.dk" style="color:#6C5CE7;">allio.dk</a>
    </p>
  </td>
  </tr>
  </table>
</td>
</tr>

</table>
<!-- /Email Container -->
</td>
</tr>
</table>
<!-- /Wrapper -->
</body>
</html>`;

const MAIL_DRAFTS: MailDraft[] = [
  { id: EMPTY_DRAFT_ID, label: "Tom mail", subject: "", message: "" },
  {
    id: CLINIC_DRAFT_ID,
    label: "Mail udkast - Klinikker",
    subject: CLINIC_DEFAULT_SUBJECT,
    message: CLINIC_DEFAULT_MESSAGE,
  },
];

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
  const [draftId, setDraftId] = useState(CLINIC_DRAFT_ID);
  const [messageMode, setMessageMode] = useState<"preview" | "html">("preview");
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
                <option value={CLINIC_DRAFT_ID}>Mail udkast - Klinikker</option>
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
