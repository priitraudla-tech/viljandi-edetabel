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
