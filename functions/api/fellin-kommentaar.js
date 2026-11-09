// Cloudflare Pages Function: Fellin Racketsi avalehe ettepaneku kommentaarid.
//
//   GET  /api/fellin-kommentaar  → { versioonid, kommentaarid }
//   POST /api/fellin-kommentaar  { k, osa, osa_nimi, nimi, tekst, vastus_id?, veeb? }
//                                → { ok, andmed }
//
// Kommentaarid elavad failis fellin/kommentaarid.json (GitHubi Contents API,
// env GITHUB_TOKEN — sama mis püramiidil). Leht loeb need selle funktsiooni
// kaudu otse GitHubist, seepärast on commit-sõnumis "[skip ci]": Cloudflare
// Pages ei pea iga kommentaari peale lehte uuesti ehitama.
//
// Kirjutamiseks on vaja võtit, mis on kliendile saadetud lingis (?k=…).
// Siin on ainult võtme SHA-256 räsi — võti ise koodi ei satu.

const FILE_PATH = "fellin/kommentaarid.json";
const VOTME_RASI = "abdd806680998a43c4f7a5e27e89294c954eb54ea55313225c87b5d038281a0e";
const MAX_KOMMENTAARE = 500;
const MAX_TEKST = 3000;
const KATSEID = 3;

// ---------- abid ----------

function safeEqual(a, b) {
  const ea = new TextEncoder().encode(String(a || ""));
  const eb = new TextEncoder().encode(String(b || ""));
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

async function sha256hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(s || "")));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64decodeUtf8(b64) {
  const bin = atob(String(b64).replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function b64encodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function uusId() {
  const b = new Uint8Array(4);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

const vastus = (obj, status = 200) =>
  Response.json(obj, { status, headers: { "Cache-Control": "no-store" } });

function gh(env) {
  const owner = env.GITHUB_OWNER || "priitraudla-tech";
  const repo = env.GITHUB_REPO || "viljandi-edetabel";
  const ref = env.GITHUB_REF || "main";
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "fellin-kommentaar-fn",
  };
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${FILE_PATH}`;
  return {
    async loe() {
      // t= väldib vahemälu — kommentaar peab kohe nähtav olema.
      const r = await fetch(`${url}?ref=${ref}&t=${Date.now()}`, { headers });
      if (!r.ok) throw Object.assign(new Error(`GitHub lugemine ebaõnnestus (${r.status}).`), { status: 502 });
      const f = await r.json();
      return { data: JSON.parse(b64decodeUtf8(f.content)), sha: f.sha };
    },
    async kirjuta(data, sha, message) {
      return fetch(url, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          message,
          content: b64encodeUtf8(JSON.stringify(data, null, 2) + "\n"),
          sha,
          branch: ref,
        }),
      });
    },
  };
}

// Kontrolli ja puhasta sisend. Tagastab kommentaari (ilma id/aja) või viskab vea.
function valideeri(body, olemas) {
  const tekst = String(body.tekst || "").trim();
  const nimi = String(body.nimi || "").trim();
  const osa = String(body.osa || "").trim();
  const osa_nimi = String(body.osa_nimi || "").trim().slice(0, 80);
  const vastus_id = body.vastus_id ? String(body.vastus_id) : null;

  if (!tekst) throw new Error("Kommentaar on tühi.");
  if (tekst.length > MAX_TEKST) throw new Error(`Kommentaar on liiga pikk (max ${MAX_TEKST} märki).`);
  if (!nimi) throw new Error("Lisa oma nimi.");
  if (nimi.length > 60) throw new Error("Nimi on liiga pikk.");
  if (!/^[a-z0-9-]{1,40}$/.test(osa)) throw new Error("Tundmatu lehe osa.");
  if (vastus_id) {
    const ylem = olemas.find((c) => c.id === vastus_id);
    if (!ylem) throw new Error("Kommentaari, millele vastad, ei leitud.");
  }
  if (olemas.length >= MAX_KOMMENTAARE) throw new Error("Kommentaaride piir on täis — anna Priidule teada.");
  return { osa, osa_nimi: osa_nimi || osa, nimi, tekst, vastus_id };
}

// ---------- handlerid ----------

export async function onRequestGet(context) {
  if (!context.env.GITHUB_TOKEN) return vastus({ ok: false, error: "GITHUB_TOKEN pole seadistatud." }, 500);
  try {
    const { data } = await gh(context.env).loe();
    return vastus(data);
  } catch (e) {
    return vastus({ ok: false, error: e.message }, e.status || 500);
  }
}

export async function onRequestPost(context) {
  const env = context.env;
  let body;
  try {
    body = await context.request.json();
  } catch {
    return vastus({ ok: false, error: "Vigane päring." }, 400);
  }

  // env.FELLIN_VOTME_RASI lubab võtit vahetada ilma koodi muutmata (ja testidel oma võtit kasutada).
  if (!safeEqual(await sha256hex(body.k), env.FELLIN_VOTME_RASI || VOTME_RASI)) {
    return vastus({ ok: false, error: "Kommenteerimiseks ava link, mille said Priidult." }, 403);
  }
  // Mesipott: inimene seda välja ei näe, robot täidab.
  if (body.veeb) return vastus({ ok: true, andmed: null });
  if (!env.GITHUB_TOKEN) return vastus({ ok: false, error: "GITHUB_TOKEN pole seadistatud." }, 500);

  const repo = gh(env);
  // Kui keegi teine kirjutas vahepeal (sha muutus), loe uuesti ja proovi veel.
  for (let katse = 1; katse <= KATSEID; katse++) {
    let data, sha, uus;
    try {
      ({ data, sha } = await repo.loe());
      data.kommentaarid = data.kommentaarid || [];
      uus = {
        id: uusId(),
        ...valideeri(body, data.kommentaarid),
        aeg: new Date().toISOString(),
        staatus: "avatud",
      };
    } catch (e) {
      return vastus({ ok: false, error: e.message }, e.status || 400);
    }
    data.kommentaarid.push(uus);

    const r = await repo.kirjuta(data, sha,
      `fellin: kommentaar — ${uus.osa_nimi} (${uus.nimi}) [skip ci]`);
    if (r.ok) return vastus({ ok: true, andmed: data });
    if (r.status !== 409 && r.status !== 422) {
      return vastus({ ok: false, error: `GitHub kirjutamine ebaõnnestus (${r.status}).` }, 502);
    }
  }
  return vastus({ ok: false, error: "Salvestamine ei õnnestunud — proovi uuesti." }, 503);
}
