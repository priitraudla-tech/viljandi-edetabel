# viljandi-mv-cron

Cloudflare Worker, mis äratab MV-uuenduse **täpsel ajal**.

## Miks

GitHubi enda cron on tasuta plaanil „mitte varem kui", mitte täpne aeg.
17.–18.08.2026 mõõdetud vahed kahe jooksu vahel:

```
30, 57, 88, 63, 49, 55, 33, 53, 46, 47, 60, 100 min  → keskmine ~57, halvim 100
```

Cloudflare'i cron käivitub minutipealt, ja `workflow_dispatch`'iga käivitatud
jooks **ei lähe GitHubi ajastusjärjekorda** — see stardib sekunditega.

## Mida see teeb

Ainult ühte asja: vajutab GitHubis „Run workflow" nuppu.

```
Cloudflare cron  →  Worker  →  GitHub workflow_dispatch  →  mv.yml
                                                              ↓
                                          scripts/mv_fetch.py (tournated → data/)
```

Tõmbamise ja püramiidi loogikat see **ei dubleeri**. Sama loogika kahes keeles
oleks koht, kus vead tekivad märkamatult — Worker on tahtlikult rumal.

## Seadistus (ühekordne)

```bash
cd worker
npx wrangler login
npx wrangler secret put GITHUB_TOKEN
npx wrangler deploy
```

**`GITHUB_TOKEN`** peab tohtima Actionit käivitada:
klassikalisel tokenil `repo` + `workflow`, peeneteralisel `Actions: read+write`.
See on sama token, mis on juba Cloudflare Pages'i keskkonnamuutujates —
Worker on Pages'ist eraldi teenus ja vajab oma koopiat.

### Valikuline: käsitsi käivitamise URL

```bash
npx wrangler secret put TRIGGER_KEY     # mõtle välja pikk juhuslik sõne
```

Siis saab uuenduse käivitada ka lingiga:

```
POST https://viljandi-mv-cron.<sinu-alamdomeen>.workers.dev/trigger?key=<TRIGGER_KEY>
```

Kui `TRIGGER_KEY` on seadmata, on see otspunkt välja lülitatud.

## Kontroll

```bash
node worker/test/test_dispatch.mjs     # ei vaja võrku ega tokenit
npx wrangler tail                      # logi reaalajas
```

Pärast juurutamist: Cloudflare dashboard → Workers & Pages →
`viljandi-mv-cron` → Settings → Triggers peab näitama cron-kirjet.

## Ajastus

`wrangler.toml` → `crons = ["*/30 * 17-21 8 *"]` — iga 30 min turniiripäevadel
17.–21. august, **UTC**.

**Järgmiseks aastaks** muuda kuupäevad kahes kohas: siin ja
`.github/workflows/mv.yml`-is.

## Üleminek

GitHubi enda cron on esialgu **alles**, varuvariandiks. Kaks käivitajat ei tee
kahju: `mv.yml`-is on `concurrency: mv-fetch`, mis ei lase kahel jooksul
korraga käia, ja kui andmed pole muutunud, ei tehta commiti.

Kui Worker on paar päeva töötanud, võib `mv.yml`-ist `schedule:` ploki
eemaldada — `workflow_dispatch` jääb alles, nii et käsitsi käivitamine ja
Workeri käivitus töötavad edasi.
