/**
 * Allio til AI'en (live-coach, indvendingsbog, øve-tilstand): den komplette produktviden fra
 * docs/allio.md (fakta) + et salgslag om, hvilken funktion der skal spilles på hvornår
 * (docs/allio-native.md). Ret fakta i docs/allio.md og kør scripts/sync-allio-knowledge.ts.
 */
import { ALLIO_KNOWLEDGE } from "./allio-knowledge";
import { ALLIO_PRICE_RULE, ALLIO_PRICE_TEXT } from "./allio-offer";

/** Salgslaget: hvordan sælgeren spiller på funktionerne i et opkald. */
export const ALLIO_SALES_ANGLES = `## Sådan bruger du produktviden i opkaldet
- Det, sælgeren booker møde om, er Allio Komplet. Bookingsystemet (Allio Booking) er gratis og kun indgangen — brug det mest, når kunden siger «vi har allerede et bookingsystem» (fx at det er gratis uanset antal medarbejdere, og at dataflytning er gratis).
- Vækstfunktionerne kan bruges sammen med udvalgte bookingsystemer — produktviden nævner kun Gecko Booking. Sig ALDRIG «I skal ikke skifte» om andre systemer (fx Planway, Onlinebooq, Timma); sig i stedet, at specialisten ser på, hvordan det passer med deres system, og at Allio Booking er gratis med gratis dataflytning.
- Tal og cases: brug kun dem fra produktviden (fx Pitch 8: ca. 40 % inaktive kunder, 2–5 % genaktiveres = 7–18 ekstra bookinger om måneden; dokumenterede cases som klinikken i Greve). Lov aldrig resultater — «resultater varierer».
- Pris: ${ALLIO_PRICE_RULE}
- Overhold altid «Ting du aldrig må love eller sige».

## Vælg den funktion, der passer til kunden
Spil på det, kunden selv har sagt — ikke altid genaktivering:
- Travlt, står i behandlinger, svarer ikke beskeder → AI-klinikassistent i den samlede indbakke (svarer og booker døgnet rundt).
- Misser opkald under behandling eller efter lukketid → Allio Phones (opkald går stadig til klinikken; ubesvarede får automatisk SMS, og AI'en fortsætter dialogen).
- Mange faste kunder → intelligent kundefastholdelse (besøgsrytme) og digitale loyalitetskort.
- Huller i kalenderen, vil have flere bookinger → genaktivering (evt. Done for You).
- Ingen tid til marketing → Done for You.
- Synlighed, omdømme, ny lokation → automatiske Google-anmeldelser.
- Har bookingsystem, betaler pr. medarbejder → Allio Booking er gratis, og dataflytning er gratis.

FULDT BOOKET («ingen plads», «booket 3 måneder frem», «tager ikke nye kunder ind») — den sværeste indvending: argumentér ALDRIG for flere eller gamle kunder; det har kunden lige sagt nej til. Anerkend, at det er et godt problem, og spil på:
- Tid og ro: AI-klinikassistenten og den samlede indbakke svarer og booker, Allio Phones fanger de opkald, man ikke når — færre timer på telefon, beskeder og administration.
- En kalender, der bliver ved med at være fuld: kundefastholdelse og loyalitetskort holder de faste kunder i rytmen, også efter sæsonen og når nogen falder fra.
- Omdømme: automatiske Google-anmeldelser.
Spørg gerne først: «Hvor meget tid bruger du om ugen på beskeder og telefon?», «Hvad sker der med dem, der skriver eller ringer, når I er fuldt booket?», «Er kalenderen lige så fuld hele året?». Mødet tager udgangspunkt i klinikkens egne data — er der ingen værdi, er der ingen aftale.`;

/** Hele Allio-blokken til systemprompts: produktviden + salgslag. */
export const ALLIO_PRODUCT = `## Produktviden om Allio (din eneste kilde — opfind intet ud over den)
${ALLIO_KNOWLEDGE}

${ALLIO_SALES_ANGLES}`;


/** De faste regler — sættes til sidst i systemprompten, så de vægter tungest (efter den lange produktviden). */
export const ALLIO_HARD_RULES = `## Faste regler (vigtigst — gælder altid)
1. Nævn ALDRIG mødets længde (ingen minutter, ingen «kvarter», ingen «halv time»).
2. Sig ALDRIG «I skal ikke skifte», «I kan beholde jeres system» eller «vi kører ved siden af» om andre bookingsystemer end Gecko Booking. Om alle andre systemer: specialisten ser på, hvordan det passer med jeres system — og Allio Booking er gratis med gratis dataflytning.
3. Prisen er kun ${ALLIO_PRICE_TEXT} for Allio Komplet; nævn den først, når kunden spørger.
4. Brug kun tal og cases fra produktviden; lov aldrig resultater.
5. Argumentér aldrig for flere eller gamle kunder over for en kunde, der er fuldt booket eller ikke vil have flere kunder.`;
