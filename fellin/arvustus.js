// Kliendi kommentaarid avalehe ettepanekule (AINULT prototüübi ajaks).
//
// Iga [data-osa] plokk saab kollase "Kommenteeri" nupu. Kommentaarid
// salvestuvad /api/fellin-kommentaar kaudu faili fellin/kommentaarid.json.
// Kommenteerimiseks on vaja lingis olevat võtit (?k=…), lugeda saab ilma.
//
// Kommentaaride paneel on modaalne dialoog (WAI-ARIA APG):
//   ligipääsetav nimi pealkirjast, algfookus pealkirjal, Tab/Shift+Tab jäävad
//   dialoogi, Escape ja "Sulge" sulgevad, fookus naaseb avanud nupule,
//   suletud paneel on `hidden` ja taust avatud ajal `inert`.
//
// Kohalik proov ilma serverita: http://localhost:8765/fellin/?mock=1
//
// AVALIK VERSIOON: kustuta see fail ning index.html-ist .proto riba ja
// <script src="arvustus.js"> rida (mõlemad märgitud ARVUSTUS). Siis ei jää
// lehele ühtegi prototüübi elementi.

(function () {
  "use strict";

  const API = "/api/fellin-kommentaar";
  const qs = new URLSearchParams(location.search);
  const MOCK = qs.has("mock") && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

  const ls = (k, v) => {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    } catch (e) { /* privaatrežiim — töötab ka ilma */ }
    return null;
  };
  if (qs.get("k")) ls("fr_k", qs.get("k"));
  const VOTI = qs.get("k") || ls("fr_k") || (MOCK ? "mock" : "");
  const saabKommenteerida = !!VOTI;

  const $ = (s, root = document) => root.querySelector(s);
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
  let idLoendur = 0;
  const uusId = (p) => `${p}-${++idLoendur}`;

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
  .rv-pin, .rv-fab, .rv-btn, .rv-link, .rv-toggle { font:600 14px/1.2 var(--font, system-ui); cursor:pointer; border:0; }
  .rv-pin { display:inline-flex; gap:7px; align-items:center; min-height:36px; padding:0 13px; border-radius:999px;
    background:#fff3b8; color:#5b4800; border:1.5px dashed #b88f00; }
  .rv-pin:hover { background:#ffe98a; }
  .rv-pin .n { background:#8a6a00; color:#fff; border-radius:999px; padding:1px 8px; font-size:12.5px; }
  footer .rv-pin { background:#3a3420; color:#ffe98a; border-color:#8a7414; }
  .rv-on { outline:3px solid #f2c500; outline-offset:-3px; }
  .rv-fab { position:fixed; right:calc(18px + env(safe-area-inset-right, 0px)); bottom:calc(18px + env(safe-area-inset-bottom, 0px));
    z-index:60; min-height:48px; padding:0 18px; border-radius:999px;
    background:#ffd83d; color:#2b2200; box-shadow:0 6px 22px rgba(0,0,0,.35); display:flex; gap:8px; align-items:center; }
  .rv-fab .n { background:#2b2200; color:#ffd83d; border-radius:999px; padding:1px 8px; font-size:12.5px; }
  .proto { position:relative; z-index:30; display:flex; flex-wrap:wrap; gap:6px 10px; justify-content:center; align-items:center; }
  .rv-link, .rv-toggle { min-height:32px; padding:0 12px; border-radius:999px; font-size:13px; }
  .rv-link { background:#ffd83d; color:#2b2200; }
  .rv-toggle { background:transparent; color:#f6f5ee; border:1px solid #5d6253; }
  .rv-hint { position:relative; z-index:29; background:#fff3b8; color:#2b2200; display:flex; gap:12px; align-items:center;
    justify-content:center; padding:10px 16px; font:400 15px/1.45 var(--font, system-ui); }
  .rv-hint p { margin:0; max-width:70ch; }
  .rv-hint-x { flex:none; width:36px; height:36px; border-radius:50%; border:1px solid #b88f00; background:transparent;
    color:#2b2200; font-size:20px; line-height:1; cursor:pointer; }
  .proto :focus-visible, .rv-hint :focus-visible, .rv-drawer :focus-visible { outline:3px solid #1c2510; outline-offset:2px; }
  .proto :focus-visible { outline-color:#ffd83d; }

  .rv-backdrop { position:fixed; inset:0; z-index:79; background:rgba(0,0,0,.55); }
  .rv-drawer { position:fixed; top:0; right:0; bottom:0; width:min(420px, 100%); z-index:80; background:#fffdf4;
    box-shadow:-10px 0 40px rgba(0,0,0,.3); display:flex; flex-direction:column;
    font:400 15px/1.5 var(--font, system-ui); color:#1d1d1b; }
  .rv-drawer[hidden], .rv-backdrop[hidden] { display:none !important; }
  @media (prefers-reduced-motion: no-preference) {
    .rv-drawer:not([hidden]) { animation:rv-sisse .2s ease-out; }
    @keyframes rv-sisse { from { transform:translateX(28px); opacity:0; } }
  }
  .rv-head { padding:16px 18px 12px; border-bottom:1px solid #eee3b8; display:flex; gap:10px; align-items:flex-start; }
  .rv-head h2 { font-size:18px; margin:0; letter-spacing:-.01em; line-height:1.25; flex:1; }
  .rv-head h2:focus { outline:none; }
  .rv-head .sub { display:block; margin-top:4px; font-size:13.5px; font-weight:600; color:#5b5444; }
  .rv-x { flex:none; min-width:44px; min-height:44px; border:1px solid #e2d7a8; border-radius:8px; background:#fff;
    font:600 14px var(--font, system-ui); cursor:pointer; color:#1d1d1b; padding:0 10px; }
  .rv-body { flex:1; overflow:auto; padding:14px 18px; }
  .rv-foot { border-top:1px solid #eee3b8; padding:12px 18px calc(16px + env(safe-area-inset-bottom, 0px)); background:#fff8dc; }
  .rv-back, .rv-show { background:none; border:0; color:#1f4f8f; font:600 14px var(--font, system-ui); cursor:pointer;
    padding:0; min-height:32px; text-decoration:underline; text-underline-offset:3px; }
  .rv-ver { background:#fff; border:1px solid #eee3b8; border-radius:12px; padding:11px 13px; margin-bottom:14px; font-size:14px; }
  .rv-ver ul { margin:6px 0 0; padding-left:18px; }
  .rv-group { margin-bottom:18px; }
  .rv-group h3 { font-size:15px; margin:0 0 8px; display:flex; justify-content:space-between; align-items:center; gap:8px; }
  .rv-c { background:#fff; border:1px solid #efe6c4; border-radius:12px; padding:10px 12px; margin-bottom:8px; }
  .rv-c .meta { font-size:13px; color:#5b5444; display:flex; gap:6px; align-items:center; flex-wrap:wrap; }
  .rv-c .meta b { color:#1d1d1b; font-size:14px; }
  .rv-c .txt { white-space:pre-wrap; margin-top:4px; overflow-wrap:anywhere; }
  .rv-c .rep { margin:8px 0 0 12px; padding-left:10px; border-left:3px solid #efe6c4; }
  .rv-c .rep .rv-c { border:0; padding:4px 0; margin:0 0 6px; background:none; }
  .rv-tag { font-size:12px; font-weight:700; padding:2px 8px; border-radius:999px; }
  .rv-tag.tehtud { background:#e3f1e6; color:#245332; }
  .rv-tag.jaab { background:#ececec; color:#444; }
  .rv-note { margin-top:6px; background:#eef6f0; border-radius:8px; padding:6px 9px; font-size:14px; color:#2b4a33; }
  .rv-ans { background:none; border:0; color:#1f4f8f; font:600 14px var(--font, system-ui); cursor:pointer;
    padding:0; margin-top:6px; min-height:32px; }
  .rv-empty { color:#5b5444; font-size:14.5px; padding:6px 0 14px; margin:0; }
  .rv-form label { display:block; font-size:14px; font-weight:600; color:#3d3726; margin:8px 0 4px; }
  .rv-form label:first-of-type { margin-top:0; }
  .rv-form input, .rv-form textarea { width:100%; box-sizing:border-box; font:400 16px/1.45 var(--font, system-ui);
    border:1.5px solid #c9bb85; border-radius:10px; padding:9px 11px; background:#fff; color:#1d1d1b; }
  .rv-form textarea { min-height:86px; resize:vertical; }
  .rv-form [aria-invalid="true"] { border-color:#9a3b3b; }
  .rv-row { display:flex; gap:10px; align-items:center; }
  .rv-row input { flex:1; min-width:0; }
  .rv-btn { background:#2b2200; color:#ffd83d; min-height:44px; padding:0 18px; border-radius:999px; }
  .rv-btn:disabled { opacity:.6; cursor:default; }
  .rv-msg { font-size:14px; margin:6px 0 0; min-height:1em; }
  .rv-msg.err { color:#8a2f2f; } .rv-msg.ok { color:#245332; }
  .rv-hp { position:absolute; left:-9999px; }
  @media (max-width: 640px) {
    .rv-drawer { top:auto; left:0; right:0; width:auto; height:min(86dvh, 86vh); border-radius:18px 18px 0 0; }
    @media (prefers-reduced-motion: no-preference) {
      .rv-drawer:not([hidden]) { animation:rv-ules .22s ease-out; }
      @keyframes rv-ules { from { transform:translateY(40px); opacity:0; } }
    }
    .rv-fab { padding:0 15px; }
  }
  @media print { .rv-bar, .rv-fab, .rv-drawer, .rv-backdrop, .rv-hint { display:none !important; } }
  `;
  document.head.insertAdjacentHTML("beforeend", `<style>${css}</style>`);

  // ---------- prototüübi riba (ainult ettepaneku ajal) ----------
  const proto = document.getElementById("proto");
  if (proto) {
    proto.innerHTML =
      `<span><b>Ettepanek<span id="rv-ver"></span></b> · uue fellinrackets.ee avalehe prototüüp — ei ole ametlik leht.</span>` +
      `<button type="button" class="rv-link" id="rv-open-all">Kommentaarid<span id="rv-count"></span></button>` +
      `<button type="button" class="rv-toggle" id="rv-toggle"></button>`;
  }

  // Esimese külastuse juhis: suletav riba, mitte modaalaken.
  if (saabKommenteerida && !ls("fr_juhend") && proto) {
    const hint = document.createElement("div");
    hint.className = "rv-hint";
    hint.setAttribute("role", "note");
    hint.innerHTML = `<p><b>Tere! See on uue kodulehe ettepanek.</b> Vaata leht läbi ja vajuta kollasele
      „Kommenteeri“ nupule selle osa juures, mida tahad muuta. Kõik kommentaarid näed ülal nupust „Kommentaarid“.</p>
      <button type="button" class="rv-hint-x" aria-label="Sulge juhis">×</button>`;
    proto.after(hint);
    hint.querySelector("button").addEventListener("click", () => {
      ls("fr_juhend", "1");
      const next = $("#rv-open-all");
      hint.remove();
      if (next) next.focus();
    });
  }

  // ---------- kommenteerimisnupud lehel ----------
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

  // Kommenteerimisnuppe saab peita (tagasisiderežiim on eraldi lülitatav).
  let nupudNahtaval = ls("fr_rv_peida") !== "1";
  function rakendaNahtavus() {
    document.querySelectorAll(".rv-bar").forEach((b) => { b.hidden = !nupudNahtaval; });
    fab.hidden = !nupudNahtaval;
    const t = $("#rv-toggle");
    if (t) t.textContent = nupudNahtaval ? "Peida kommenteerimisnupud" : "Näita kommenteerimisnupud";
  }
  rakendaNahtavus();

  // ---------- modaalne dialoog ----------
  const backdrop = document.createElement("div");
  backdrop.className = "rv-backdrop";
  backdrop.hidden = true;
  const drawer = document.createElement("div");
  drawer.className = "rv-drawer";
  drawer.hidden = true;
  drawer.setAttribute("role", "dialog");
  drawer.setAttribute("aria-modal", "true");
  drawer.setAttribute("aria-labelledby", "rv-title");
  drawer.innerHTML = `<div class="rv-head"></div><div class="rv-body"></div><div class="rv-foot"></div>
    <div class="vh" aria-live="polite" id="rv-live"></div>`;
  document.body.append(backdrop, drawer);
  const [elHead, elBody, elFoot] = drawer.children;
  const teata = (tekst) => { const l = $("#rv-live"); l.textContent = ""; setTimeout(() => { l.textContent = tekst; }, 30); };

  let vaade = null;   // null = suletud, "koik" või osa id
  let tagasi = null;  // element, millele fookus sulgemisel naaseb

  function inertTaust(on) {
    [...document.body.children].forEach((el) => {
      if (el === drawer || el === backdrop || el.tagName === "SCRIPT" || el.tagName === "STYLE") return;
      if (on) {
        if (!el.inert) { el.inert = true; el.dataset.rvInert = "1"; }
      } else if (el.dataset.rvInert) {
        el.inert = false;
        delete el.dataset.rvInert;
      }
    });
  }

  function uuendaLoendureid() {
    document.querySelectorAll("[data-osa-pin]").forEach((b) => {
      const n = osaJuured(b.dataset.osaPin).length;
      b.innerHTML = `💬 Kommenteeri${n ? ` <span class="n">${n}</span>` : ""}`;
    });
    const n = juured().length;
    fab.innerHTML = `💬 Kommentaarid${n ? ` <span class="n">${n}</span>` : ""}`;
    const v = andmed.versioonid[andmed.versioonid.length - 1];
    const ver = $("#rv-ver"), cnt = $("#rv-count");
    if (ver) ver.textContent = v ? ` · versioon ${v.nr}` : "";
    if (cnt) cnt.textContent = n ? ` (${n})` : "";
  }

  // ---------- kommentaari kaart ja vorm ----------
  function kaart(c, sygav) {
    const tag = c.staatus === "tehtud" ? `<span class="rv-tag tehtud">✓ Tehtud</span>`
      : c.staatus === "jaab" ? `<span class="rv-tag jaab">Jääb nii</span>` : "";
    const reps = sygav ? "" : vastused(c.id).map((r) => kaart(r, true)).join("");
    return `<div class="rv-c" data-id="${esc(c.id)}">
      <div class="meta"><b>${esc(c.nimi)}</b><span>${esc(aeg(c.aeg))}</span>${tag}</div>
      <div class="txt">${esc(c.tekst)}</div>
      ${c.markus ? `<div class="rv-note">↳ ${esc(c.markus)}</div>` : ""}
      ${reps ? `<div class="rep">${reps}</div>` : ""}
      ${!sygav && saabKommenteerida ? `<button type="button" class="rv-ans" data-vasta="${esc(c.id)}" aria-expanded="false">Vasta</button><div class="rv-ansbox"></div>` : ""}
    </div>`;
  }

  function vorm(osa, vastus_id) {
    if (!saabKommenteerida) {
      return `<p class="rv-empty">Kommenteerimiseks ava link, mille said Priidult.</p>`;
    }
    const tId = uusId("rv-t"), nId = uusId("rv-n"), mId = uusId("rv-m");
    const silt = vastus_id ? "Sinu vastus"
      : osa === "uldine" ? "Üldine kommentaar kogu lehe kohta" : "Mida siin muuta, lisada või ära jätta?";
    return `<form class="rv-form" data-osa="${esc(osa)}" ${vastus_id ? `data-vastus="${esc(vastus_id)}"` : ""} novalidate>
      <input class="rv-hp" name="veeb" tabindex="-1" autocomplete="off" aria-hidden="true" />
      <label for="${tId}">${silt}</label>
      <textarea id="${tId}" name="tekst" maxlength="3000" aria-describedby="${mId}"></textarea>
      <label for="${nId}">Sinu nimi</label>
      <div class="rv-row">
        <input id="${nId}" name="nimi" maxlength="60" autocomplete="name" value="${esc(ls("fr_nimi") || "")}" aria-describedby="${mId}" />
        <button class="rv-btn" type="submit">Saada</button>
      </div>
      <p class="rv-msg" id="${mId}"></p>
    </form>`;
  }

  function joonistaPea() {
    const n = juured().length, av = avatuid();
    if (vaade === "koik") {
      elHead.innerHTML = `<h2 id="rv-title" tabindex="-1">Kõik kommentaarid
          <span class="sub">${n ? `${kommentaari(n)} · ${av} ootel` : "Kommentaare veel pole"}</span></h2>
        <button type="button" class="rv-x" data-rv-sulge>Sulge</button>`;
    } else {
      elHead.innerHTML = `<h2 id="rv-title" tabindex="-1">Kommentaarid: ${esc(osaNimi(vaade))}
          <span class="sub"><button type="button" class="rv-back" data-rv-koik>← Kõik kommentaarid (${n})</button></span></h2>
        <button type="button" class="rv-x" data-rv-sulge>Sulge</button>`;
    }
  }

  function joonistaKeha() {
    const viga = laadimisViga ? `<p class="rv-msg err">${esc(laadimisViga)}</p>` : "";
    if (vaade === "koik") {
      const v = andmed.versioonid[andmed.versioonid.length - 1];
      const ver = v ? `<div class="rv-ver"><b>Versioon ${v.nr}</b> · ${esc(kuupaev(v.kuupaev))}
        ${v.muudatused && v.muudatused.length ? `<ul>${v.muudatused.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}</div>` : "";
      const grupid = OSAD.map((o) => {
        const cs = osaJuured(o.id);
        if (!cs.length) return "";
        return `<section class="rv-group"><h3><span>${esc(o.nimi)}</span>
          ${o.el ? `<button type="button" class="rv-show" data-rv-osa="${esc(o.id)}">Näita lehel</button>` : ""}</h3>
          ${cs.map((c) => kaart(c)).join("")}</section>`;
      }).join("");
      elBody.innerHTML = viga + ver + (grupid || `<p class="rv-empty">Vajuta kollasele „Kommenteeri“ nupule selle osa juures, mida tahad kommenteerida — või kirjuta allpool üldine kommentaar.</p>`);
    } else {
      const cs = osaJuured(vaade);
      elBody.innerHTML = viga + (cs.length ? cs.map((c) => kaart(c)).join("")
        : `<p class="rv-empty">Selle osa kohta kommentaare veel pole.</p>`);
    }
  }

  function joonista() {
    joonistaPea();
    joonistaKeha();
    elFoot.innerHTML = vorm(vaade === "koik" ? "uldine" : vaade);
  }

  function ava(v, avaja) {
    const oliKinni = drawer.hidden;
    vaade = v;
    if (oliKinni) {
      tagasi = avaja || document.activeElement;
      inertTaust(true);
      backdrop.hidden = false;
      drawer.hidden = false;
    }
    OSAD.forEach((o) => o.el && o.el.classList.toggle("rv-on", o.id === v));
    joonista();
    $("#rv-title").focus();
    // Värske seis serverist (teised võisid vahepeal kommenteerida).
    lae().then(() => {
      uuendaLoendureid();
      if (vaade === v && !drawer.hidden && !elBody.contains(document.activeElement)) {
        joonistaKeha();
        const sub = $(".rv-head .sub");
        if (sub && vaade === "koik") {
          sub.textContent = juured().length ? `${kommentaari(juured().length)} · ${avatuid()} ootel` : "Kommentaare veel pole";
        }
      }
    });
  }

  function sulge(taasta = true) {
    if (drawer.hidden) return;
    vaade = null;
    drawer.hidden = true;
    backdrop.hidden = true;
    inertTaust(false);
    OSAD.forEach((o) => o.el && o.el.classList.remove("rv-on"));
    const t = tagasi;
    tagasi = null;
    if (taasta && t && document.contains(t) && !t.closest("[hidden]")) t.focus();
  }

  // ---------- sündmused ----------
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.id === "rv-toggle") {
      nupudNahtaval = !nupudNahtaval;
      ls("fr_rv_peida", nupudNahtaval ? null : "1");
      rakendaNahtavus();
      return;
    }
    if (t.dataset.osaPin) { ava(t.dataset.osaPin, t); return; }
    if (t === fab || t.id === "rv-open-all") { ava("koik", t); return; }
    if (t.hasAttribute("data-rv-koik")) { ava("koik"); return; }
    if (t.hasAttribute("data-rv-sulge")) { sulge(); return; }
    if (t.dataset.rvOsa) {
      // Näita osa lehel: sulge dialoog, keri osa juurde, fookus selle nupule.
      const o = OSAD.find((x) => x.id === t.dataset.rvOsa);
      sulge(false);
      if (o && o.el) {
        o.el.scrollIntoView({ block: "start" });
        const pin = o.el.querySelector(`[data-osa-pin="${o.id}"]`);
        if (pin && !pin.closest("[hidden]")) pin.focus({ preventScroll: true });
      }
      return;
    }
    if (t.dataset.vasta) {
      const box = t.nextElementSibling;
      const lahti = !!box.innerHTML;
      const osa = (andmed.kommentaarid.find((c) => c.id === t.dataset.vasta) || {}).osa || "uldine";
      box.innerHTML = lahti ? "" : vorm(osa, t.dataset.vasta);
      t.setAttribute("aria-expanded", String(!lahti));
      const ta = box.querySelector("textarea");
      if (ta) ta.focus();
    }
  });
  backdrop.addEventListener("click", () => sulge());

  drawer.addEventListener("submit", async (e) => {
    const f = e.target.closest("form.rv-form");
    if (!f) return;
    e.preventDefault();
    const msg = f.querySelector(".rv-msg");
    const btn = f.querySelector("button[type=submit]");
    const tekst = f.tekst.value.trim();
    const nimi = f.nimi.value.trim();
    f.tekst.removeAttribute("aria-invalid");
    f.nimi.removeAttribute("aria-invalid");
    const viga = (vali, tekstVea) => {
      msg.className = "rv-msg err";
      msg.textContent = tekstVea;
      vali.setAttribute("aria-invalid", "true");
      vali.focus();
    };
    if (!tekst) return viga(f.tekst, "Kirjuta kommentaar.");
    if (!nimi) return viga(f.nimi, "Lisa oma nimi.");
    ls("fr_nimi", nimi);
    btn.disabled = true;
    msg.className = "rv-msg";
    msg.textContent = "Salvestan…";
    try {
      const osa = f.dataset.osa;
      const vastus = f.dataset.vastus || null;
      await saada({ osa, osa_nimi: osaNimi(osa), nimi, tekst, vastus_id: vastus, veeb: f.veeb.value });
      uuendaLoendureid();
      joonistaPea();
      joonistaKeha();
      elFoot.innerHTML = vorm(vaade === "koik" ? "uldine" : vaade);
      const m = elFoot.querySelector(".rv-msg");
      if (m) { m.className = "rv-msg ok"; m.textContent = "Aitäh! Kommentaar on salvestatud."; }
      teata("Aitäh! Kommentaar on salvestatud.");
      const ta = elFoot.querySelector("textarea");
      if (ta) ta.focus();
    } catch (err) {
      btn.disabled = false;
      msg.className = "rv-msg err";
      msg.textContent = err.message;
      teata(err.message);
    }
  });

  // Fookus jääb dialoogi; Escape sulgeb; Ctrl+Enter saadab.
  drawer.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); sulge(); return; }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && e.target.tagName === "TEXTAREA") {
      e.target.form.requestSubmit();
      return;
    }
    if (e.key !== "Tab") return;
    const f = [...drawer.querySelectorAll(
      'a[href], button:not([disabled]), textarea, input:not([type="hidden"]):not(.rv-hp), select, [tabindex]:not([tabindex="-1"])')]
      .filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    const a = document.activeElement;
    if (e.shiftKey && (a === first || a === $("#rv-title"))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !drawer.hidden) sulge();
  });

  // ---------- käivitus ----------
  uuendaLoendureid();
  lae().then(() => {
    uuendaLoendureid();
    if (qs.get("kommentaarid") !== null) ava("koik", $("#rv-open-all"));
  });
})();
