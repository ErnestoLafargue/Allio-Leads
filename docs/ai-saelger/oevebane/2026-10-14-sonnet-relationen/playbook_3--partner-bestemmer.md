# Relationen · partner-bestemmer

Booket: nej · Udfald: CALLBACK_SCHEDULED · Sluttede: agent · Pris: $0.157

## Samtalen
Kunde: Wellness Sydhavn, det er Lone.
Agent: Hej Lone, det er Adrian fra Allio. Jeg skal være ærlig: det her er et salgsopkald [laughs], så du må gerne lægge på. Men giv mig lige tredive sekunder først, så må du bagefter bestemme, om jeg må fortsætte. Er det en fair handel?
Kunde: Øh... ja, altså, okay, det var da ærligt nok. Men jeg har en kunde om fem minutter, så... ja, tredive sekunder. Hvad er Allio?
Agent: Tak, Lone, så skal jeg være hurtig. Allio hjælper klinikker med at få gamle kunder tilbage igen, dem der har været forbi en eller to gange og så aldrig er blevet inviteret tilbage. Det sker ud fra de data, I allerede har i GeckoBooking, så uden markedsføring og uden nye kunder. Jeg er faktisk ikke sikker på, at det passer på jer. Hvordan ser det ud hos jer, har I mange kunder liggende, som I ikke har set længe?
Kunde: Øh... jo, altså, det har vi nok. Vi har jo omkring tolv hundrede i systemet efterhånden, og der er da en del, man ikke har set i... ja, lang tid. Det tænker man tit over, faktisk. Men altså, hvordan virker det så? Sender I bare en masse SMS'er ud, eller hvad? For det gider vores kunder altså ikke.
  [værktøj]: beregn_potentiale {"kunder_i_kartotek":1200}
  [værktøj]: skriv_note {"note":"Lone Berg (beslutningstager, tog selv telefonen). GeckoBooking. Ca. 1200 kunder i kartoteket. Har selv tænkt over de kunder, de ikke har set længe. Bekymring: kunderne gider ikke masse-SMS'er. Havde kunde om fem minutter, så kort samtale. Pris ikke nævnt endnu."}
Agent: Det gode spørgsmål, Lone. Nej, det er ikke et masseudsendelses-halløj. Systemet skriver personligt til de kunder, der er ved at falde fra, så det ligner en besked fra jer og ikke en reklame. Jeg lader lige tallene regne på jeres tolv hundrede. Med tolv hundrede kunder er det cirka fire hundrede og firs, der har været forbi en eller to gange og aldrig er kommet igen. Typisk giver det omkring ti genbookinger om måneden, uden at du løfter en finger. Det lyder som om, du har haft det på fornemmelsen længe. Ville det være helt skørt, hvis en af vores specialister kiggede forbi på torsdag eller fredag og viste dig, hvad der ligger i jeres egne data? Så du kan se selv, hvordan beskederne ser ud.
Kunde: Øh, vent lige lidt. Fire hundrede og firs? Hvordan ved du det? Du har jo ikke set vores tal. Det lyder lidt som noget, du bare siger til alle.

Og altså, det lyder da spændende, det gør det. Men det er Peter, min mand, der bestemmer den slags. Han har styr på økonomien og alle aftaler, så jeg booker ikke noget uden ham. Og nu skal jeg altså også til at have en kunde ind om lidt, så...
  [værktøj]: find_ledige_tider {}
Agent: Ha, du har ret, Lone, det er ikke jeres tal. Det er et gennemsnit: cirka fyrre procent af dem, der har været forbi, kommer kun en eller to gange, og så har jeg regnet det på de tolv hundrede, du selv nævnte. Hvor mange der reelt ligger der hos jer, er det netop det, specialisten viser med jeres egne data. Det lyder som om, I tager beslutningerne sammen, og du skal selvfølgelig ikke booke noget uden Peter. Ville det være en dårlig idé, at I begge er med, når specialisten kommer forbi? Hvornår kunne Peter og du passe jer bedst, torsdag eller fredag? Jeg har torsdag klokken ni eller fredag klokken ni. Og det tager kun fyrre-fem til tres minutter, så Victor kommer ud til jer. Kan I begge to en af dagene?
Kunde: Øh, nej, klokken ni, det går slet ikke. Om formiddagen har vi fuldt booket, der kan vi ikke bare sætte os ned i en time. Hvis det endelig skal være, så skal det være om eftermiddagen. Men altså, jeg kan jo ikke sige ja på Peters vegne, vel? Han har styr på kalenderen.

