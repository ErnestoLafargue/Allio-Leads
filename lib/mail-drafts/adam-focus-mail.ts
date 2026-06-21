export const ADAM_FOCUS_DRAFT_ID = "clinics_allio_intro";

export const ADAM_FOCUS_SUBJECT = "Tak for snakken - her er hvad Allio kan gøre for jer";

export const ADAM_FOCUS_MESSAGE = `<!DOCTYPE html>
<html lang="da">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
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
  :root { color-scheme: light only; }
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
  /* Behold lilla stats-panel på mobil/dark mode (gradient + rgba understøttes ikke overalt) */
  .stats-panel { background-color: #6C5CE7 !important; }
  .stats-panel-title { color: #f0ecff !important; }
  .stat-cell-inner { background-color: #7d6aeb !important; }
  .stat-cell-inner p { color: #ffffff !important; }
  .stat-cell-inner .stat-sub { color: #ede8ff !important; }
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
  <!-- bgcolor + solid baggrund først: iOS Mail ignorerer ofte linear-gradient på table -->
  <table role="presentation" class="stats-panel" width="100%" cellpadding="0" cellspacing="0" bgcolor="#6C5CE7" style="background-color:#6C5CE7;background-image:linear-gradient(135deg,#6C5CE7 0%,#8B7BF7 100%);border-radius:12px;border-collapse:separate;">
  <tr>
  <td style="padding: 28px 28px 8px 28px; text-align:center; background-color:#6C5CE7;">
    <p class="stats-panel-title" style="margin:0 0 4px 0; font-size:13px; font-weight:600; color:#f0ecff; text-transform:uppercase; letter-spacing:1px;">Resultater fra vores klinikker</p>
  </td>
  </tr>
  <tr>
  <td style="padding: 0 28px 28px 28px; background-color:#6C5CE7;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td class="stat-box" width="33%" style="padding: 8px; text-align:center; vertical-align:top;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="stat-cell-inner" bgcolor="#7d6aeb" style="background-color:#7d6aeb;border-radius:10px;border-collapse:separate;">
        <tr><td style="padding:16px 8px;">
          <p style="margin:0; font-size:28px; font-weight:800; color:#ffffff;">+15-20</p>
          <p class="stat-sub" style="margin:4px 0 0 0; font-size:12px; color:#ede8ff; line-height:1.4;">ekstra bookinger<br>pr. måned</p>
        </td></tr>
        </table>
      </td>
      <td class="stat-box" width="33%" style="padding: 8px; text-align:center; vertical-align:top;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="stat-cell-inner" bgcolor="#7d6aeb" style="background-color:#7d6aeb;border-radius:10px;border-collapse:separate;">
        <tr><td style="padding:16px 8px;">
          <p style="margin:0; font-size:28px; font-weight:800; color:#ffffff;">+30%</p>
          <p class="stat-sub" style="margin:4px 0 0 0; font-size:12px; color:#ede8ff; line-height:1.4;">mere omsætning<br>uden ekstra ads</p>
        </td></tr>
        </table>
      </td>
      <td class="stat-box" width="33%" style="padding: 8px; text-align:center; vertical-align:top;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="stat-cell-inner" bgcolor="#7d6aeb" style="background-color:#7d6aeb;border-radius:10px;border-collapse:separate;">
        <tr><td style="padding:16px 8px;">
          <p style="margin:0; font-size:28px; font-weight:800; color:#ffffff;">0 kr.</p>
          <p class="stat-sub" style="margin:4px 0 0 0; font-size:12px; color:#ede8ff; line-height:1.4;">brugt på<br>markedsføring</p>
        </td></tr>
        </table>
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

export const adamFocusMailDraft = {
  id: ADAM_FOCUS_DRAFT_ID,
  label: "Adam Fokus Mail",
  subject: ADAM_FOCUS_SUBJECT,
  message: ADAM_FOCUS_MESSAGE,
} as const;
