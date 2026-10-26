import { ALLIO_LOGO_PUBLIC_URL } from "./client-edition-mail";
import { MAIL_PLACEHOLDERS_EN as P } from "./personalize";

export const GROWTH_OVERVIEW_EN_DRAFT_ID = "clinics_growth_overview_en";

export const GROWTH_OVERVIEW_EN_SUBJECT = "Thanks for the chat – how to get more from your existing clients";

/** Engelsk udgave af «Klinik vækst mail» — samme design og opbygning. */
export const GROWTH_OVERVIEW_EN_MESSAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>Allio – Same clients. More revenue.</title>

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
ALLIO &nbsp;/&nbsp; FOR CLINICS
</p>

<h1 class="headline" style="
  margin:0 0 23px;
  font-family:Georgia,'Times New Roman',serif;
  font-size:49px;
  line-height:1.13;
  font-weight:normal;
  letter-spacing:-1.7px;
  color:#FFF9F5;">
Same clients.<br>
<span style="color:#E8BCC4;font-style:italic;">
More revenue.
</span>
</h1>

<p style="
  margin:0 0 30px;
  font-size:15px;
  line-height:25px;
  color:#E5DADC;">
Reactivation, retention, upselling and reviews
– four areas that together typically lift annual
revenue and put more clients in the calendar.
</p>

<div style="height:1px;background:#876B75;"></div>

<p style="
  margin:17px 0 0;
  font-size:10px;
  letter-spacing:2px;
  line-height:18px;
  color:#D5C1C5;">
REACTIVATION &nbsp; · &nbsp; RETENTION &nbsp; · &nbsp;
UPSELLING &nbsp; · &nbsp; REVIEWS
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
Thank you for a great conversation. As promised, here
is a short overview of the four areas where we
typically create the most value for clinics – and
what it has delivered for other clinics.
</p>

<p style="
  margin:0;
  font-size:14px;
  line-height:24px;
  color:#51484B;">
For <strong>${P.companyName}</strong>, it is not necessarily
about attracting more new clients. The biggest growth
often lies in the clients you already have.
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
WE INTEGRATE WITH YOUR SYSTEM
</p>

<h3 style="
  margin:0 0 8px;
  font-family:Georgia,serif;
  font-size:20px;
  font-weight:normal;
  color:#39252D;">
We work with what you use today.
</h3>

<p style="
  margin:0;
  font-size:13px;
  line-height:22px;
  color:#5C5355;">
Allio integrates directly with ${P.bookingSystem}, so we
can get started right away – building on the clients
and data you already have.
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
01 &nbsp;/&nbsp; WHAT WE DO
</p>

<h2 class="body-title" style="
  margin:0;
  font-family:Georgia,'Times New Roman',serif;
  font-size:35px;
  font-weight:normal;
  line-height:1.17;
  color:#39252D;">
Four areas.<br>
<em style="color:#94606E;">One joined-up effort.</em>
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
Reactivating inactive clients
</h3>

<p style="
  margin:0;
  font-size:13px;
  line-height:22px;
  color:#61575A;">
Typically, around 60% of a client base still visits
regularly. The other 40% have often been loyal and spent
a lot at the clinic – but no longer come in. That is the
potential we bring back: typically
<strong style="color:#39252D;">10–30 extra bookings a month</strong>,
depending on how much client data sits in ${P.bookingSystem}.
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
Retention and loyalty
</h3>

<p style="
  margin:0;
  font-size:13px;
  line-height:22px;
  color:#61575A;">
Some clients come every 4 weeks, others every 12. Allio
knows each client's rhythm, and when a client drifts out
of it, they get a personal message – not an ad. Combined
with loyalty programmes for active clients, it is the
difference between a client who spends
<strong style="color:#39252D;">DKK 2,500</strong> a year
and one who spends <strong style="color:#39252D;">DKK 8,500</strong>.
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
Upselling as a service
</h3>

<p style="
  margin:0;
  font-size:13px;
  line-height:22px;
  color:#61575A;">
If a client buys a serum, for example, the system knows
it typically runs out after about 6 weeks. At the client's
next visit, the therapist gets a discreet note – so the
product can be offered as part of great service. The client
feels remembered, not sold to, and the value of a booked
appointment can rise by <strong style="color:#39252D;">30–50%</strong>.
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
More great Google reviews
</h3>

<p style="
  margin:0;
  font-size:13px;
  line-height:22px;
  color:#61575A;">
The review link only goes to the right clients – e.g.
after their third visit or a completed course of treatment
– so it is your loyal clients who share their experience.
We typically see <strong style="color:#39252D;">15–20 new great reviews a month</strong>.
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
UNIFIED INBOX &nbsp;·&nbsp; AI CLINIC ASSISTANT
</p>

<p style="
  margin:0;
  font-size:13px;
  line-height:22px;
  color:#605458;">
Enquiries from phone, SMS, email and social media are
gathered in one place, and the AI clinic assistant replies
quickly – even when you are with a client or closed.
No client is forgotten.
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
02 &nbsp;/&nbsp; RESULTS IN PRACTICE
</p>

<h2 class="body-title" style="
  margin:0 0 24px;
  font-family:Georgia,serif;
  font-size:34px;
  font-weight:normal;
  line-height:1.17;
  color:#39252D;">
When relationships turn<br>
<em style="color:#94606E;">into more revenue.</em>
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
+17%
</p>
<p style="
  margin:0;
  font-size:13px;
  line-height:21px;
  color:#E5DADC;">
Typical increase in annual revenue once the right
flows are in place – without more new clients.
</p>
</td>
</tr>
</table>

