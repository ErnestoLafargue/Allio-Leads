import { MAIL_PLACEHOLDERS as P } from "./personalize";

export const CLIENT_EDITION_DRAFT_ID = "clinics_client_edition";

export const CLIENT_EDITION_SUBJECT = "Tak for snakken – en kort introduktion til Allio";

/** Skal være offentligt tilgængelig, da mailklienter henter billedet udefra. */
export const ALLIO_LOGO_PUBLIC_URL = "https://allio-leads.vercel.app/allio-logo-mail.png";

export const CLIENT_EDITION_MESSAGE = `<!DOCTYPE html>
<html lang="da">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>Allio – Mere værdi af hver kunderelation</title>

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
      padding: 43px 25px 39px !important;
    }
    .headline {
      font-size: 39px !important;
      line-height: 1.12 !important;
    }
    .body-title {
      font-size: 32px !important;
    }
    .stack {
      display: block !important;
      width: 100% !important;
      box-sizing: border-box !important;
      padding-right: 0 !important;
    }
    .stack-space {
      padding-top: 13px !important;
      padding-left: 0 !important;
    }
    .box-col {
      display: block !important;
      width: 100% !important;
      box-sizing: border-box !important;
    }
    .box-gap {
      display: block !important;
      width: 100% !important;
      height: 13px !important;
    }
    .three-col {
      display: block !important;
      width: 100% !important;
      border-right: 0 !important;
      padding: 0 0 20px !important;
    }
    .three-col-last {
      display: block !important;
      width: 100% !important;
      padding: 0 !important;
    }
    .button-link {
      display: block !important;
      text-align: center !important;
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

<table role="presentation" width="100%">
<tr>
<td align="left" valign="middle">

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
</table>

</td>
</tr>

<!-- HERO -->
<tr>
<td class="hero-pad"
  bgcolor="#372731"
  style="padding:58px 44px 50px;background:#372731;">

<p style="
  margin:0 0 24px;
  color:#E2C9C9;
  font-size:10px;
  letter-spacing:2.8px;">
ALLIO &nbsp;/&nbsp; FOR KLINIKKER
</p>

<h1 class="headline" style="
  margin:0 0 23px;
  font-family:Georgia,'Times New Roman',serif;
  font-size:49px;
  line-height:1.13;
  font-weight:normal;
  letter-spacing:-1.7px;
  color:#FFF9F5;">
Samme kunder.<br>
<span style="color:#E8BCC4;font-style:italic;">
Mere omsætning.
</span>
</h1>

<p style="
  margin:0 0 30px;
  font-size:15px;
  line-height:25px;
  color:#E5DADC;">
Flere genbookinger, mere mersalg og færre kunder,
der forsvinder i stilhed. Vækst bygget på de
relationer, I allerede har skabt.
</p>

<div style="height:1px;background:#876B75;"></div>

<p style="
  margin:17px 0 0;
  font-size:10px;
  letter-spacing:2px;
  line-height:18px;
  color:#D5C1C5;">
FASTHOLDELSE &nbsp; · &nbsp;
GENAKTIVERING &nbsp; · &nbsp; VÆKST
</p>

</td>
</tr>

<!-- INTRO -->
<tr>
<td class="padding-x"
  style="padding:43px 45px;">

<h2 style="
  margin:0 0 16px;
  font-family:Georgia,'Times New Roman',serif;
  font-size:25px;
  font-weight:normal;
  color:#382831;">
${P.greeting}
</h2>

<p style="
  margin:0 0 15px;
  font-size:14px;
  line-height:24px;
  color:#51484B;">
Tak for en god snak. Som aftalt sender jeg
en kort introduktion til Allio – hvad vi hjælper
klinikker med, hvordan samarbejdet fungerer,
og hvilke resultater det kan skabe.
</p>

<p style="
  margin:0;
  font-size:14px;
  line-height:24px;
  color:#51484B;">
For <strong>${P.companyName}</strong> handler det
ikke nødvendigvis om at tiltrække flere nye
kunder. Det kan være mindst lige så interessant
at få mere ud af de kunder, I allerede har.
</p>

<!-- INTEGRATION -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:26px;">
<tr>
<td bgcolor="#F7F1EF"
  style="padding:20px 22px;background:#F7F1EF;border-left:2px solid #AB7480;">

<p style="
  margin:0 0 8px;
  font-size:10px;
  font-weight:bold;
  letter-spacing:2px;
  color:#A2737C;">
VI INTEGRERER MED JERES SYSTEM
</p>

<h3 style="
  margin:0 0 8px;
  font-family:Georgia,serif;
  font-size:20px;
  font-weight:normal;
  color:#39252D;">
Vi arbejder med det, I bruger i dag.
</h3>

<p style="
  margin:0;
  font-size:13px;
  line-height:22px;
  color:#5C5355;">
Allio integreres med jeres nuværende bookingsystem
– om det er GeckoBooking, Onlinebooq, Bookee eller
et andet. Så kan vi komme i gang med det samme, med
udgangspunkt i de kunder og den data, I allerede har.
</p>

</td>
</tr>
</table>

</td>
</tr>

<!-- YDELSER -->
<tr>
<td class="padding-x"
  bgcolor="#FAF6F4"
  style="padding:40px 45px 20px;background:#FAF6F4;">

<p style="
  margin:0 0 13px;
  font-size:10px;
  font-weight:bold;
  letter-spacing:2.4px;
  color:#A2737C;">
01 &nbsp;/&nbsp; HVAD VI HJÆLPER MED
</p>

<h2 class="body-title" style="
  margin:0;
  font-family:Georgia,'Times New Roman',serif;
  font-size:35px;
  font-weight:normal;
  line-height:1.17;
  color:#39252D;">
Fra første besøg<br>
til <em style="color:#94606E;">
langvarig loyalitet.</em>
</h2>

</td>
</tr>

<tr>
<td class="padding-x"
  bgcolor="#FAF6F4"
  style="padding:15px 45px 43px;background:#FAF6F4;">

<!-- SERVICE 1 -->
<table role="presentation" width="100%">
<tr>
<td style="border-top:1px solid #E5D5D4;padding:23px 0;">
<table role="presentation" width="100%">
<tr>
<td width="49" valign="top"
  style="font-family:Georgia,serif;font-size:22px;color:#B78C91;">
01
</td>
<td>
<h3 style="
  margin:0 0 7px;
  font-family:Georgia,serif;
  font-size:22px;
  font-weight:normal;
  color:#39252D;">
Behold de kunder, I allerede har
</h3>

<p style="
  margin:0;
  font-size:13px;
  line-height:22px;
  color:#61575A;">
Allio analyserer besøgsfrekvensen og kan
følge op, når en kunde begynder at komme
sjældnere end normalt – før relationen går tabt.
</p>
</td>
</tr>
</table>
</td>
</tr>

<!-- SERVICE 2 -->
<tr>
<td style="border-top:1px solid #E5D5D4;padding:23px 0;">
<table role="presentation" width="100%">
<tr>
<td width="49" valign="top"
  style="font-family:Georgia,serif;font-size:22px;color:#B78C91;">
02
</td>
<td>
<h3 style="
  margin:0 0 7px;
  font-family:Georgia,serif;
  font-size:22px;
  font-weight:normal;
  color:#39252D;">
Få tidligere kunder tilbage
</h3>

<p style="
  margin:0;
  font-size:13px;
  line-height:22px;
  color:#61575A;">
Vi identificerer relevante inaktive kunder
og hjælper med personlige, målrettede
SMS-kampagner, der gør det nemt at booke igen.
</p>
</td>
</tr>
</table>
</td>
</tr>

<!-- SERVICE 3 -->
<tr>
<td style="border-top:1px solid #E5D5D4;padding:23px 0;">
<table role="presentation" width="100%">
<tr>
<td width="49" valign="top"
  style="font-family:Georgia,serif;font-size:22px;color:#B78C91;">
03
</td>
<td>
<h3 style="
  margin:0 0 7px;
  font-family:Georgia,serif;
  font-size:22px;
  font-weight:normal;
  color:#39252D;">
Mersalg, der følger kunden
</h3>

<p style="
  margin:0;
  font-size:13px;
  line-height:22px;
  color:#61575A;">
Når en kunde har købt et produkt, ved vi, hvornår
det typisk slipper op. Ved kundens næste booking får
jeres medarbejder en diskret påmindelse – så produktet
kan tilbydes som en del af god service, og omsætningen
pr. kunde stiger.
</p>
</td>
</tr>
</table>
</td>
</tr>
</table>

<!-- SEKUNDÆRE FUNKTIONER: kasserne er celler i samme række, så de altid er lige høje på computer -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>

<td class="box-col" width="48%" valign="top" bgcolor="#EFE4E3"
  style="padding:23px 20px;background:#EFE4E3;">

<p style="font-size:10px;letter-spacing:1.6px;color:#906572;">
SYNLIGHED
</p>

<h3 style="
  font-family:Georgia,serif;
  font-size:20px;
  font-weight:normal;
  color:#39252D;">
Flere Google-anmeldelser
</h3>

<p style="
  margin:0;
  font-size:12px;
  line-height:20px;
  color:#605458;">
Automatiske, neutrale invitationer efter
besøg gør det nemt at dele en ægte oplevelse.
</p>

</td>

<td class="box-gap" width="14" style="width:14px;font-size:0;line-height:0;">&nbsp;</td>

<td class="box-col" width="48%" valign="top" bgcolor="#EFE4E3"
  style="padding:23px 20px;background:#EFE4E3;">

<p style="font-size:10px;letter-spacing:1.6px;color:#906572;">
ALTID TILGÆNGELIG
</p>

<h3 style="
  font-family:Georgia,serif;
  font-size:20px;
  font-weight:normal;
  color:#39252D;">
AI-klinikassistent
</h3>

<p style="
  margin:0;
  font-size:12px;
  line-height:20px;
  color:#605458;">
Besvarer henvendelser på telefon, SMS,
mail og sociale medier – og hjælper nye
og eksisterende kunder til en booking, når
I har lukket, holder ferie eller står i behandling.
</p>

</td>

</tr>
</table>

</td>
</tr>

<!-- RESULTATER -->
<tr>
<td class="padding-x"
  style="padding:44px 45px 17px;">

<p style="
  margin:0 0 10px;
  font-size:10px;
  font-weight:bold;
  letter-spacing:2.4px;
  color:#A2737C;">
02 &nbsp;/&nbsp; RESULTATER I PRAKSIS
</p>

<h2 class="body-title" style="
  margin:0 0 12px;
  font-family:Georgia,serif;
  font-size:34px;
  font-weight:normal;
  color:#39252D;">
Når relationer bliver<br>
<em style="color:#94606E;">til nye bookinger.</em>
</h2>

<p style="font-size:13px;line-height:22px;color:#655A5D;">
To eksempler fra tidligere genaktiveringskampagner:
</p>

</td>
</tr>

<tr>
<td class="padding-x"
  style="padding:0 45px 15px;">

<table role="presentation" width="100%">
<tr>

<!-- CASE ODENSE -->
<td class="stack" width="50%" valign="top"
  style="padding-right:7px;">
<table role="presentation" width="100%">
<tr>
<td bgcolor="#F7F1EF"
  style="padding:22px 21px;background:#F7F1EF;border-top:2px solid #AB7480;">

<p style="
  margin:0 0 13px;
  font-size:10px;
  letter-spacing:1.6px;
  color:#99737B;">
KLINIK I ODENSE
</p>

<p style="
  margin:0;
  font-family:Georgia,serif;
  font-size:43px;
  color:#382630;">
49
</p>

<p style="font-size:12px;line-height:20px;color:#6B5C61;">
bookinger fra 348 kontaktede kunder
</p>

<p style="font-size:15px;font-weight:bold;color:#39252D;">
38.400 kr.
<span style="font-weight:normal;color:#6A5B60;">
omsætning
</span>
</p>

</td>
</tr>
</table>
</td>

<!-- CASE RANDERS -->
<td class="stack stack-space" width="50%" valign="top"
  style="padding-left:7px;">
<table role="presentation" width="100%">
<tr>
<td bgcolor="#F7F1EF"
  style="padding:22px 21px;background:#F7F1EF;border-top:2px solid #AB7480;">

<p style="
  margin:0 0 13px;
  font-size:10px;
  letter-spacing:1.6px;
  color:#99737B;">
KLINIK I RANDERS
</p>

<p style="
  margin:0;
  font-family:Georgia,serif;
  font-size:43px;
  color:#382630;">
27
</p>

<p style="font-size:12px;line-height:20px;color:#6B5C61;">
bookinger fra 196 kontaktede kunder
</p>

<p style="font-size:15px;font-weight:bold;color:#39252D;">
43.049 kr.
<span style="font-weight:normal;color:#6A5B60;">
omsætning
</span>
</p>

</td>
</tr>
</table>
</td>

</tr>
</table>

</td>
</tr>

<tr>
<td class="padding-x" style="padding:0 45px 44px;">
<p style="
  margin:0;
  color:#877B7F;
  font-size:11px;
  line-height:18px;">
Resultater fra individuelle kampagner.
Andre klinikkers resultater kan variere og
er ikke en garanti for tilsvarende effekt.
</p>
</td>
</tr>

<!-- FORVENTNINGER -->
<tr>
<td class="padding-x"
  bgcolor="#F0E4E3"
  style="padding:39px 45px 36px;background:#F0E4E3;">

<p style="
  margin:0 0 10px;
  color:#8C5E6C;
  font-size:10px;
  font-weight:bold;
  letter-spacing:2.4px;">
03 &nbsp;/&nbsp; VORES MÅLSÆTNINGER
</p>

<h2 style="
  margin:0 0 24px;
  font-family:Georgia,serif;
  font-size:27px;
  font-weight:normal;
  color:#39252D;">
Hvad kan en etableret klinik sigte efter?
</h2>

<table role="presentation" width="100%">
<tr>

<td class="three-col" width="33%"
  valign="top"
  style="padding-right:13px;border-right:1px solid #DCC8C8;">
<p style="
  margin:0 0 5px;
  font-family:Georgia,serif;
  font-size:34px;
  color:#39252D;">
6–12 %
</p>
<p style="font-size:11px;line-height:17px;color:#6C5960;">
Bookingrate blandt kontaktede,
relevante inaktive kunder
</p>
</td>

<td class="three-col" width="33%"
  valign="top"
  style="padding:0 13px;border-right:1px solid #DCC8C8;">
<p style="
  margin:0 0 5px;
  font-family:Georgia,serif;
  font-size:34px;
  color:#39252D;">
10–30
</p>
<p style="font-size:11px;line-height:17px;color:#6C5960;">
Ekstra bookinger om måneden
som muligt mål
</p>
</td>

<td class="three-col-last" width="34%"
  valign="top" style="padding-left:13px;">
<p style="
  margin:0 0 5px;
  font-family:Georgia,serif;
  font-size:34px;
  color:#39252D;">
20–30
</p>
<p style="font-size:11px;line-height:17px;color:#6C5960;">
Nye Google-anmeldelser
om måneden som muligt mål
</p>
</td>

</tr>
</table>

<p style="
  margin:20px 0 0;
  color:#78676C;
  font-size:11px;
  line-height:18px;">
Dette er indledende målsætninger – ikke løfter.
Mulighederne afhænger blandt andet af kundebasens
størrelse, kontaktgrundlag og antal besøg.
Vi vurderer dem ud fra jeres egne data.
</p>

</td>
</tr>

<!-- SAMARBEJDE -->
<tr>
<td class="padding-x"
  style="padding:41px 45px 39px;">

<p style="
  margin:0 0 11px;
  font-size:10px;
  font-weight:bold;
  letter-spacing:2.4px;
  color:#A2737C;">
04 &nbsp;/&nbsp; SÅDAN SAMARBEJDER VI
</p>

<h2 class="body-title" style="
  margin:0 0 16px;
  font-family:Georgia,serif;
  font-size:33px;
  font-weight:normal;
  line-height:1.17;
  color:#39252D;">
Strategi og udførelse.<br>
<em style="color:#94606E;">Ikke bare software.</em>
</h2>

<p style="
  margin:0 0 26px;
  font-size:14px;
  line-height:24px;
  color:#51484B;">
Et bookingsystem giver jer typisk et par værktøjer
– lidt som et IKEA-køkken, der bliver leveret med
få dele i kasser, som I selv skal bygge. Med Allio får I
et fuldt udstyret køkken, sat op og klar – med en
kok, der laver maden, følger med i, hvad gæsterne
bedst kan lide, og løbende tilpasser menuen efter sæsonen.
</p>

<table role="presentation" width="100%">

<tr>
<td width="37" valign="top"
  style="font-family:Georgia,serif;font-size:18px;color:#AB7580;">
I.
</td>
<td style="padding-bottom:17px;font-size:13px;line-height:21px;color:#5C5355;">
<strong>Vi skaber overblik</strong> over kunder,
besøgsmønstre og muligheder i jeres
eksisterende bookingsystem.
</td>
</tr>

<tr>
<td valign="top"
  style="font-family:Georgia,serif;font-size:18px;color:#AB7580;">
II.
</td>
<td style="padding-bottom:17px;font-size:13px;line-height:21px;color:#5C5355;">
<strong>Vi bygger en relevant plan</strong>
for fastholdelse, kampagner,
genaktivering og anmeldelser.
</td>
</tr>

<tr>
<td valign="top"
  style="font-family:Georgia,serif;font-size:18px;color:#AB7580;">
III.
</td>
<td style="font-size:13px;line-height:21px;color:#5C5355;">
<strong>Vi hjælper med at udføre og optimere</strong>,
så det ikke bliver endnu en stor opgave
for jeres team.
</td>
</tr>

</table>

<p style="
  margin:22px 0 0;
  border-top:1px solid #E8DFDD;
  padding-top:18px;
  font-size:12px;
  line-height:20px;
  color:#807377;">
Kampagner og databehandling tilrettelægges efter
relevante samtykker, adgangsforhold og aftaler.
</p>

</td>
</tr>

<!-- PRIS -->
<tr>
<td class="padding-x"
  bgcolor="#F7F1EF"
  style="padding:34px 45px 30px;background:#F7F1EF;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>

<td valign="top" style="padding-right:18px;">
<p style="
  margin:0 0 9px;
  font-size:10px;
  letter-spacing:2px;
  color:#8C6C75;">
ALLIO KOMPLET
</p>
<p style="margin:0;font-size:13px;line-height:21px;color:#39252D;">
Platform, strategi og hjælp til kampagner
</p>
</td>

<td align="right" valign="top"
  style="white-space:nowrap;">
<p style="
  margin:0 0 4px;
  font-family:Georgia,serif;
  font-size:26px;
  line-height:30px;
  color:#39252D;">
2.500 kr.
</p>
<p style="margin:0;font-size:11px;color:#796A6F;">
pr. lokation / 4 uger
</p>
</td>

</tr>
</table>

<div style="height:1px;margin:26px 0 18px;background:#E8DCDA;line-height:1px;font-size:0;">&nbsp;</div>

<p style="
  margin:0 0 6px;
  font-family:Georgia,serif;
  font-style:italic;
  font-size:12px;
  line-height:16px;
  color:#94606E;">
Vi tager ikke alle klinikker ind.
</p>
<p style="
  margin:0;
  max-width:360px;
  font-size:10px;
  line-height:16px;
  letter-spacing:0.2px;
  color:#9A8D91;">
Vi samarbejder kun, hvor vi kan se et reelt potentiale,
og kundegrundlaget skal have en vis størrelse. Derfor kommer
vi altid forbi og vurderer jeres data, før vi indgår en aftale.
</p>

</td>
</tr>

<!-- CTA -->
<tr>
<td class="hero-pad"
  bgcolor="#372731"
  style="padding:46px 45px;background:#372731;">

<p style="
  margin:0 0 12px;
  font-size:10px;
  letter-spacing:2.4px;
  color:#DFC5CA;">
EN PERSONLIG INVITATION
</p>

<h2 style="
  margin:0 0 15px;
  font-family:Georgia,serif;
  font-size:33px;
  font-weight:normal;
  line-height:1.2;
  color:#FFF9F5;">
Se mulighederne i<br>
<em style="color:#E8BCC4;">
jeres egne kundedata.
</em>
</h2>

<p style="
  margin:0 0 25px;
  font-size:13px;
  line-height:22px;
  color:#E2D5D9;">
Vi kommer gerne forbi til en uforpligtende
gennemgang på cirka en time. Her ser vi på
jeres muligheder og viser, hvordan Allio
fungerer i praksis.
</p>

<table role="presentation">
<tr>
<td bgcolor="#F3E7E2"
  style="background:#F3E7E2;text-align:center;">

<a class="button-link"
  href="https://calendar.app.google/pojTzzLC2h3qXB56A"
  target="_blank"
  style="
    display:inline-block;
    padding:17px 23px;
    font-family:Arial,Helvetica,sans-serif;
    font-size:12px;
    font-weight:bold;
    color:#39252D;
    text-decoration:none;">
Aftal en uforpligtende gennemgang &nbsp; →
</a>

</td>
</tr>
</table>

<p style="
  margin:17px 0 0;
  font-size:11px;
  color:#BDA6AE;">
I kan også blot svare direkte på denne mail.
</p>

</td>
</tr>

<!-- SIGNATUR -->
<tr>
<td class="padding-x"
  style="padding:33px 45px 19px;">

<p style="
  margin:0 0 17px;
  font-size:13px;
  color:#5F5357;">
Jeg glæder mig til at høre fra jer.
</p>

<p style="
  margin:0 0 3px;
  font-family:Georgia,serif;
  font-size:21px;
  color:#382831;">
${P.senderName}
</p>

<p style="
  margin:0 0 6px;
  font-size:10px;
  letter-spacing:1.7px;
  color:#9C717C;">
ALLIO
</p>

<p style="
  margin:0;
  font-size:12px;
  line-height:21px;
  color:#665B5F;">

<a href="tel:+4553577020"
  style="color:#665B5F;">
+45 53 57 70 20
</a>

&nbsp; · &nbsp;

<a href="mailto:${P.senderEmail}"
  style="color:#665B5F;">
${P.senderEmail}
</a>

<br>

<a href="https://allio.dk"
  style="color:#94606E;text-decoration:underline;">
www.allio.dk
</a>

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

export const clientEditionMailDraft = {
  id: CLIENT_EDITION_DRAFT_ID,
  label: "Klinik intro mail",
  subject: CLIENT_EDITION_SUBJECT,
  message: CLIENT_EDITION_MESSAGE,
} as const;
