// Kliendi kommentaarid avalehe ettepanekule.
//
// Iga [data-osa] plokk saab kollase "💬 Kommenteeri" nupu. Kommentaarid
// salvestuvad /api/fellin-kommentaar kaudu faili fellin/kommentaarid.json.
// Kommenteerimiseks on vaja lingis olevat võtit (?k=…), lugeda saab ilma.
//
// Kohalik proov ilma serverita: http://localhost:8765/fellin/?mock=1
// (kommentaarid jäävad ainult brauserisse).
//
// ENNE AVALDAMIST fellinrackets.ee-s: kustuta see fail ning index.html-ist
// .proto riba ja <script src="arvustus.js"> rida.

(function () {
  "use strict";

  const API = "/api/fellin-kommentaar";
  const qs = new URLSearchParams(location.search);
  const MOCK = qs.has("mock") && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

  const ls = (k, v) => {
    try {
      if (v === undefined) return localStorage.getItem(k);
      localStorage.setItem(k, v);
    } catch (e) { /* privaatrežiim — töötab ka ilma */ }
    return null;
  };
  if (qs.get("k")) ls("fr_k", qs.get("k"));
  const VOTI = qs.get("k") || ls("fr_k") || (MOCK ? "mock" : "");
  const saabKommenteerida = !!VOTI;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const aeg = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleString("et-EE",
      { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };
  const kommentaari = (n) => `${n} ${n === 1 ? "kommentaar" : "kommentaari"}`;
  const kuupaev = (iso) => {
    const [y, m, p] = String(iso || "").split("-");
    return p ? `${+p}.${m}.${y}` : "";
  };

  // ---------- lehe osad ----------
  const OSAD = [...document.querySelectorAll("[data-osa]")].map((el) => ({
    id: el.dataset.osa, nimi: el.dataset.osaNimi || el.dataset.osa, el,
  }));
  OSAD.push({ id: "uldine", nimi: "Üldine kommentaar", el: null });
  const osaNimi = (id) => (OSAD.find((o) => o.id === id) || {}).nimi || id;

  // ---------- andmed ----------
  let andmed = { versioonid: [], kommentaarid: [] };
  let laadimisViga = "";

  async function lae() {
    if (MOCK) {
      andmed = JSON.parse(ls("fr_mock") || "null") || {
        versioonid: [{ nr: 1, kuupaev: "2026-11-09", muudatused: ["Esimene ettepanek."] }],
        kommentaarid: [],
      };
      return;
    }
    try {
      const r = await fetch(API, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.status);
      andmed = j;
      laadimisViga = "";
    } catch (e) {
      laadimisViga = "Kommentaare ei õnnestunud laadida. Proovi lehte värskendada.";
    }
  }

  async function saada(c) {
    if (MOCK) {
      andmed.kommentaarid.push({
        id: Math.random().toString(16).slice(2, 10), ...c,
        aeg: new Date().toISOString(), staatus: "avatud",
      });
      ls("fr_mock", JSON.stringify(andmed));
      return;
    }
    const r = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...c, k: VOTI }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.error || "Saatmine ebaõnnestus — proovi uuesti.");
    if (j.andmed) andmed = j.andmed;
  }

  const juured = () => andmed.kommentaarid.filter((c) => !c.vastus_id);
  const vastused = (id) => andmed.kommentaarid.filter((c) => c.vastus_id === id);
  const osaJuured = (osa) => juured().filter((c) => c.osa === osa);
  const avatuid = () => juured().filter((c) => c.staatus !== "tehtud" && c.staatus !== "jaab").length;

  // ---------- stiil ----------
  const css = `
  .rv-bar { display:flex; justify-content:flex-end; margin-bottom:12px; }
  .rv-pin, .rv-fab, .rv-btn, .rv-link {
    font:600 14px/1.2 var(--font, system-ui); cursor:pointer; border:0; }
  .rv-pin { display:inline-flex; gap:7px; align-items:center; padding:7px 13px; border-radius:999px;
    background:#fff3b8; color:#5b4800; border:1.5px dashed #d9ad00; }
  .rv-pin:hover { background:#ffe98a; }
  .rv-pin .n { background:#d9ad00; color:#fff; border-radius:999px; padding:1px 8px; font-size:12.5px; }
  footer .rv-pin { background:#3a3420; color:#ffe98a; border-color:#8a7414; }
  .hero > .rv-bar { position:absolute; top:14px; left:0; right:0; z-index:2; margin:0; }
  header > .rv-bar { margin:0; padding-top:8px; padding-bottom:8px; background:var(--mist, #f4f7f1); }
  .rv-on { outline:3px solid #f2c500; outline-offset:-3px; }
  .rv-fab { position:fixed; right:18px; bottom:18px; z-index:60; padding:13px 18px; border-radius:999px;
    background:#ffd83d; color:#2b2200; box-shadow:0 6px 22px rgba(0,0,0,.22); display:flex; gap:8px; align-items:center; }
  .rv-fab .n { background:#2b2200; color:#ffd83d; border-radius:999px; padding:1px 8px; font-size:12.5px; }
  .rv-link { background:#ffd83d; color:#2b2200; padding:4px 11px; border-radius:999px; margin-left:8px; font-size:12.5px; }
  .proto { position:relative; z-index:30; }

  .rv-drawer { position:fixed; top:0; right:0; bottom:0; width:min(420px, 100vw); z-index:80; background:#fffdf4;
    box-shadow:-10px 0 40px rgba(0,0,0,.18); display:flex; flex-direction:column; transform:translateX(105%);
    transition:transform .22s ease; font:400 15px/1.5 var(--font, system-ui); color:#1d1d1b; }
  .rv-drawer.open { transform:none; }
  .rv-head { padding:16px 18px 12px; border-bottom:1px solid #eee3b8; display:flex; gap:10px; align-items:flex-start; }
  .rv-head h2 { font-size:18px; margin:0; letter-spacing:-.01em; line-height:1.25; flex:1; }
  .rv-head .sub { display:block; margin-top:4px; font-size:13px; font-weight:500; }
  .rv-x { background:none; border:0; font-size:26px; line-height:1; cursor:pointer; color:#555; padding:0 4px; }
  .rv-body { flex:1; overflow:auto; padding:14px 18px; }
  .rv-foot { border-top:1px solid #eee3b8; padding:12px 18px 16px; background:#fff8dc; }
  .rv-back { background:none; border:0; color:#1f4f8f; font:600 13px var(--font, system-ui); cursor:pointer; padding:0; }
  .rv-ver { background:#fff; border:1px solid #eee3b8; border-radius:12px; padding:11px 13px; margin-bottom:14px; font-size:14px; }
  .rv-ver ul { margin:6px 0 0; padding-left:18px; }
  .rv-group { margin-bottom:18px; }
  .rv-group h3 { font-size:14px; margin:0 0 8px; display:flex; justify-content:space-between; gap:8px; }
  .rv-group h3 button { background:none; border:0; color:#1f4f8f; font:600 13px var(--font, system-ui); cursor:pointer; padding:0; }
  .rv-c { background:#fff; border:1px solid #efe6c4; border-radius:12px; padding:10px 12px; margin-bottom:8px; }
  .rv-c .meta { font-size:12.5px; color:#7a7466; display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
  .rv-c .meta b { color:#1d1d1b; font-size:13.5px; }
  .rv-c .txt { white-space:pre-wrap; margin-top:4px; overflow-wrap:anywhere; }
  .rv-c .rep { margin:8px 0 0 12px; padding-left:10px; border-left:3px solid #efe6c4; }
  .rv-c .rep .rv-c { border:0; padding:4px 0; margin:0 0 6px; background:none; }
  .rv-tag { font-size:11.5px; font-weight:700; padding:2px 8px; border-radius:999px; }
  .rv-tag.tehtud { background:#e3f1e6; color:#2f6b3f; }
  .rv-tag.jaab { background:#ececec; color:#555; }
  .rv-note { margin-top:6px; background:#eef6f0; border-radius:8px; padding:6px 9px; font-size:13.5px; color:#2b4a33; }
  .rv-ans { background:none; border:0; color:#1f4f8f; font:600 12.5px var(--font, system-ui); cursor:pointer; padding:0; margin-top:6px; }
  .rv-empty { color:#7a7466; font-size:14px; padding:6px 0 14px; }
  .rv-form label { display:block; font-size:12.5px; font-weight:600; color:#5b5444; margin-bottom:4px; }
  .rv-form input, .rv-form textarea { width:100%; box-sizing:border-box; font:400 15px/1.45 var(--font, system-ui);
    border:1.5px solid #e2d7a8; border-radius:10px; padding:9px 11px; background:#fff; color:#1d1d1b; }
  .rv-form textarea { min-height:86px; resize:vertical; }
  .rv-form input:focus, .rv-form textarea:focus { outline:none; border-color:#d9ad00; box-shadow:0 0 0 3px rgba(242,197,0,.25); }
  .rv-row { display:flex; gap:10px; align-items:center; margin-top:10px; }
  .rv-btn { background:#2b2200; color:#ffd83d; padding:10px 18px; border-radius:999px; }
  .rv-btn:disabled { opacity:.5; cursor:default; }
  .rv-msg { font-size:13px; }
  .rv-msg.err { color:#9a3b3b; } .rv-msg.ok { color:#2f6b3f; }
  .rv-hp { position:absolute; left:-9999px; }
  .rv-intro { position:fixed; left:50%; bottom:22px; transform:translateX(-50%); z-index:90; width:min(460px, calc(100vw - 28px));
    background:#fffdf4; border:2px solid #f2c500; border-radius:16px; box-shadow:0 14px 40px rgba(0,0,0,.25);
    padding:18px 20px; font:400 15px/1.5 var(--font, system-ui); color:#1d1d1b; }
  .rv-intro h2 { font-size:18px; margin:0 0 8px; }
  .rv-intro ol { margin:0 0 14px; padding-left:20px; }
  .rv-intro li { margin-bottom:4px; }
  @media (max-width: 640px) {
    .rv-drawer { top:auto; width:100vw; height:86vh; border-radius:18px 18px 0 0; transform:translateY(105%); }
    .rv-fab { right:12px; bottom:12px; padding:11px 15px; }
  }
  @media print { .rv-bar, .rv-fab, .rv-drawer, .rv-intro { display:none !important; } }
  `;
  document.head.insertAdjacentHTML("beforeend", `<style>${css}</style>`);

  // ---------- nupud lehel ----------
  OSAD.filter((o) => o.el).forEach((o) => {
    const bar = document.createElement("div");
    bar.className = "wrap rv-bar";
    bar.innerHTML = `<button type="button" class="rv-pin" data-osa-pin="${esc(o.id)}"
      aria-label="Kommenteeri osa: ${esc(o.nimi)}">💬 Kommenteeri</button>`;
    // Täislaiusega plokkides (nt jalus) joonda nupp sisu laiusega.
    (o.el.querySelector(":scope > .shell") || o.el).prepend(bar);
  });

  const fab = document.createElement("button");
  fab.type = "button";
  fab.className = "rv-fab";
  document.body.append(fab);

  const drawer = document.createElement("aside");
  drawer.className = "rv-drawer";
  drawer.setAttribute("aria-label", "Kommentaarid");
  drawer.innerHTML = `<div class="rv-head"></div><div class="rv-body"></div><div class="rv-foot"></div>`;
  document.body.append(drawer);
  const [elHead, elBody, elFoot] = drawer.children;

  let vaade = null; // null = suletud, "koik" või osa id

  function uuendaLoendureid() {
    document.querySelectorAll("[data-osa-pin]").forEach((b) => {
      const n = osaJuured(b.dataset.osaPin).length;
      b.innerHTML = `💬 Kommenteeri${n ? ` <span class="n">${n}</span>` : ""}`;
    });
    const n = juured().length;
    fab.innerHTML = `💬 Kommentaarid${n ? ` <span class="n">${n}</span>` : ""}`;
    const proto = document.getElementById("proto");
    if (proto) {
      const v = andmed.versioonid[andmed.versioonid.length - 1];
      proto.innerHTML = `<b>Ettepanek${v ? ` · versioon ${v.nr}` : ""}</b> · uue fellinrackets.ee avalehe prototüüp — ei ole ametlik leht.` +
        `<button type="button" class="rv-link" data-rv-koik>💬 ${n ? kommentaari(n) : "Kommenteeri"}</button>`;
    }
  }

  // ---------- kommentaari kaart ----------
  function kaart(c, sygav) {
    const tag = c.staatus === "tehtud" ? `<span class="rv-tag tehtud">✓ Tehtud</span>`
      : c.staatus === "jaab" ? `<span class="rv-tag jaab">Jääb nii</span>` : "";
    const reps = sygav ? "" : vastused(c.id).map((r) => kaart(r, true)).join("");
    return `<div class="rv-c" data-id="${esc(c.id)}">
      <div class="meta"><b>${esc(c.nimi)}</b><span>${esc(aeg(c.aeg))}</span>${tag}</div>
      <div class="txt">${esc(c.tekst)}</div>
      ${c.markus ? `<div class="rv-note">↳ ${esc(c.markus)}</div>` : ""}
      ${reps ? `<div class="rep">${reps}</div>` : ""}
      ${!sygav && saabKommenteerida ? `<button type="button" class="rv-ans" data-vasta="${esc(c.id)}">Vasta</button><div class="rv-ansbox"></div>` : ""}
    </div>`;
  }

  function vorm(osa, vastus_id) {
    if (!saabKommenteerida) {
      return `<p class="rv-empty" style="margin:0;padding:0;">Kommenteerimiseks ava link, mille said Priidult.</p>`;
    }
    const nimi = ls("fr_nimi") || "";
    return `<form class="rv-form" data-osa="${esc(osa)}" ${vastus_id ? `data-vastus="${esc(vastus_id)}"` : ""}>
      <input class="rv-hp" name="veeb" tabindex="-1" autocomplete="off" aria-hidden="true" />
      ${vastus_id ? "" : `<label for="rv-tekst-${esc(osa)}">${osa === "uldine" ? "Üldine kommentaar kogu lehe kohta" : "Mida siin muuta, lisada või ära jätta?"}</label>`}
      <textarea id="rv-tekst-${esc(osa)}${vastus_id ? "-" + esc(vastus_id) : ""}" name="tekst" required maxlength="3000"
        placeholder="${vastus_id ? "Sinu vastus…" : "Nt „hind on vale“, „lisage parkimise info“, „see foto pole hea“…"}"></textarea>
      <div class="rv-row">
        <input name="nimi" required maxlength="60" placeholder="Sinu nimi" value="${esc(nimi)}" style="flex:1;" aria-label="Sinu nimi" />
        <button class="rv-btn" type="submit">Saada</button>
      </div>
      <div class="rv-msg" aria-live="polite"></div>
    </form>`;
  }

  function joonista() {
    if (!vaade) return;
    const v = andmed.versioonid[andmed.versioonid.length - 1];
    const viga = laadimisViga ? `<p class="rv-msg err">${esc(laadimisViga)}</p>` : "";

    if (vaade === "koik") {
      const n = juured().length, av = avatuid();
      elHead.innerHTML = `<h2>💬 Kõik kommentaarid<span class="sub" style="color:#7a7466;">${n ? `${kommentaari(n)} · ${av} ootel` : "Kommentaare veel pole"}</span></h2>
        <button type="button" class="rv-x" data-rv-sulge aria-label="Sulge">×</button>`;
      const ver = v ? `<div class="rv-ver"><b>Versioon ${v.nr}</b> · ${esc(kuupaev(v.kuupaev))}
        ${v.muudatused && v.muudatused.length ? `<ul>${v.muudatused.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}</div>` : "";
      const grupid = OSAD.map((o) => {
        const cs = osaJuured(o.id);
        if (!cs.length) return "";
        return `<div class="rv-group"><h3><span>${esc(o.nimi)}</span>
          ${o.el ? `<button type="button" data-rv-osa="${esc(o.id)}">Näita lehel →</button>` : ""}</h3>
          ${cs.map((c) => kaart(c)).join("")}</div>`;
      }).join("");
      elBody.innerHTML = viga + ver + (grupid || `<p class="rv-empty">Vajuta kollasele „💬 Kommenteeri“ nupule selle osa juures, mida tahad kommenteerida — või kirjuta allpool üldine kommentaar.</p>`);
      elFoot.innerHTML = vorm("uldine");
    } else {
      const cs = osaJuured(vaade);
      elHead.innerHTML = `<h2>💬 ${esc(osaNimi(vaade))}
          <span class="sub"><button type="button" class="rv-back" data-rv-koik>← Kõik kommentaarid (${juured().length})</button></span></h2>
        <button type="button" class="rv-x" data-rv-sulge aria-label="Sulge">×</button>`;
      elBody.innerHTML = viga + (cs.length ? cs.map((c) => kaart(c)).join("")
        : `<p class="rv-empty">Selle osa kohta kommentaare veel pole.</p>`);
      elFoot.innerHTML = vorm(vaade);
    }
  }

  function ava(v) {
    vaade = v;
    OSAD.forEach((o) => o.el && o.el.classList.toggle("rv-on", o.id === v));
    drawer.classList.add("open");
    joonista();
    const ta = elFoot.querySelector("textarea");
    if (ta && v !== "koik" && matchMedia("(min-width: 641px)").matches) ta.focus();
    // Värske seis serverist (teised võisid vahepeal kommenteerida).
    lae().then(() => { uuendaLoendureid(); if (vaade === v && !drawer.contains(document.activeElement)) joonista(); });
  }
  function sulge() {
    vaade = null;
    drawer.classList.remove("open");
    OSAD.forEach((o) => o.el && o.el.classList.remove("rv-on"));
  }

  // ---------- sündmused ----------
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.osaPin) { ava(t.dataset.osaPin); return; }
    if (t === fab || t.hasAttribute("data-rv-koik")) { ava("koik"); return; }
    if (t.hasAttribute("data-rv-sulge")) { sulge(); return; }
    if (t.dataset.rvOsa) {
      const o = OSAD.find((x) => x.id === t.dataset.rvOsa);
      if (o && o.el) o.el.scrollIntoView({ behavior: "smooth", block: "start" });
      ava(t.dataset.rvOsa);
      return;
    }
    if (t.dataset.vasta) {
      const box = t.nextElementSibling;
      const osa = (andmed.kommentaarid.find((c) => c.id === t.dataset.vasta) || {}).osa || "uldine";
      box.innerHTML = box.innerHTML ? "" : vorm(osa, t.dataset.vasta);
      const ta = box.querySelector("textarea");
      if (ta) ta.focus();
    }
  });

  drawer.addEventListener("submit", async (e) => {
    const f = e.target.closest("form.rv-form");
    if (!f) return;
    e.preventDefault();
    const msg = f.querySelector(".rv-msg");
    const btn = f.querySelector("button[type=submit]");
    const tekst = f.tekst.value.trim();
    const nimi = f.nimi.value.trim();
    if (!tekst) { msg.className = "rv-msg err"; msg.textContent = "Kirjuta kommentaar."; return; }
    if (!nimi) { msg.className = "rv-msg err"; msg.textContent = "Lisa oma nimi."; f.nimi.focus(); return; }
    ls("fr_nimi", nimi);
    btn.disabled = true;
    msg.className = "rv-msg"; msg.textContent = "Salvestan…";
    try {
      const osa = f.dataset.osa;
      await saada({
        osa, osa_nimi: osaNimi(osa), nimi, tekst,
        vastus_id: f.dataset.vastus || null, veeb: f.veeb.value,
      });
      uuendaLoendureid();
      joonista();
      const m = elFoot.querySelector(".rv-msg");
      if (m) { m.className = "rv-msg ok"; m.textContent = "Aitäh! Kommentaar on salvestatud."; }
      elBody.scrollTop = f.dataset.vastus ? elBody.scrollTop : elBody.scrollHeight;
    } catch (err) {
      btn.disabled = false;
      msg.className = "rv-msg err";
      msg.textContent = err.message;
    }
  });

  drawer.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && e.target.tagName === "TEXTAREA") {
      e.target.form.requestSubmit();
    }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && vaade) sulge(); });

  // ---------- esimese külastuse juhend ----------
  function juhend() {
    if (ls("fr_juhend") || !saabKommenteerida) return;
    const d = document.createElement("div");
    d.className = "rv-intro";
    d.setAttribute("role", "dialog");
    d.innerHTML = `<h2>Tere! See on uue kodulehe ettepanek.</h2>
      <ol>
        <li>Vaata leht rahulikult läbi.</li>
        <li>Vajuta kollasele <b>💬 Kommenteeri</b> nupule selle osa juures, mida tahad muuta.</li>
        <li>Kirjuta, mis on vale, puudu või üleliigne. Kõik kommentaarid näed nupust <b>💬 Kommentaarid</b> paremal all.</li>
      </ol>
      <p style="margin:0 0 14px;color:#5b5444;font-size:14px;">Teeme muudatused ja märgime kommentaari „✓ Tehtud“. Uus versioon ilmub samale aadressile.</p>
      <button type="button" class="rv-btn">Selge, alustan</button>`;
    d.querySelector("button").addEventListener("click", () => { ls("fr_juhend", "1"); d.remove(); });
    document.body.append(d);
  }

  // ---------- käivitus ----------
  uuendaLoendureid();
  lae().then(() => {
    uuendaLoendureid();
    if (qs.get("kommentaarid") !== null) ava("koik");
  });
  juhend();
})();
