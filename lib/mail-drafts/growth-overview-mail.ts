import { ALLIO_LOGO_PUBLIC_URL } from "./client-edition-mail";
import { MAIL_PLACEHOLDERS as P } from "./personalize";

export const GROWTH_OVERVIEW_DRAFT_ID = "clinics_growth_overview";

export const GROWTH_OVERVIEW_SUBJECT = "Tak for snakken – sådan får I mere ud af jeres kunder";

/** Samme design som Klinik intro mail, bygget op om de fire områder + tre cases. */
export const GROWTH_OVERVIEW_MESSAGE = `<!DOCTYPE html>
<html lang="da">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>Allio – Samme kunder. Mere omsætning.</title>

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
    .stat-num {
      font-size: 54px !important;
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
Genaktivering, fastholdelse, mersalg og anmeldelser
– fire områder, der tilsammen typisk løfter den
årlige omsætning og skaber flere kunder i kalenderen.
</p>

<div style="height:1px;background:#876B75;"></div>

<p style="
  margin:17px 0 0;
  font-size:10px;
  letter-spacing:2px;
  line-height:18px;
  color:#D5C1C5;">
GENAKTIVERING &nbsp; · &nbsp; FASTHOLDELSE &nbsp; · &nbsp;
MERSALG &nbsp; · &nbsp; ANMELDELSER
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
Tak for en god snak. Som aftalt får du her et kort
overblik over de fire områder, hvor vi typisk skaber
mest værdi for klinikker – og hvad det har givet
andre klinikker.
</p>

<p style="
  margin:0;
  font-size:14px;
  line-height:24px;
  color:#51484B;">
For <strong>${P.companyName}</strong> handler det
ikke nødvendigvis om at tiltrække flere nye kunder.
Den største vækst ligger ofte i de kunder, I allerede har.
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
Allio integreres direkte med ${P.bookingSystem}, så vi kan
komme i gang med det samme – med udgangspunkt i de
kunder og den data, I allerede har.
</p>

</td>
</tr>
</table>

</td>
</tr>

<!-- FIRE OMRÅDER -->
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
01 &nbsp;/&nbsp; DET GØR VI
</p>

<h2 class="body-title" style="
  margin:0;
  font-family:Georgia,'Times New Roman',serif;
  font-size:35px;
  font-weight:normal;
  line-height:1.17;
  color:#39252D;">
Fire områder.<br>
<em style="color:#94606E;">Én samlet indsats.</em>
</h2>

</td>
</tr>

<tr>
<td class="padding-x"
  bgcolor="#FAF6F4"
  style="padding:15px 45px 43px;background:#FAF6F4;">

<table role="presentation" width="100%">

<!-- 01 GENAKTIVERING -->
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
Genaktivering af inaktive kunder
</h3>

<p style="
  margin:0;
  font-size:13px;
  line-height:22px;
  color:#61575A;">
Typisk er omkring 60 % af kartoteket kunder, der stadig
kommer jævnligt. De sidste 40 % har ofte været trofaste
og lagt mange penge i klinikken – men kommer ikke længere.
Det er det potentiale, vi henter hjem: typisk
<strong style="color:#39252D;">10–30 ekstra bookinger om måneden</strong>,
afhængigt af hvor meget kundedata der ligger i ${P.bookingSystem}.
</p>
</td>
</tr>
</table>
</td>
</tr>

<!-- 02 FASTHOLDELSE -->
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
Fastholdelse og loyalitet
</h3>

<p style="
  margin:0;
  font-size:13px;
  line-height:22px;
  color:#61575A;">
Nogle kunder kommer hver 4. uge, andre hver 12. Allio
kender den enkelte kundes rytme, og glider en kunde ud
af den, får kunden en personlig henvendelse – ikke en
reklame. Sammen med loyalitetsprogrammer til de aktive
kunder er det forskellen på en kunde, der lægger
<strong style="color:#39252D;">2.500 kr.</strong> om året,
og en, der lægger <strong style="color:#39252D;">8.500 kr.</strong>
</p>
</td>
</tr>
</table>
</td>
</tr>

<!-- 03 MERSALG -->
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
Mersalg som en service
</h3>

<p style="
  margin:0;
  font-size:13px;
  line-height:22px;
  color:#61575A;">
Køber en kunde fx et serum, ved systemet, at det typisk
slipper op efter ca. 6 uger. Når kunden kommer igen, får
behandleren en diskret besked – så produktet kan tilbydes
som en del af god service. Kunden føler sig husket, ikke
solgt til, og værdien af en booket tid kan stige med
<strong style="color:#39252D;">30–50 %</strong>.
</p>
</td>
</tr>
</table>
</td>
</tr>

<!-- 04 ANMELDELSER -->
<tr>
<td style="border-top:1px solid #E5D5D4;padding:23px 0;">
<table role="presentation" width="100%">
<tr>
<td width="49" valign="top"
  style="font-family:Georgia,serif;font-size:22px;color:#B78C91;">
04
</td>
<td>
<h3 style="
  margin:0 0 7px;
  font-family:Georgia,serif;
  font-size:22px;
  font-weight:normal;
  color:#39252D;">
Flere gode Google-anmeldelser
</h3>

<p style="
  margin:0;
  font-size:13px;
  line-height:22px;
  color:#61575A;">
Anmeldelseslinket sendes kun til de rette kunder – fx
efter tredje besøg eller et afsluttet forløb – så det er
de loyale kunder, der deler deres oplevelse. Vi ser
typisk <strong style="color:#39252D;">15–20 nye gode anmeldelser om måneden</strong>.
</p>
</td>
</tr>
</table>
</td>
</tr>

</table>

<!-- SAMLET INDBAKKE -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td bgcolor="#EFE4E3"
  style="padding:23px 22px;background:#EFE4E3;">

<p style="margin:0 0 10px;font-size:10px;letter-spacing:1.6px;color:#906572;">
SAMLET INDBAKKE &nbsp;·&nbsp; AI-KLINIKASSISTENT
</p>

<p style="
  margin:0;
  font-size:13px;
  line-height:22px;
  color:#605458;">
Henvendelser fra telefon, SMS, mail og sociale medier
samles ét sted, og AI-klinikassistenten svarer hurtigt
– også når I står i behandling eller har lukket.
Ingen kunder bliver glemt.
</p>

</td>
</tr>
</table>

</td>
</tr>

<!-- RESULTATER -->
<tr>
<td class="padding-x"
  style="padding:44px 45px 10px;">

<p style="
  margin:0 0 10px;
  font-size:10px;
  font-weight:bold;
  letter-spacing:2.4px;
  color:#A2737C;">
02 &nbsp;/&nbsp; RESULTATER I PRAKSIS
</p>

<h2 class="body-title" style="
  margin:0 0 24px;
  font-family:Georgia,serif;
  font-size:34px;
  font-weight:normal;
  line-height:1.17;
  color:#39252D;">
Når relationer bliver<br>
<em style="color:#94606E;">til mere omsætning.</em>
</h2>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td bgcolor="#372731"
  style="padding:26px 26px 24px;background:#372731;">
<p class="stat-num" style="
  margin:0 0 6px;
  font-family:Georgia,serif;
  font-size:60px;
  line-height:1;
  color:#E8BCC4;">
+17 %
</p>
<p style="
  margin:0;
  font-size:13px;
  line-height:21px;
  color:#E5DADC;">
Typisk stigning i den årlige omsætning, når de
rette flows er sat op – uden flere nye kunder.
</p>
</td>
</tr>
</table>

<p style="margin:26px 0 0;font-size:13px;line-height:22px;color:#655A5D;">
Tre eksempler fra tidligere genaktiveringskampagner:
</p>

</td>
</tr>

<tr>
<td class="padding-x"
  style="padding:14px 45px 15px;">

<!-- CASES: celler i samme række, så kasserne altid er lige høje på computer -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>

<td class="box-col" width="32%" valign="top" bgcolor="#F7F1EF"
  style="padding:20px 16px;background:#F7F1EF;border-top:2px solid #AB7480;">
<p style="margin:0 0 12px;font-size:10px;letter-spacing:1.4px;color:#99737B;">
KLINIK I ODENSE
</p>
<p style="margin:0 0 6px;font-family:Georgia,serif;font-size:24px;line-height:28px;color:#382630;">
38.400 kr.
</p>
<p style="margin:0;font-size:12px;line-height:19px;color:#6B5C61;">
49 bookinger fra 348 kontaktede kunder
</p>
</td>

<td class="box-gap" width="12" style="width:12px;font-size:0;line-height:0;">&nbsp;</td>

<td class="box-col" width="32%" valign="top" bgcolor="#F7F1EF"
  style="padding:20px 16px;background:#F7F1EF;border-top:2px solid #AB7480;">
<p style="margin:0 0 12px;font-size:10px;letter-spacing:1.4px;color:#99737B;">
KLINIK I RANDERS
</p>
<p style="margin:0 0 6px;font-family:Georgia,serif;font-size:24px;line-height:28px;color:#382630;">
43.049 kr.
</p>
<p style="margin:0;font-size:12px;line-height:19px;color:#6B5C61;">
27 bookinger fra 196 kontaktede kunder
</p>
</td>

<td class="box-gap" width="12" style="width:12px;font-size:0;line-height:0;">&nbsp;</td>

<td class="box-col" width="32%" valign="top" bgcolor="#F7F1EF"
  style="padding:20px 16px;background:#F7F1EF;border-top:2px solid #AB7480;">
<p style="margin:0 0 12px;font-size:10px;letter-spacing:1.4px;color:#99737B;">
MINDRE KLINIK
</p>
<p style="margin:0 0 6px;font-family:Georgia,serif;font-size:24px;line-height:28px;color:#382630;">
42.275 kr.
</p>
<p style="margin:0;font-size:12px;line-height:19px;color:#6B5C61;">
på 5 dage – fra et kartotek med 390 kunder
</p>
</td>

</tr>
</table>

</td>
</tr>

<tr>
<td class="padding-x" style="padding:6px 45px 44px;">
<p style="
  margin:0;
  color:#877B7F;
  font-size:11px;
  line-height:18px;">
Omsætning fra individuelle kampagner. Andre klinikkers
resultater kan variere og er ikke en garanti for
tilsvarende effekt.
</p>
</td>
</tr>

<!-- SAMARBEJDE -->
<tr>
<td class="padding-x"
  style="padding:10px 45px 39px;">

<p style="
  margin:0 0 11px;
  font-size:10px;
  font-weight:bold;
  letter-spacing:2.4px;
  color:#A2737C;">
03 &nbsp;/&nbsp; SÅDAN SAMARBEJDER VI
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
besøgsmønstre og muligheder i ${P.bookingSystem}.
</td>
</tr>

<tr>
<td valign="top"
  style="font-family:Georgia,serif;font-size:18px;color:#AB7580;">
II.
</td>
<td style="padding-bottom:17px;font-size:13px;line-height:21px;color:#5C5355;">
<strong>Vi bygger en plan</strong>
for genaktivering, fastholdelse,
mersalg og anmeldelser.
</td>
</tr>

<tr>
<td valign="top"
  style="font-family:Georgia,serif;font-size:18px;color:#AB7580;">
III.
</td>
<td style="font-size:13px;line-height:21px;color:#5C5355;">
<strong>Vi udfører og optimerer løbende</strong>,
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
Book en uforpligtende telefonisk gennemgang &nbsp; →
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

export const growthOverviewMailDraft = {
  id: GROWTH_OVERVIEW_DRAFT_ID,
  label: "Klinik vækst mail",
  subject: GROWTH_OVERVIEW_SUBJECT,
  message: GROWTH_OVERVIEW_MESSAGE,
} as const;
