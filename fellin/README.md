# Fellin Racketsi avalehe ettepanek

Uue fellinrackets.ee avalehe prototüüp, mida klubi saab kommenteerida.

- Aadress: `https://viljandi-edetabel.pages.dev/fellin/` (kommenteerimiseks lingis `?k=…` võti — võti ise repos ei ole, ainult selle räsi `functions/api/fellin-kommentaar.js`-is)
- Google seda ei indekseeri (`_headers`: `X-Robots-Tag: noindex`)

## Failid

| Fail | Mis |
|---|---|
| `index.html` | avaleht (päris sisu + schema.org JSON-LD) |
| `llms.txt`, `robots.txt`, `sitemap.xml` | päris lehe jaoks (fellinrackets.ee juurkausta) |
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
- `index.html`-ist eemalda `.proto` riba ja `<script src="arvustus.js">` rida (mõlemad märgitud `ARVUSTUS`)
- `llms.txt`, `robots.txt`, `sitemap.xml` → fellinrackets.ee juurkausta
