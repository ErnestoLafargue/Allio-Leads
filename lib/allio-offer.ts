/**
 * Allios tilbud og pris — ét sted (fakta: docs/allio.md). Alle AI-prompts (analyse, ugens script, finpudsning, live-coach)
 * bruger dette, så AI'en aldrig nævner en anden pris. Ændres her, når prisen hæves.
 */
export const ALLIO_MONTHLY_PRICE_DKK = 2500;
export const ALLIO_PRICE_TEXT = "2.500 kr. om måneden ekskl. moms";
export const ALLIO_PACKAGE =
  "Allio Komplet — hele platformen: genaktivering, kundefastholdelse, Done for You-kampagner, AI-klinikassistent, Google-anmeldelser, loyalitetskort og Allio Phones (selve bookingsystemet, Allio Booking, er gratis)";

/** Regel om prisen til systemprompts. */
export const ALLIO_PRICE_RULE = `Prisen er altid ${ALLIO_PRICE_TEXT} for ${ALLIO_PACKAGE}. Nævn aldrig en anden pris, rabat eller binding. Forbrug (fx SMS til 0,50 kr.) afregnes særskilt — nævn det kun, hvis kunden spørger. Prisen siges først, når kunden spørger, og efter værdien: Allio arbejder kun med velfungerende klinikker med data nok; specialisten viser på mødet, hvad der er at hente ud fra klinikkens egne data, og er der ingen værdi, laver vi ikke en aftale.`;