<p style="margin:26px 0 0;font-size:13px;line-height:22px;color:#655A5D;">
Three examples from previous reactivation campaigns:
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
CLINIC IN ODENSE
</p>
<p style="margin:0 0 6px;font-family:Georgia,serif;font-size:24px;line-height:28px;color:#382630;">
DKK 38,400
</p>
<p style="margin:0;font-size:12px;line-height:19px;color:#6B5C61;">
49 bookings from 348 clients contacted
</p>
</td>

<td class="box-gap" width="12" style="width:12px;font-size:0;line-height:0;">&nbsp;</td>

<td class="box-col" width="32%" valign="top" bgcolor="#F7F1EF"
  style="padding:20px 16px;background:#F7F1EF;border-top:2px solid #AB7480;">
<p style="margin:0 0 12px;font-size:10px;letter-spacing:1.4px;color:#99737B;">
CLINIC IN RANDERS
</p>
<p style="margin:0 0 6px;font-family:Georgia,serif;font-size:24px;line-height:28px;color:#382630;">
DKK 43,049
</p>
<p style="margin:0;font-size:12px;line-height:19px;color:#6B5C61;">
27 bookings from 196 clients contacted
</p>
</td>

<td class="box-gap" width="12" style="width:12px;font-size:0;line-height:0;">&nbsp;</td>

<td class="box-col" width="32%" valign="top" bgcolor="#F7F1EF"
  style="padding:20px 16px;background:#F7F1EF;border-top:2px solid #AB7480;">
<p style="margin:0 0 12px;font-size:10px;letter-spacing:1.4px;color:#99737B;">
SMALLER CLINIC
</p>
<p style="margin:0 0 6px;font-family:Georgia,serif;font-size:24px;line-height:28px;color:#382630;">
DKK 42,275
</p>
<p style="margin:0;font-size:12px;line-height:19px;color:#6B5C61;">
in 5 days – from a client base of 390
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
Revenue from individual campaigns. Results at other
clinics may vary and are not a guarantee of a
similar outcome.
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
03 &nbsp;/&nbsp; HOW WE WORK TOGETHER
</p>

<h2 class="body-title" style="
  margin:0 0 16px;
  font-family:Georgia,serif;
  font-size:33px;
  font-weight:normal;
  line-height:1.17;
  color:#39252D;">
Strategy and execution.<br>
<em style="color:#94606E;">Not just software.</em>
</h2>

<p style="
  margin:0 0 26px;
  font-size:14px;
  line-height:24px;
  color:#51484B;">
A booking system typically gives you a few tools
– a bit like an IKEA kitchen delivered as a handful of
flat-packed boxes you have to build yourself. With Allio
you get a fully equipped kitchen, set up and ready – with
a chef who cooks, keeps track of what the guests like
best, and adjusts the menu with the seasons.
</p>

<table role="presentation" width="100%">

<tr>
<td width="37" valign="top"
  style="font-family:Georgia,serif;font-size:18px;color:#AB7580;">
I.
</td>
<td style="padding-bottom:17px;font-size:13px;line-height:21px;color:#5C5355;">
<strong>We map out</strong> your clients, visit
patterns and opportunities in ${P.bookingSystem}.
</td>
</tr>

<tr>
<td valign="top"
  style="font-family:Georgia,serif;font-size:18px;color:#AB7580;">
II.
</td>
<td style="padding-bottom:17px;font-size:13px;line-height:21px;color:#5C5355;">
<strong>We build a plan</strong>
for reactivation, retention,
upselling and reviews.
</td>
</tr>

<tr>
<td valign="top"
  style="font-family:Georgia,serif;font-size:18px;color:#AB7580;">
III.
</td>
<td style="font-size:13px;line-height:21px;color:#5C5355;">
<strong>We run and optimise it continuously</strong>,
so it never becomes another big task
for your team.
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
Campaigns and data processing are arranged in line
with relevant consents, access rights and agreements.
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
ALLIO COMPLETE
</p>
<p style="margin:0;font-size:13px;line-height:21px;color:#39252D;">
Platform, strategy and campaign support
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
DKK 2,500
</p>
<p style="margin:0;font-size:11px;color:#796A6F;">
per location / 4 weeks
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
We don’t take on every clinic.
</p>
<p style="
  margin:0;
  max-width:360px;
  font-size:10px;
  line-height:16px;
  letter-spacing:0.2px;
  color:#9A8D91;">
We only partner where we see real potential, and the
client base needs to be of a certain size. That is why we
always visit and review your data before we agree anything.
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
A PERSONAL INVITATION
</p>

<h2 style="
  margin:0 0 15px;
  font-family:Georgia,serif;
  font-size:33px;
  font-weight:normal;
  line-height:1.2;
  color:#FFF9F5;">
See the potential in<br>
<em style="color:#E8BCC4;">
your own client data.
</em>
</h2>

<p style="
  margin:0 0 25px;
  font-size:13px;
  line-height:22px;
  color:#E2D5D9;">
We are happy to visit for a no-obligation
review of about an hour. We look at your
opportunities and show how Allio
works in practice.
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
Book a no-obligation phone review &nbsp; →
</a>

</td>
</tr>
</table>

<p style="
  margin:17px 0 0;
  font-size:11px;
  color:#BDA6AE;">
You can also simply reply to this email.
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
I look forward to hearing from you.
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
Allio · Better client relationships. More growth.
</p>

</td>
</tr>

</table>
</td>
</tr>
</table>

</body>
</html>`;

export const growthOverviewEnMailDraft = {
  id: GROWTH_OVERVIEW_EN_DRAFT_ID,
  label: "Klinik vækst mail (engelsk)",
  subject: GROWTH_OVERVIEW_EN_SUBJECT,
  message: GROWTH_OVERVIEW_EN_MESSAGE,
} as const;
