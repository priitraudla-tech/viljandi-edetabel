# Fellin Racketsi kodulehe ettepanek

Uue fellinrackets.ee kodulehe prototüüp, mida klubi saab kommenteerida.

- Aadress: `https://viljandi-edetabel.pages.dev/fellin/` (kommenteerimiseks lingis `?k=…` võti — võti ise repos ei ole, ainult selle räsi `functions/api/fellin-kommentaar.js`-is). Võti jääb brauserisse meelde, nii et alamlehtedel lingis seda enam vaja pole.
- Google seda ei indekseeri (`_headers`: `X-Robots-Tag: noindex`)

## Kujunduse eelvaade: versioon 8 (`v8/`)

Uus kujundus on eraldi kaustas ja kliendi link (versioon 7) sellest ei muutu.

- Aadress: `https://viljandi-edetabel.pages.dev/fellin/v8/` (viis lehte, sama sisu ja samad alamlehed mis versioonis 7)
- Oma `v8/fellin.css`, `v8/fellin.js` ja `v8/fonts/` (Archivo muutuvfont, OFL 1.1). Pildid on ühised: `../img/`.
- Kommenteerimisskripti (`arvustus.js`) eelvaates pole; `data-osa` tunnused on HTML-is alles, et selle saaks hiljem lihtsalt lisada.
- Vormikeel: avalehe taustaks klubi foto järveäärsetest väljakutest, värvid sealt (ööjärv, savi, kriidijoon),
  pealkirjad kitsas rasvases kirjas. Avaleht kolme lõiguna: Mängi, Õpi, Võistle. Väljakud piktogrammina
  (peidetud SVG sümbolid `#ct-t` ja `#ct-p` `<body>` alguses, sama mõõtkava), püramiid püramiidina, MV pjedestaal.
- Lehe „Mängimine ja hinnad“ nimi on eelvaates „Väljakud ja hinnad“; aadress (`mangimine/`) on sama.
- Kliendi lingile viimiseks: tõsta `v8/` failid kausta `fellin/` asemele (pilditeed `../img/` → `img/`, alamlehtedel `../../img/` → `../img/`),
  lisa tagasi `arvustus.js` rida ja prototüübiriba `id="proto"` ning lisa `kommentaarid.json`-i versiooni 8 kirje.
  Leht `kontsept/` kasutab versiooni 7 `fellin.css`-i ja Interi fonte — otsusta enne, mis sellest saab.

## Ülesehitus (versioonist 7)

Avaleht on lühike (telefonis ~3 ekraani); detailne sisu on neljal alamlehel.

| Leht | Fail | Sisu |
|---|---|---|
| Avaleht | `index.html` | avaplokk, „Tahan mängida / õppida / võistelda“, tunnihind alates, VÜS esikolmik, kontakt; schema.org klubi + mängukohad |
| 01 Mängimine ja hinnad | `mangimine/index.html` | mängukohad koos hinnatabelitega, broneerimine, liikmepakett, KKK |
| 02 Treeningud | `treeningud/index.html` | lapsed/täiskasvanud, õppemaks, soodustused, trenni küsimine, treenerid ja kutsed, KKK; schema.org kool |
| 03 Võistlused | `voistlused/index.html` | VÜS esikümme, püramiid, maakonna MV, KKK |
| 04 Klubi ja kontakt | `klubi/index.html` | logod, ajalugu, kasvandikud, EL-i projektid (`#toetused`), kontakt ja kaart (`#kontakt`) |

Päis, menüü ja jalus (partnerid + EL-i embleem) on kõigil viiel lehel samad — muutes muuda kõigis.

## Failid

| Fail | Mis |
|---|---|
| `fellin.css` | ühine stiil (lihasatlas.raudla.com kujunduskeel) |
| `fellin.js` | ühine skript: lahtiolek, hooaeg, mobiilimenüü, edetabeli värske seis, e-posti kopeerimine, kaart |
| `llms.txt`, `robots.txt`, `sitemap.xml` | päris lehe jaoks (fellinrackets.ee juurkausta) |
| `fonts/` | Inter (opsz + wght 400–800) ja JetBrains Mono 600, woff2, latin + latin-ext (Google Fonts, OFL) |
| `img/` | logod, järvefoto (640/1280/1920 WebP), EL-i ja partnerite logod — klubi materjal fellinrackets.ee-st |
| `arvustus.js` | kommenteerimise kiht — **ainult ettepaneku ajaks** |
| `kommentaarid.json` | kommentaarid + versioonide ajalugu |

## Kommentaaride töövoog

1. Klient kommenteerib → `/api/fellin-kommentaar` kirjutab `kommentaarid.json`-i (commit `[skip ci]`, lehte uuesti ei ehitata).
2. `git pull` → loe `kommentaarid.json`, tee muudatused.
3. Märgi tehtud kommentaarid: `"staatus": "tehtud"` (või `"jaab"` = jääb nii) ja lisa `"markus": "…"`.
4. Lisa `versioonid` lõppu uus kirje (`nr`, `kuupaev`, `muudatused`) → commit + push.

