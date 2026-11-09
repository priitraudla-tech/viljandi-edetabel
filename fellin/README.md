# Fellin Racketsi avalehe ettepanek

Uue fellinrackets.ee avalehe prototüüp, mida klubi saab kommenteerida.

- Aadress: `https://viljandi-edetabel.pages.dev/fellin/` (kommenteerimiseks lingis `?k=…` võti — võti ise repos ei ole, ainult selle räsi `functions/api/fellin-kommentaar.js`-is)
- Google seda ei indekseeri (`_headers`: `X-Robots-Tag: noindex`)

## Failid

| Fail | Mis |
|---|---|
| `index.html` | avaleht (päris sisu + schema.org JSON-LD) |
| `llms.txt`, `robots.txt`, `sitemap.xml` | päris lehe jaoks (fellinrackets.ee juurkausta) |
| `fonts/` | Inter (opsz + wght 400–800) ja JetBrains Mono 600, woff2, latin + latin-ext (Google Fonts, OFL) |
| `img/` | logod, järvefoto (640/1280/1920 WebP), EL-i ja partnerite logod — klubi materjal fellinrackets.ee-st |
| `arvustus.js` | kommenteerimise kiht — **ainult ettepaneku ajaks** |
| `kommentaarid.json` | kommentaarid + versioonide ajalugu |

## Kommentaaride töövoog

1. Klient kommenteerib → `/api/fellin-kommentaar` kirjutab `kommentaarid.json`-i (commit `[skip ci]`, lehte uuesti ei ehitata).
2. `git pull` → loe `kommentaarid.json`, tee muudatused `index.html`-is.
3. Märgi tehtud kommentaarid: `"staatus": "tehtud"` (või `"jaab"` = jääb nii) ja lisa `"markus": "…"`.
4. Lisa `versioonid` lõppu uus kirje (`nr`, `kuupaev`, `muudatused`) → commit + push.

Kohalik proov ilma serverita: `http://localhost:8765/fellin/?mock=1`
Testid: `node scripts/test_fellin_kommentaar.mjs`

## Enne päris avaldamist

- kustuta `arvustus.js`, `kommentaarid.json`, see README
- `index.html`-ist eemalda `.proto` riba ja `<script src="arvustus.js">` rida (mõlemad märgitud `ARVUSTUS`).
  Prototüübiriba, juhiseriba, kommenteerimisnupud ja dialoog tekivad ainult `arvustus.js`-ist —
  pärast nende kahe rea eemaldamist ei jää lehele ühtegi prototüübi elementi.
- `llms.txt`, `robots.txt`, `sitemap.xml` → fellinrackets.ee juurkausta
- kontrolli päris iPhone'i Safaris ja ühes Androidi brauseris, VoiceOveri ja NVDA-ga (menüü, dialoogid, KKK, kaart)

## Avatud küsimused klubile (sisu, mida ei tohi oletada)

Seis 09.11.2026 (versioon 5). Kuni vastuseni on lehel ainult kinnitatud info.

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

## Sisu hooldus

- KKK tekst on nii lehel (`#faq-list`) kui päise FAQPage JSON-LD-s — muuda mõlemas sõna-sõnalt ühtemoodi.
- Edetabeli varuandmed (`#vus-list`, `#pyr-list`, `data-asof`) on HTML-is; värske seis laaditakse edetabelist peale.
- EL-i toetuse embleem peab jääma vähemalt sama suureks kui suurim partnerilogo (praegu EL-i logo laius 260 px ≈ 84 px kõrge sisu; partnerilogod kuni 72 px kõrged).