Og nu skal jeg altså gå, min kunde står herude. Ring til Peter i stedet. 22 33 44 55. Efter klokken fire, ikke før, for der er han ude. Så må I finde ud af det.
  [værktøj]: nyt_nummer {"nummer":"22 33 44 55","navn":"Peter (Lone Bergs mand)","henvisning":"Lone Berg bad mig ringe til Peter, hendes mand, der bestemmer aftaler og økonomi. Ring efter klokken fire, ikke før. Lone synes det lød spændende, men kan ikke sige ja uden ham. Formiddage er fuldt booket, så eftermiddag torsdag/fredag passer bedst."}
  [værktøj]: skriv_note {"note":"Lone Berg: interesseret (\"lyder spændende\"), men Peter (hendes mand) bestemmer aftaler, økonomi og kalender. Nyt nummer til Peter: 22 33 44 55, ring efter kl. 16. Eftermiddag foretrækkes, formiddage er fuldt booket. Ca. 1200 kunder i kartoteket, GeckoBooking. Bekymring: kunderne gider ikke masse-SMS. Pris ikke nævnt. Ønsker at begge deltager i mødet. Tider tilbudt: tors 15/10 og fre 16/10 kl. 9 (afvist), eftermiddagstider findes samme dage."}
  [værktøj]: saet_udfald {"udfald":"CALLBACK_SCHEDULED"}
  [værktøj]: afslut_samtale {}
Agent: Lone har givet et nyt nummer og en person, så jeg gemmer det og noterer det.

## Noter
- Lone Berg (beslutningstager, tog selv telefonen). GeckoBooking. Ca. 1200 kunder i kartoteket. Har selv tænkt over de kunder, de ikke har set længe. Bekymring: kunderne gider ikke masse-SMS'er. Havde kunde om fem minutter, så kort samtale. Pris ikke nævnt endnu.
- Lone Berg: interesseret ("lyder spændende"), men Peter (hendes mand) bestemmer aftaler, økonomi og kalender. Nyt nummer til Peter: 22 33 44 55, ring efter kl. 16. Eftermiddag foretrækkes, formiddage er fuldt booket. Ca. 1200 kunder i kartoteket, GeckoBooking. Bekymring: kunderne gider ikke masse-SMS. Pris ikke nævnt. Ønsker at begge deltager i mødet. Tider tilbudt: tors 15/10 og fre 16/10 kl. 9 (afvist), eftermiddagstider findes samme dage.

## Dommeren
```json
{
  "moede_booket": false,
  "karakterer": {
    "aabning": 4,
    "fulgte_playbooken": 2,
    "dialog_ikke_monolog": 2,
    "indvendinger": 3,
    "lukning": 1,
    "menneskelig": 2
  },
  "regelbrud": [
    "Ingen høflig afslutning: agenten sagde hverken tak eller farvel til Lone. Den sidste replik var intern meta-tekst («Lone har givet et nyt nummer og en person, så jeg gemmer det og noterer det»), som blev sagt højt til kunden.",
    "Regnestykket (480 kunder og ca. 10 genbookinger) blev fremlagt uopfordret. Lone spurgte, hvordan det virker, ikke om tal. Playbooken siger «kun, hvis kunden er nysgerrig på tal», og tallet fik Lone til at tvivle («noget, du bare siger til alle»).",
    "Trin 3 blev sprunget over: ingen spejling og ingen opsummering, der kunne fremkalde «præcis». Agenten gik direkte fra Lones første åbning til pitch og mødeforslag.",
    "Flere spørgsmål i samme replik: «Ville det være en dårlig idé …? Hvornår kunne Peter og du …? … Kan I begge to en af dagene?» Det bryder ét-spørgsmål-ad-gangen.",
    "Lange replikker til en kunde, der to gange sagde, at hun havde travlt. Playbookens risikoregel (skift til kort og direkte ved travlhed) blev ikke fulgt.",
    "Klokken ni blev tilbudt begge dage, selvom det var tydeligt, at det var en arbejdsdag med kunder. Der kom intet modforslag om en eftermiddagstid, da Lone selv åbnede for det."
  ],
  "bedste_replik": "«Ha, du har ret, Lone, det er ikke jeres tal. Det er et gennemsnit … Hvor mange der reelt ligger der hos jer, er det netop det, specialisten viser med jeres egne data.» Replikken er ærlig, indrømmer kort og vender skepsissen til et argument for mødet.",
  "svageste_replik": "«Lone har givet et nyt nummer og en person, så jeg gemmer det og noterer det.» Det er intern narration i stedet for et tak og farvel til en kunde, der lige havde været imødekommende og givet sin mands nummer.",
  "hvorfor_udfaldet": "Lone var interesseret, men Peter bestemmer, og hun havde kun få minutter. Agenten brugte tiden på tal og lange replikker i stedet for hurtigt at tilbyde en eftermiddagstid med forbehold for Peters ja, så det endte som et callback uden en tentativ booking.",
  "forbedringer": [
    "Ved partner og tidspres, book tentativt: «Helt fair, du skal ikke sige ja på Peters vegne. Skal jeg sætte fredag kl. 14 af med blyant, så ringer jeg til Peter efter fire og hører, om det passer ham?» Så er der en konkret tid at bekræfte i stedet for et koldt callback.",
    "Afslut altid med tak og noget personligt: «Tusind tak, Lone, det var rart at snakke med dig. Jeg ringer til Peter efter fire. Hav en god dag med din kunde!» Læg en regel ind om, at intern tekst aldrig må siges højt.",
    "Når kunden spørger «hvordan virker det?», så svar kort og spejl i stedet for at give tal: «Masse-SMS'er? Nej, det gider ingen. Det er personlige beskeder i jeres navn. Hvad er det, der gør, at I ikke selv har fået fat i dem endnu?» Gem regnestykket, til kunden selv spørger til tal."
  ]
}
```
