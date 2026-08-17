/* Viljandimaa MV — kava, tulemused ja tabel.
 *
 * Andmed tulevad data/mv.json-ist, mille scripts/mv_fetch.py tõmbab
 * tournated.com-ist iga 30 min. Püramiidi kuuluvuse jaoks laetakse ka
 * data/puramiid.json — nii saab mängu juures näidata, kas see liigutab
 * püramiidi kohti.
 */

(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const state = { data: null, pyramid: null, laetud: false, vaade: "kava" };

  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const normNimi = (s) => String(s || "").split(/\s+/).filter(Boolean).join(" ").toLowerCase();

  const PAEVAD = ["pühapäev", "esmaspäev", "teisipäev", "kolmapäev",
                  "neljapäev", "reede", "laupäev"];

  function fmtPaev(iso) {
    if (!iso) return "Aeg lahtine";
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d)) return iso;
    const p = String(d.getDate()).padStart(2, "0");
    const k = String(d.getMonth() + 1).padStart(2, "0");
    return `${p}.${k} · ${PAEVAD[d.getDay()]}`;
  }

  // Püramiidi nimi (õiges kirjapildis) või null, kui mängijat seal pole.
  function pyrNimi(nimi) {
    if (!state.pyramid) return null;
    const p = state.pyramid.players.find((x) => normNimi(x.name) === normNimi(nimi));
    return p ? p.name : null;
  }

  function pyrKoht(nimi) {
    if (!state.pyramid) return null;
    const p = state.pyramid.players.find((x) => normNimi(x.name) === normNimi(nimi));
    return p ? p.pos : null;
  }

  // Kuvanimi: kui mängija on püramiidis, kasuta sealset kirjapilti
  // (tournatedis on nimed käsitsi sisestatud — "kert perkmann" jne).
  const kuvaNimi = (n) => (n ? pyrNimi(n) || n : null);

  const moldabPyramiidi = (m) =>
    !!(m.winner && m.loser && pyrNimi(m.winner) && pyrNimi(m.loser));

  // ---------- ühe mängu kaart ----------

  function mangKaart(m, { naitaRingi = true } = {}) {
    const el = document.createElement("div");
    el.className = "mv-match";
    if (m.in_progress) el.classList.add("is-live");
    if (m.winner) el.classList.add("is-done");

    const pool = (nimi, onVoitja) => {
      if (!nimi) return `<span class="mv-tbd">selgumisel</span>`;
      const koht = pyrKoht(nimi);
      const marge = koht ? `<span class="mv-pyr" title="Püramiidis ${koht}. kohal">${koht}.</span>` : "";
      return `<span class="mv-player${onVoitja ? " is-winner" : ""}">${marge}${esc(kuvaNimi(nimi))}</span>`;
    };

    const aeg = [m.time, m.court].filter(Boolean).join(" · ");
    const ring = naitaRingi ? `<span class="mv-round">${esc(m.round_title || "")}</span>` : "";
    const staatus = m.in_progress
      ? `<span class="mv-live">käib</span>`
      : m.score
        ? `<span class="mv-score">${esc(m.score)}</span>`
        : m.winner
          ? `<span class="mv-score">${m.walkover ? "loobumine" : "võit"}</span>`
          : "";

    el.innerHTML = `
      <div class="mv-match-top">${ring}<span class="mv-when">${esc(aeg)}</span></div>
      <div class="mv-pair">
        ${pool(m.p1, m.winner && normNimi(m.winner) === normNimi(m.p1))}
        <span class="mv-vs">–</span>
        ${pool(m.p2, m.winner && normNimi(m.winner) === normNimi(m.p2))}
      </div>
      <div class="mv-match-bot">${staatus}${
        moldabPyramiidi(m) ? `<span class="type-badge type-mv">püramiid</span>` : ""
      }</div>`;
    return el;
  }

  // ---------- vaated ----------

  function renderKava() {
    const box = $("#mv-view-kava");
    box.innerHTML = "";
    const tulevased = state.data.upcoming || [];
    if (!tulevased.length) {
      box.innerHTML = `<p class="footnote">Ees ootavaid mänge pole — kõik paarid on selgumisel või mängitud.</p>`;
      return;
    }
    const paevade = new Map();
    tulevased.forEach((m) => {
      const k = m.date || "";
      if (!paevade.has(k)) paevade.set(k, []);
      paevade.get(k).push(m);
    });
    paevade.forEach((mangud, paev) => {
      const h = document.createElement("h3");
      h.className = "mv-day";
      h.textContent = fmtPaev(paev);
      box.appendChild(h);
      const grid = document.createElement("div");
      grid.className = "mv-grid";
      mangud.forEach((m) => grid.appendChild(mangKaart(m)));
      box.appendChild(grid);
    });
  }

  function renderTulemused() {
    const box = $("#mv-view-tulemused");
    box.innerHTML = "";
    const tehtud = state.data.results || [];
    if (!tehtud.length) {
      box.innerHTML = `<p class="footnote">Ühtegi mängu pole veel lõppenud.</p>`;
      return;
    }
    const pyrArv = tehtud.filter(moldabPyramiidi).length;
    if (pyrArv) {
      const n = document.createElement("p");
      n.className = "br-legend";
      n.textContent = `Püramiidi kohti liigutab ${pyrArv} mäng${pyrArv === 1 ? "" : "u"} ` +
        `${tehtud.length}-st — need on püramiidi mängijate omavahelised.`;
      box.appendChild(n);
    }
    const grid = document.createElement("div");
    grid.className = "mv-grid";
    tehtud.forEach((m) => grid.appendChild(mangKaart(m)));
    box.appendChild(grid);
  }

  function renderTabel() {
    const box = $("#mv-view-tabel");
    box.innerHTML = "";
    (state.data.brackets || []).forEach((b) => {
      const h = document.createElement("h3");
      h.className = "mv-day";
      h.textContent = b.title;
      box.appendChild(h);
      b.rounds.forEach((r) => {
        const rh = document.createElement("h4");
        rh.className = "mv-round-head";
        rh.textContent = r.title;
        box.appendChild(rh);
        const grid = document.createElement("div");
        grid.className = "mv-grid";
        r.matches.forEach((m) => grid.appendChild(mangKaart(m, { naitaRingi: false })));
        box.appendChild(grid);
      });
    });
  }

  function setVaade(v) {
    state.vaade = v;
    $$("#mv-view-toggle .view-toggle-btn").forEach((b) => {
      const on = b.dataset.mvview === v;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    ["kava", "tulemused", "tabel"].forEach((x) => {
      const el = $(`#mv-view-${x}`);
      el.hidden = x !== v;
      el.classList.toggle("active", x === v);
    });
  }

  // ---------- laadimine ----------

  async function laadi() {
    if (state.laetud) return;
    state.laetud = true;
    try {
      const [mv, pyr] = await Promise.all([
        fetch("data/mv.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)),
        fetch("data/puramiid.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)),
      ]);
      if (!mv) throw new Error("mv.json puudub");
      state.data = mv;
      state.pyramid = pyr;

      $("#mv-title").textContent = mv.title;
      const c = mv.counts || {};
      const aeg = mv.fetched_at
        ? new Date(mv.fetched_at).toLocaleString("et-EE",
            { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
        : "";
      $("#mv-meta").textContent =
        `${c.players ?? 0} mängijat · ${c.played ?? 0} mängitud · ${c.upcoming ?? 0} ees` +
        (aeg ? ` · uuendatud ${aeg}` : "");
      const src = $("#mv-source");
      if (src && mv.source_url) src.href = mv.source_url;

      renderKava();
      renderTulemused();
      renderTabel();
      setVaade(state.vaade);
    } catch (e) {
      console.error("MV laadimine ebaõnnestus:", e);
      $("#mv-empty").hidden = false;
      state.laetud = false; // luba uus katse
    }
  }

  // Ava MV-vahekaart ise. app.js paneb oma tab-kuulajad paika alles pärast
  // andmete laadimist, nii et #mv-lingi puhul ei saa tema klikile loota.
  function avaVahekaart() {
    $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === "mv"));
    $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "tab-mv"));
  }

  function init() {
    const nupp = document.querySelector('.tab[data-tab="mv"]');
    if (!nupp) return;
    nupp.addEventListener("click", laadi);
    $$("#mv-view-toggle .view-toggle-btn").forEach((b) =>
      b.addEventListener("click", () => setVaade(b.dataset.mvview)));
    if (location.hash === "#mv") {
      avaVahekaart();
      laadi();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
