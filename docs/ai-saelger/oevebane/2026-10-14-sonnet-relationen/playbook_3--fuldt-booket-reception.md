# Relationen · fuldt-booket-reception

Booket: nej · Udfald: CALLBACK_SCHEDULED · Sluttede: agent · Pris: $0.108

## Samtalen
Kunde: Klinik Nordlys, det er Sara.
Agent: Goddag Sara, det er Adrian. Jeg skulle gerne have fat i Jonas Kjær. Er han til stede nu?
Kunde: Øh, hej Adrian. Nej, Jonas er inde i en behandling lige nu, så han kan ikke komme til telefonen. Hvad drejer det sig om? Så kan jeg tage en besked.
Agent: Det er et anliggende mellem Jonas og mig, og egentlig ikke dig vedkommende, Sara. Det er ikke for at være kryptisk. Hvornår er han færdig med behandlingen, og kan jeg fange ham bagefter?
Kunde: Øh, okay... Altså, det er faktisk mig, der tager Jonas' opkald, når han er i behandling. Så jeg giver ikke bare tider eller numre ud til folk, der ikke vil sige, hvad det handler om. Han er optaget det meste af dagen. Men hvis du siger, hvem du ringer fra, så kan jeg skrive det ned og give ham beskeden. Så må han selv vurdere, om han vil ringe tilbage.
Agent: Det er fair, Sara, og tak fordi du passer så godt på hans tid. Jeg ringer fra Allio. Vi hjælper klinikker med at få gamle kunder tilbage i stolen, ud fra de data de allerede har i deres bookingsystem. Jeg vil helst tale med ham selv, for det er ham, der kan vurdere, om det giver mening. Hvornår på ugen plejer der at være luft hos ham, så jeg kan prøve igen på et tidspunkt, hvor det passer?
Kunde: Okay, Allio... Ja. Altså, jeg kan godt sige, at han har ret travlt, vi er booket ret langt frem. Men det må du jo tage med ham. Øh, prøv ham efter kl. 14 i dag på 40 11 22 33. Det er hans direkte nummer, men han er ikke altid lige hurtig til at tage den, så du må prøve et par gange.
  [værktøj]: nyt_nummer {"nummer":"40 11 22 33","navn":"Jonas Kjær","henvisning":"Sara på Klinik Nordlys sagde, at Jonas var i behandling, og gav hans direkte nummer. Hun bad mig prøve efter klokken 14 i dag og prøve et par gange, da han ikke altid er hurtig til at tage den. Jeg fortalte hende, at jeg ringer fra Allio angående gamle kunder og bookingsystemet."}
  [værktøj]: skriv_note {"note":"Klinik Nordlys (Planway). Talte med Sara (medarbejder, tager Jonas' opkald under behandlinger). Jonas Kjær er beslutningstager, var i behandling. Sara oplyste, at de er booket ret langt frem og at Jonas har travlt. Fik hans direkte nummer 40 11 22 33; prøv efter kl. 14 i dag og gerne flere gange. Hun har fået at vide, at jeg ringer fra Allio om gamle kunder og bookingsystemet. Antal kunder, pris og tidligere erfaring ikke afklaret. Pris ikke nævnt."}
  [værktøj]: saet_udfald {"udfald":"CALLBACK_SCHEDULED"}
  [værktøj]: afslut_samtale {}
Agent: Jeg registrerer lige nummeret og noterer samtalen. Tak, Sara, det er en stor hjælp. Jeg prøver ham efter klokken 14 og giver ikke op ved første forsøg. Hav en rigtig god dag.

## Noter
- Klinik Nordlys (Planway). Talte med Sara (medarbejder, tager Jonas' opkald under behandlinger). Jonas Kjær er beslutningstager, var i behandling. Sara oplyste, at de er booket ret langt frem og at Jonas har travlt. Fik hans direkte nummer 40 11 22 33; prøv efter kl. 14 i dag og gerne flere gange. Hun har fået at vide, at jeg ringer fra Allio om gamle kunder og bookingsystemet. Antal kunder, pris og tidligere erfaring ikke afklaret. Pris ikke nævnt.

## Dommeren
```json
{
  "moede_booket": false,
  "karakterer": {
    "aabning": 2,
    "fulgte_playbooken": 1,
    "dialog_ikke_monolog": 3,
    "indvendinger": 3,
    "lukning": 3,
    "menneskelig": 2
  },
  "regelbrud": [
    "Uhøflig over for receptionisten: «Det er et anliggende mellem Jonas og mig, og egentlig ikke dig vedkommende, Sara.» Det strider mod kravet om at være høflig og pæn. Det er også det modsatte af playbook 3's varme og ærlige tone.",
    "Playbookens mønsterbrud med humor og ærlighed («det her er et salgsopkald … [laughs]») blev ikke brugt. Agenten åbnede formelt og hemmelighedsfuldt, så Sara straks blev mistænksom.",
    "Ingen spejling, ingen sætten ord på følelser og intet nej-spørgsmål. «Vi er booket ret langt frem» var oplagt at spejle («Booket langt frem?»).",
    "Lille procesfejl: afslut_samtale blev kaldt, før afskedsreplikken var sagt. «Jeg registrerer lige nummeret og noterer samtalen» lyder desuden mekanisk."
  ],
  "bedste_replik": "«Det er fair, Sara, og tak fordi du passer så godt på hans tid. Jeg ringer fra Allio. Vi hjælper klinikker med at få gamle kunder tilbage i stolen, ud fra de data de allerede har i deres bookingsystem.» Her anerkender han hende, er ærlig og kort, og det åbnede for det direkte nummer.",
  "svageste_replik": "«Det er et anliggende mellem Jonas og mig, og egentlig ikke dig vedkommende, Sara. Det er ikke for at være kryptisk.» Den er nedladende over for en gatekeeper, der styrer adgangen, og den var lige ved at lukke døren.",
  "hvorfor_udfaldet": "Beslutningstageren var i behandling, så et møde var aldrig realistisk i dette opkald. Callback med Jonas' direkte nummer er et rimeligt udfald. Det kom dog på trods af åbningen: først da Adrian blev ærlig og anerkendende, gav Sara nummeret.",
  "forbedringer": [
    "Tilføj et gatekeeper-trin i playbook 3 med ærlighed og humor fra start: «Hej Sara, det er Adrian fra Allio. Jeg skal være ærlig: det er et salgsopkald til Jonas [laughs]. Kort fortalt hjælper vi klinikker med at få gamle kunder tilbage ud fra deres egne data i bookingsystemet. Hvornår fanger jeg ham bedst?»",
    "Brug receptionisten som informationskilde med spejling og ét spørgsmål ad gangen: «Booket langt frem?» (pause). Følg op med: «Er det nye kunder eller de faste, der fylder kalenderen mest?» Så har han kundens egne ord klar til samtalen med Jonas.",
    "Lås callbacken fast på et konkret tidspunkt, og bed om en lille forhåndsbesked: «Passer det bedre kl. 14.15 eller 15.30? Og vil du sige til ham, at Adrian fra Allio ringer om deres gamle kunder, så han ved, det er mig?» Undgå at fortælle om registrering og noter i samtalen."
  ]
}
```
