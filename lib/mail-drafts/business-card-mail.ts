import { ALLIO_LOGO_PUBLIC_URL } from "./client-edition-mail";
import { MAIL_PLACEHOLDERS as P } from "./personalize";

export const BUSINESS_CARD_DRAFT_ID = "clinics_business_card";

export const BUSINESS_CARD_SUBJECT = "Tak for snakken – her er mine kontaktoplysninger";

/** Kort «visitkort»: tak for samtalen, kontaktoplysninger og tre sætninger om Allio. Samme design som de andre. */
export const BUSINESS_CARD_MESSAGE = `<!DOCTYPE html>
<html lang="da">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>Allio – Tak for snakken</title>

<style>
  body {
    margin: 0 !important;
    padding: 0 !important;
    background: #F3F0ED !important;
    font-family: Arial, Helvetica, sans-serif;
  }
  table { border-spacing: 0; }
  img { border: 0; outline: none; }
  a { text-decoration: none; }

  @media only screen and (max-width: 640px) {
    .email-container {
      width: 100% !important;
      max-width: 100% !important;
    }
    .padding-x {
      padding-left: 25px !important;
      padding-right: 25px !important;
    }
    .hero-pad {
      padding: 40px 25px 36px !important;
    }
    .headline {
      font-size: 36px !important;
      line-height: 1.12 !important;
    }
    .card-pad {
      padding: 24px 22px !important;
    }
  }
</style>
</head>

<body style="margin:0;padding:0;background:#F3F0ED;">

<table role="presentation" width="100%"
  cellpadding="0" cellspacing="0"
  bgcolor="#F3F0ED">
<tr>
<td align="center" style="padding:35px 12px 45px;">

<table role="presentation"
  class="email-container"
  width="640"
  cellpadding="0"
  cellspacing="0"
  style="width:640px;max-width:640px;background:#FFFEFC;">

<!-- LOGO -->
<tr>
<td class="padding-x"
  style="padding:26px 43px;background:#FFFEFC;">

<table role="presentation">
<tr>
<td style="padding-right:10px;">
<img
  src="${ALLIO_LOGO_PUBLIC_URL}"
  alt="Allio"
  width="29"
  height="28"
  style="display:block;width:29px;height:28px;border:0;">
</td>
<td style="
  font-family:Arial,Helvetica,sans-serif;
  font-size:25px;
  font-weight:600;
  letter-spacing:-1.2px;
  color:#39252D;">
Allio
</td>
</tr>
</table>

</td>
</tr>

<!-- HERO -->
<tr>
<td class="hero-pad"
  bgcolor="#372731"
  style="padding:50px 44px 44px;background:#372731;">

<p style="
  margin:0 0 22px;
  color:#E2C9C9;
  font-size:10px;
  letter-spacing:2.8px;">
ALLIO &nbsp;/&nbsp; FOR KLINIKKER
</p>

<h1 class="headline" style="
  margin:0;
  font-family:Georgia,'Times New Roman',serif;
  font-size:44px;
  line-height:1.13;
  font-weight:normal;
  letter-spacing:-1.5px;
  color:#FFF9F5;">
Tak for snakken.<br>
<span style="color:#E8BCC4;font-style:italic;">
Du kan altid fange mig.
</span>
</h1>

</td>
</tr>

<!-- TAK -->
<tr>
<td class="padding-x"
  style="padding:40px 45px 8px;">

<h2 style="
  margin:0 0 14px;
  font-family:Georgia,'Times New Roman',serif;
  font-size:24px;
  font-weight:normal;
  color:#382831;">
${P.greeting}
</h2>

<p style="
  margin:0;
  font-size:14px;
  line-height:24px;
  color:#51484B;">
Tak for en god snak – det var rart at høre om
<strong>${P.companyName}</strong>. Her er mine oplysninger,
så du nemt kan fange mig, hvis du får spørgsmål
eller vil høre mere.
</p>

</td>
</tr>

<!-- VISITKORT -->
<tr>
<td class="padding-x"
  style="padding:28px 45px 36px;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td class="card-pad" bgcolor="#F7F1EF"
  style="padding:28px 30px;background:#F7F1EF;border-left:2px solid #AB7480;">

<p style="
  margin:0 0 4px;
  font-family:Georgia,serif;
  font-size:24px;
  line-height:30px;
  color:#382831;">
${P.senderName}
</p>

<p style="
  margin:0 0 20px;
  font-size:10px;
  letter-spacing:1.8px;
  color:#9C717C;">
ALLIO
</p>

<table role="presentation" cellpadding="0" cellspacing="0">
<tr>
<td width="74" valign="top"
  style="padding:0 0 10px;font-size:10px;letter-spacing:1.6px;line-height:22px;color:#A2737C;">
TELEFON
</td>
<td style="padding:0 0 10px;font-size:15px;line-height:22px;">
<a href="tel:+4553577020" style="color:#39252D;text-decoration:none;">
+45 53 57 70 20
</a>
</td>
</tr>
<tr>
<td width="74" valign="top"
  style="padding:0 0 10px;font-size:10px;letter-spacing:1.6px;line-height:22px;color:#A2737C;">
MAIL
</td>
<td style="padding:0 0 10px;font-size:15px;line-height:22px;">
<a href="mailto:${P.senderEmail}" style="color:#39252D;text-decoration:none;">
${P.senderEmail}
</a>
</td>
</tr>
<tr>
<td width="74" valign="top"
  style="font-size:10px;letter-spacing:1.6px;line-height:22px;color:#A2737C;">
WEB
</td>
<td style="font-size:15px;line-height:22px;">
<a href="https://allio.dk" style="color:#94606E;text-decoration:underline;">
www.allio.dk
</a>
</td>
</tr>
</table>

</td>
</tr>
</table>

</td>
</tr>

<!-- KORT OM ALLIO -->
<tr>
<td class="padding-x"
  bgcolor="#FAF6F4"
  style="padding:34px 45px 36px;background:#FAF6F4;">

<p style="
  margin:0 0 12px;
  font-size:10px;
  font-weight:bold;
  letter-spacing:2.4px;
  color:#A2737C;">
KORT OM ALLIO
</p>

<p style="
  margin:0 0 10px;
  font-size:14px;
  line-height:23px;
  color:#51484B;">
<strong style="color:#39252D;">Fastholdelse:</strong>
Vi holder fast i de kunder, klinikken allerede har,
så langt færre forsvinder i stilhed.
</p>

<p style="
  margin:0 0 10px;
  font-size:14px;
  line-height:23px;
  color:#51484B;">
<strong style="color:#39252D;">Genaktivering:</strong>
Op mod halvdelen af et kartotek ligger typisk stille
– vi henter dem tilbage i kalenderen, måned efter måned.
</p>

<p style="
  margin:0;
  font-size:14px;
  line-height:23px;
  color:#51484B;">
<strong style="color:#39252D;">Vækst og loyalitet:</strong>
Faste kunder kommer oftere og lægger mere i klinikken
– og det mærkes tydeligt på årets omsætning.
</p>

</td>
</tr>

<!-- HILSEN -->
<tr>
<td class="padding-x"
  style="padding:30px 45px 22px;">

<p style="
  margin:0 0 6px;
  font-size:13px;
  line-height:21px;
  color:#5F5357;">
Ring eller skriv, når det passer dig.
</p>

<p style="
  margin:0;
  font-family:Georgia,serif;
  font-size:19px;
  color:#382831;">
${P.senderName}
</p>

</td>
</tr>

<!-- FOOTER -->
<tr>
<td class="padding-x"
  style="padding:5px 45px 28px;">

<div style="
  height:1px;
  background:#E8DFDD;">
</div>

<p style="
  margin:16px 0 0;
  font-size:10px;
  color:#998E90;">
Allio · Bedre kunderelationer. Mere vækst.
</p>

</td>
</tr>

</table>
</td>
</tr>
</table>

</body>
</html>`;

export const businessCardMailDraft = {
  id: BUSINESS_CARD_DRAFT_ID,
  label: "Visitkort mail",
  subject: BUSINESS_CARD_SUBJECT,
  message: BUSINESS_CARD_MESSAGE,
} as const;