Osa tunnuse (`data-osa`) eesliide ütleb lehe: `m-` mängimine, `t-` treeningud, `v-` võistlused, `k-` klubi,
eesliiteta = avaleht; `jalus` ja `uldine` on ühised. „Kommentaarid“ näitab kõigi lehtede kommentaare.

Kohalik proov ilma serverita: `http://localhost:8765/fellin/?mock=1` (alamlehtedel samuti `?mock=1`)
Testid: `node scripts/test_fellin_kommentaar.mjs`

## Enne päris avaldamist

- kustuta `arvustus.js`, `kommentaarid.json`, see README
- kõigist viiest HTML-failist eemalda `.proto` riba ja `<script src="…arvustus.js">` rida (mõlemad märgitud `ARVUSTUS`).
  Prototüübiriba, juhiseriba, kommenteerimisnupud ja dialoog tekivad ainult `arvustus.js`-ist —
  pärast nende ridade eemaldamist ei jää lehtedele ühtegi prototüübi elementi.
- `llms.txt`, `robots.txt`, `sitemap.xml` → fellinrackets.ee juurkausta
- kontrolli päris iPhone'i Safaris ja ühes Androidi brauseris, VoiceOveri ja NVDA-ga (menüü, dialoogid, KKK, kaart)

## Avatud küsimused klubile (sisu, mida ei tohi oletada)

Seis 09.11.2026 (versioon 7). Kuni vastuseni on lehel ainult kinnitatud info.

1. **Hinnad:** kas hind on „€ väljaku kohta tunnis“? Siis lisame selle tabelite juurde.
2. **Väliväljakud 2027:** hooaja hinnad ja täpsed lahtiolekuajad. Praegu on teada ainult „maist oktoobrini
   iga päev“; 2026. a hinnaridadest tuleneb E–R 6–23, nädalavahetuse kellaajad pole kirjas — seetõttu kaardil kellaaegu pole.
3. **Eratreening:** kas pakute, kellele ja mis hinnaga?
4. **Trenni registreerimine:** kas soovite veebivormi? Selleks on vaja päris vastuvõtjat
   (nt e-posti saatmisteenus). Praegu avab nupp e-kirja valmis küsimustega.
   Tunniplaan, vastamisaeg ja proovitrenni võimalus vajavad kinnitust.
5. **Uksekood ei tööta:** kas +372 5036 425 on õige abikanal ja mis kellaaegadel vastatakse?
6. **Mängukohtade praktiline info:** parkimine ja sissepääs, varustuse laenutus (reketid, pallid),
   jalanõud, riietus- ja pesuruumid väljas, füüsiline ligipääs (astmed/kaldtee, ukse laius, ligipääsetav WC).
7. **Fotod (klubi õigustega):** sisehall seest, mängijad, laste trenn; treenerite portreed.
8. **Tulevased võistlused:** kuupäevad, tase ja registreerimislink.
9. **Treenerid:** Anelle Luik ei ole spordiregistris klubi treenerite hulgas — kas treenib klubis?
   Diana Klavan ja Priscilla Õmblus on registris padelitreenerid ilma kutseta — kas nii jääb?
10. **Liikmelisus:** kas Matchi liikmelisuse leht müüb just 49 € aastapaketti? Kas lause „pakett tasub end ära
    13 padeli- või 25 tennisetunniga aastas“ sobib (arvutatud hinnakirjast: soodustus 4 € / 2 € tunnilt;
    kehtib liikme enda broneeringutel)?
11. **Kaart:** „Viljandi Tennis“ kaardil on kolmas märk „Kontor“ — kas see jääb kaardile?
12. **EL-i toetuse teavitus:** embleem ja „Rahastanud Euroopa Liit – NextGenerationEU“ on iga lehe jaluses,
    projektide kirjeldused lehel Klubi ja kontakt (`klubi/#toetused`). Kas see vastab toetuse andja
    (EIS, endine EAS) teavitusnõuetele, või peab kirjeldus olema avalehel?

## Sisu hooldus

- KKK tekst on nii lehel (`.faq-list`) kui sama lehe päise FAQPage JSON-LD-s — muuda mõlemas sõna-sõnalt ühtemoodi.
- Põhimõte: iga fakt ühes kohas. Hinnad on mängukoha kaardil (avalehel ainult „alates“), uksekood sisehalli kaardil.
  Teisejärguline info läheb `<details class="more">` sisse.
- Edetabeli varuandmed (`#vus-list`, `#pyr-list`, `#pyr-top`, `data-asof`) on HTML-is; värske seis laaditakse edetabelist peale.
- EL-i embleem peab jääma vähemalt sama suureks kui suurim partnerilogo (jaluses EL-i logo laius 220 px ≈ 72 px kõrge sisu;
  partnerilogod 56 px kõrged, telefonis 200 px / 44 px).
