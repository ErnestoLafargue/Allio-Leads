# Allio — sådan spiller sælgeren på funktionerne

Fakta om Allio (funktioner, pakker, priser, cases, «ting du aldrig må love») står i **[allio.md](allio.md)** — den komplette produktviden, som AI'en læser.
Denne fil er salgslaget ovenpå: hvilken funktion der skal spilles på hvornår. Teksten AI'en bruger, ligger i `lib/allio-product.ts` (`ALLIO_SALES_ANGLES`).

## Opdatering af produktviden
1. Ret `docs/allio.md`.
2. Kør `npx tsx scripts/sync-allio-knowledge.ts` (kopierer den ind i `lib/allio-knowledge.ts`; en test fejler, hvis de to ikke stemmer).
3. Deploy. Live-coachen, øve-tilstanden og indvendingsbogen bruger den nye tekst. Indvendingsbogen genberegnes med `npx tsx scripts/objection-playbook.ts`.

## Det vi booker møder om
Allio Komplet, 2.500 kr./md. ekskl. moms. Bookingsystemet (Allio Booking) er gratis og kun indgangen.

## Vælg den funktion, der passer til kunden
| Kunden siger … | Spil på |
|---|---|
| Travlt, står i behandlinger, svarer ikke beskeder | AI-klinikassistent i den samlede indbakke |
| Misser opkald under behandling / efter lukketid | Allio Phones (opkald går stadig til klinikken; ubesvarede får SMS, og AI'en fortsætter) |
| Mange faste kunder | Kundefastholdelse (besøgsrytme) og loyalitetskort |
| Huller i kalenderen, vil have flere bookinger | Genaktivering (evt. Done for You) |
| Ingen tid til marketing | Done for You |
| Synlighed, omdømme, ny lokation | Automatiske Google-anmeldelser |
| Har bookingsystem, betaler pr. medarbejder | Allio Booking er gratis, og dataflytning er gratis |

Vækstfunktionerne virker med *udvalgte* bookingsystemer (bl.a. Gecko Booking). Sig aldrig, at det virker med alle.

## Den fuldt bookede klinik
Den sværeste indvending («ingen plads», «booket 3 måneder frem», «tager ikke nye kunder ind»).
**Argumentér aldrig for flere eller gamle kunder.** Det har kunden lige sagt nej til. Anerkend, at det er et godt problem, og spil på:

- **Tid og ro:** AI-klinikassistenten og den samlede indbakke svarer og booker, og Allio Phones fanger de opkald, man ikke når.
- **En kalender, der bliver ved med at være fuld:** kundefastholdelse og loyalitetskort holder de faste kunder i rytmen.
- **Omdømme:** automatiske Google-anmeldelser.
- **Spørg først:** «Hvor meget tid bruger du om ugen på beskeder og telefon?», «Hvad sker der med dem, der skriver eller ringer, når I er fuldt booket?», «Er kalenderen lige så fuld hele året?»
