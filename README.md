# Viljandi üksikmängu edetabel

Interaktiivne edetabel + ajalugu, mis sünkroonib end igapäevaselt
[Google Sheets dokumendiga](https://docs.google.com/spreadsheets/d/1QMf8anC80lXGYdrb2fHlYOf8ETyksbOo/edit?gid=1281577154).

Disain on inspireeritud [ElevenLabsi disainisüsteemist](https://getdesign.md/elevenlabs/design-md):
ülivalge taust soojade varjunditega, kerge Inter-tüpograafia, mitmekihiline
sub-0.1 läbipaistvusega vari, pill-vormis nupud.

## Funktsioonid

- **Edetabel** — sorteeritav (klõpsa veerule), otsing, 0-punkti ridade peitmine.
- **Δ veerg** — näitab koha muutust eelmise snapshot'iga võrreldes:
  - `▲ N` (roheline) — tõusis N koha võrra
  - `▼ N` (punane) — langes N koha võrra
  - `—` — koht ei muutunud
  - `uus` — mängija ilmus tabelisse esmakordselt
  - Esimesel käivitamisel kuvatakse kõik kui `—`, sest võrdlust pole.
- **Trend** — graafik mängija koha / punktide / etapi-tulemuste muutumisest.
- **Ajalugu** — kuupäeva valik + vastava päeva snapshot.
- **Turniir** — viimase (või valitud) turniiri poodium + osaliste järjestus.
  Kui sellele turniirile on `data/turniirid/<kuupäev>.json` olemas, ilmub
  ka **Tabel** toggle, mis kuvab täielikku bracketi / grupistaadiumi.

## Püramiid (puramiid.html)

Eraldi leht väljakutsete-süsteemi jaoks: visuaalne püramiid, mängitud mängud,
ootel väljakutsed ja automaatne statistika. Andmed: `data/puramiid.json`.

- **Mängutüübid:** `tavaline`, `mv` (Viljandi maakonna MV), `arvestusevaline`
  (sulgudes olnud mängud — kuvatakse hallina, ei mõjuta statistikat ega kohti).
- **Kohavahetus:** väljakutsuja võit vahetab kohad automaatselt (halduri vormis
  saab linnukesega välja lülitada). Arvestusevälised mängud kohti ei muuda.
- **Haldamine:** lehe nupp "Halda" → parool → vormid *Uus väljakutse* ja
  *Sisesta tulemus*. Kirjutamine käib Netlify Function
  (`netlify/functions/puramiid-update.mjs`) kaudu, mis kontrollib parooli
  serveri poolel ja commit'ib muudatuse GitHubi → Netlify deploy'b (~1 min).
- **Seadistus (ühekordne):** Netlify → Environment variables →
  lisa `PYRAMID_ADMIN_PASSWORD` (haldusparool). `GITHUB_TOKEN` on juba olemas.
- **Ühekordne import Excelist:** `python scripts/import_puramiid.py <fail.xlsx>`.

## Bracketi-andmete lisamine uue etapi kohta

Iga turniiri kohta võib repos olla detailne bracketi-JSON:

```
data/turniirid/YYYY-MM-DD.json
```

Failinime kuupäev peab täpselt vastama selle etapi kuupäevale Google Sheetsis
(nt `4. etapp 25.04.2026` → `2026-04-25.json`). Sait avastab faili automaatselt
ja kuvab "Tabel" toggle Turniir vahekaardis.

### Toetatud formaadid

**1. Single-elimination + lohutused** (nt 16-mängija turniirid).
Vaata näidet: [`data/turniirid/2026-04-25.json`](data/turniirid/2026-04-25.json).
Sisaldab `pohitabel` (1. ring / veerandfinaal / poolfinaal / finaal),
`kohamang_5_8`, `lohutused_grupp_A` (ringsüsteem), `lohutused_grupp_B`
(mini-bracket) ja `loppjarjestus`.

**2. Alagrupid + positsioonimängud** (nt 9-mängija turniirid).
Vaata näidet: [`data/turniirid/2026-06-28.json`](data/turniirid/2026-06-28.json).
Vajab `"formaat": "alagrupid"` välja juurelt. Sisaldab `alagrupid[]` (iga grupp
on round-robin tabeliga), `positsioonimangud[]` (kohamängud grupivõitjate vahel
ja allpool), ja `loppjarjestus`.

### Üksikud väljad

- **`skoor: "6-4"`** — kahepunktiline tulemus, kuvatakse kui `6/4`.
- **`skoor: "w/o"`** — walkover. Kaotaja näeb `—`.
- **`skoor: "ret."`** — vastane katkestas.
- **`skoor: "?"`** — skoor pole teada (kuvatakse `?`).
- **`punktid: 100`** lõppjärjestuse kirjel — kuvatakse parempoolse `100 p` sildina.
  Veendu, et see vastaks Google Sheetsi etapi-veeru väärtustele.
- **`markus: "..."`** — vabasõnaline märkus (kuvatakse legendina sektsiooni all).
- **`staatus: "ei mängitud"`** — kohamäng, mis jäi mängimata (kuvatakse hallina).

### Kontroll-checklist uue bracketi-faili lisamisel

- [ ] Failinimi vastab Sheetsi kuupäevale (`YYYY-MM-DD.json`)
- [ ] `loppjarjestus` punktid vastavad Google Sheetsi väärtustele
- [ ] Kõik mängijate nimed identsed Sheetsis kasutatavatega (sh täpitähed)
- [ ] Tundmatu skoori asemel `"?"` (mitte tühi)
- [ ] Test lokaalselt: `python -m http.server 8765`, ava
      `http://localhost:8765`, mine Turniir tab → "Tabel" toggle

## Struktuur

```
viljandi-edetabel/
├── index.html          # leht
├── style.css
├── app.js              # interaktiivsus (sortimine, otsing, ajalugu, trendigraafik)
├── scripts/
│   └── fetch.py        # tõmbab CSV ja salvestab JSON + päeva snapshot'i
├── data/
│   ├── current.json    # kõige värskem seis (taasloodud iga jooksuga)
│   ├── history.json    # ajaloo kuupäevade indeks
│   ├── history/        # YYYY-MM-DD.json — ainult päevad, mil andmed muutusid
│   └── turniirid/      # YYYY-MM-DD.json — turniiritabeli (bracketi) andmed
└── .github/workflows/
    └── update.yml      # cron iga päev 04:00 UTC
```

## Lokaalne käivitus

```bash
# 1. Tõmba uusim seis
python scripts/fetch.py

# 2. Käivita kohalik server (vajalik, sest fetch() vajab http://, mitte file://)
python -m http.server 8000
# Ava http://localhost:8000
```

Kui käivitad lehe otse failina (`file://`), siis brauser keelab JSON-i lugemise.

## Hosting: Cloudflare Pages (soovitatud)

Netlify tasuta plaan läks krediidipõhiseks (300 kr/kuus, deploy = 15 kr) —
meie sagedaste deploy'dega süsteemile ei sobi. Cloudflare Pages on tasuta
piiramatu ribalaiuse, 500 deploy/kuus ja 100k funktsioonipäringuga päevas.

Serverifunktsioonid on porditud: `functions/api/refresh.js` ja
`functions/api/puramiid-update.js` (Pages Functions vorming, teed `/api/*`).
Sama kood repos töötab mõlemal platvormil — Netlify jaoks on `netlify.toml`-is
redirect `/api/* → /.netlify/functions/*`.

### Seadistus (ühekordne)

1. Konto: https://dash.cloudflare.com/sign-up (tasuta, e-post + parool)
2. Dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git** → autoriseeri GitHub → vali repo `viljandi-edetabel`
3. Build settings:
   - Framework preset: **None**
   - Build command: *(tühi)*
   - Build output directory: `/`
4. **Save and Deploy** → esimene deploy ~1 min
5. Settings → **Environment variables** → lisa (Production):
   - `GITHUB_TOKEN` — sama PAT mis Netlify's
   - `PYRAMID_ADMIN_PASSWORD` — haldusparool
6. Deployments → **Retry deployment** (et env-muutujad jõustuksid)

Sait: `https://<projekti-nimi>.pages.dev`. Iga GitHub push deploy'b
automaatselt, nagu Netlify's.

## Deploy Netlify-le

1. Lükka see kaust eraldi GitHubi repona üles
   (NB: hoia eraldi Kalkulaatori projektist, sest GitHub Actions saadab git push commit'e).
2. Netlifys: **Add new site → Import from GitHub → vali repo**.
3. Build settings:
   - Base directory: tühi (või `viljandi-edetabel` kui jätsid alamkausta)
   - Build command: tühi
   - Publish directory: `.`
   - Tänu `netlify.toml` failile peaks see automaatselt sobima.

## Igapäevane uuendus

GitHub Actions workflow (`.github/workflows/update.yml`) jookseb iga päev kell
04:00 UTC, käivitab `scripts/fetch.py`, ja kui andmed muutusid — commit + push.
Netlify näeb uut commit'i ja deploy'b automaatselt.

Manuaalseks käivitamiseks: GitHub repo → **Actions → Uuenda edetabel → Run workflow**.

### GitHub Actions õigused

Actions vajab `contents: write` õigust, et commit + push teha. See on workflow
failis juba seadistatud, aga repo settings'is võib olla vaja:
**Settings → Actions → General → Workflow permissions → "Read and write permissions"**.

## Ajaloo loogika

`fetch.py` võrdleb uut tulemust eelneva snapshot'iga (mängijate nimekiri,
tulemused, etappide list). Ainult muutuste korral tekib uus
`data/history/YYYY-MM-DD.json`. Nii ei tekita igapäevane jooks tühje commit'e.

## Bracketi-andmed (turniiri tabel)

Iga turniiri kohta võib `data/turniirid/` alla lisada JSON-faili, mis kirjeldab
põhitabeli, kohamängud, lohutused ja lõppjärjestuse koos punktidega. Kui see
fail on olemas, ilmub "Turniir" tab'i toggle "Punktid / Tabel"; muidu jääb
ainult olemasolev punktide-vaade.

### Failinimi

```
data/turniirid/YYYY-MM-DD.json
```

Kuupäev peab vastama `current.json`-i `stages[].date`-väljale (nt
`2026-04-25.json` = "4. etapp 25.04.2026").

### Skeem (kokkuvõte)

```jsonc
{
  "turniir":   { "nimi": "...", "kuupaev": "YYYY-MM-DD", "asukoht": "..." },
  "mangijad":  [{ "id": 1, "nimi": "Viljar Vahemaa", "asetus": 1 }, ...],
  "pohitabel": {
    "round_1":         [{ "voitja": "...", "kaotaja": "...", "skoor": "6-4" }, ...],
    "veerandfinaalid": [...],
    "poolfinaalid":    [...],
    "finaal":          { "voitja": "...", "kaotaja": "...", "skoor": "6-4" },
    "koht_3_4":        { "voitja": "...", "kaotaja": "...", "skoor": "6-3" }
  },
  "kohamang_5_8": {
    "poolfinaalid": [...],
    "koht_5_6":    { "staatus": "ei mängitud" },  // või { "voitja": ..., "skoor": ... }
    "koht_7_8":    { "staatus": "ei mängitud" }
  },
  "lohutused_grupp_A": {
    "formaat": "ringsüsteem",
    "mangud":  [{ "voitja": "...", "kaotaja": "...", "skoor": "6-4" }, ...],
    "tabel":   [{ "koht": 1, "mangija": "...", "voidud": 2, "kaotused": 0 }, ...]
  },
  "lohutused_grupp_B": {
    "formaat":      "play-off (4 mängijat)",
    "poolfinaalid": [...],
    "finaal":       { ... },
    "koht_3_4":     { ... }
  },
  "loppjarjestus": [
    { "koht": 1,     "mangija": "Viljar Vahemaa",   "punktid": 100 },
    { "koht": "5-6", "mangija": "Ilja Balabko",     "punktid": 28, "markus": "..." },
    ...
  ]
}
```

### Konventsioonid

- **Mängijaid identifitseeritakse nime järgi (string)**, mitte ID-ga.
- `skoor` formaat: `"6-4"`, `"7-5"`, `"w/o"` walkoveri puhul, `"ret."` katkestuse
  puhul, `"?"` kui skoor teadmata.
- `koht` võib olla number (`1`, `2`, ...) või jagatud koha string (`"5-6"`).
- `punktid` lisamine `loppjarjestus`-kirjele on kohustuslik — komponent kuvab
  need otse, ilma arvutamata.
- `kohamang_5_8.koht_5_6.staatus = "ei mängitud"` puhul kuvatakse positsiooni-
  mäng hallina (faded), mängijad tuletatakse poolfinaalide võitjatest/kaotajatest.

### Validatsioon

Punktide õigsust saab kontrollida vastu `data/current.json`-i samanimelise
etapi tulpa — punktid peaksid kattuma.

## Andmestruktuur (`current.json`)

```json
{
  "title": "Viljandi üksikmängu edetabel (27.04.2026 seisuga)",
  "fetched_at": "2026-04-25T...Z",
  "stages": [
    { "label": "5. etapp 29.06.2025", "date": "2025-06-29" },
    ...
  ],
  "players": [
    {
      "rank": 1, "name": "Viljar Vahemaa", "total": 780,
      "stages": { "5. etapp 29.06.2025": 100, ... },
      "tournaments_played": 4, "average": 195.0
    },
    ...
  ],
  "participants_per_stage": { "5. etapp 29.06.2025": 9, ... }
}
```
