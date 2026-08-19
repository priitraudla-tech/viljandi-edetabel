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

  // Lühinimed kaardile. Ilma nendeta on "1. ring" mitmemõtteline — igal
  // tabelil (põhitabel, 5.-8., 9.-16., 17.-32.) on oma esimene ring.
  const TABELI_LYHINIMED = {
    main: "Põhitabel",
    "5-8": "5.–8. koht",
    "9-16": "9.–16. koht",
    "17-32": "17.–32. koht",
    consolation: "Lohutus",
  };

  function tabeliNimi(tyyp) {
    if (TABELI_LYHINIMED[tyyp]) return TABELI_LYHINIMED[tyyp];
    // Lisaloosid ("13-16", "7-8") — kuvanimi tuleb mv.json-ist; kaardile
    // lühike kuju "13.–16. koht", nagu teistel.
    const b = (state.data.brackets || []).find((x) => x.type === tyyp);
    const m = /^(\d+)-(\d+)$/.exec(tyyp || "");
    if (m) return `${m[1]}.–${m[2]}. koht`;
    return b ? b.title : tyyp || "";
  }

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
    const ring = naitaRingi
      ? `<span class="mv-round"><span class="mv-bracket">${esc(tabeliNimi(m.bracket))}</span>`
        + `${esc(m.round_title || "")}</span>`
      : "";
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

  // ---------- kahvel ----------
  //
  // Mängud paigutatakse absoluutselt, arvutatud koordinaatidele. Nii tuleb
  // kahvli kuju täpselt välja ka siis, kui osa kohti on veel täitmata.
  //
  // Ringis r (0-põhine) on mängul k (1-põhine) keskpunkt
  //     y = SLOT * 2^r * (k - 0.5)
  // Sellest järeldub, et mängu k ja k+1 keskpunktide keskkoht langeb TÄPSELT
  // kokku järgmise ringi mängu (k+1)/2 keskpunktiga — seega ühendusjooned
  // klapivad ilma järelkohendamiseta.

  function moodud() {
    const kitsas = window.innerWidth < 700;
    return {
      MATCH_H: kitsas ? 46 : 52,
      SLOT: kitsas ? 56 : 62,
      COL_W: kitsas ? 150 : 178,
      GAP: kitsas ? 22 : 30,
      HEAD_H: 26,
    };
  }

  function kahvliMang(m, mo) {
    const el = document.createElement("div");
    el.className = "brk-match";
    if (!m || (!m.p1 && !m.p2)) el.classList.add("is-empty");
    if (m && m.in_progress) el.classList.add("is-live");

    const rida = (nimi, onVoitja, skoor) => {
      const r = document.createElement("div");
      r.className = "brk-row";
      if (onVoitja) r.classList.add("is-winner");
      if (!nimi) r.classList.add("is-tbd");
      const koht = nimi ? pyrKoht(nimi) : null;
      r.innerHTML =
        `<span class="brk-name">${koht ? `<span class="mv-pyr">${koht}.</span>` : ""}` +
        `${nimi ? esc(kuvaNimi(nimi)) : "—"}</span>` +
        `<span class="brk-score">${esc(skoor || "")}</span>`;
      return r;
    };

    const v = m && m.winner;
    const p1Voitis = !!(v && normNimi(v) === normNimi(m.p1));
    const p2Voitis = !!(v && normNimi(v) === normNimi(m.p2));
    // Skoor käib võitja reale; kui võitjat pole, näita kellaaega.
    const skoor = m && (m.score || (m.walkover ? "loob." : ""));
    const ootel = m && !v && m.p1 && m.p2 ? (m.time || "") : "";

    el.appendChild(rida(m && m.p1, p1Voitis, p1Voitis ? skoor : (p2Voitis ? "" : ootel)));
    el.appendChild(rida(m && m.p2, p2Voitis, p2Voitis ? skoor : ""));
    if (m && m.p1 && m.p2 && moldabPyramiidi(m)) el.classList.add("is-pyr");
    return el;
  }

  function buildKahvel(bracket) {
    const mo = moodud();
    const rounds = bracket.rounds || [];
    const n0 = rounds.length ? rounds[0].matches.length : 0;
    if (!n0) return null;

    const laius = rounds.length * mo.COL_W + (rounds.length - 1) * mo.GAP;
    const korgus = mo.SLOT * n0;

    const scroll = document.createElement("div");
    scroll.className = "brk-scroll";
    const canvas = document.createElement("div");
    canvas.className = "brk-canvas";
    canvas.style.width = `${laius}px`;
    canvas.style.height = `${korgus + mo.HEAD_H}px`;

    const colX = (r) => r * (mo.COL_W + mo.GAP);
    const keskY = (r, k) => mo.HEAD_H + mo.SLOT * Math.pow(2, r) * (k - 0.5);

    const joon = (kl, css) => {
      const d = document.createElement("div");
      d.className = `brk-line ${kl}`;
      Object.assign(d.style, css);
      canvas.appendChild(d);
    };

    rounds.forEach((r, ri) => {
      const h = document.createElement("div");
      h.className = "brk-head";
      h.style.left = `${colX(ri)}px`;
      h.style.width = `${mo.COL_W}px`;
      h.textContent = r.title;
      canvas.appendChild(h);

      // Ühendusjooned järgmisesse ringi
      const jargmine = rounds[ri + 1];
      if (jargmine) {
        for (let k = 1; k + 1 <= r.matches.length; k += 2) {
          const j = (k + 1) / 2;
          if (j > jargmine.matches.length) break;
          const y1 = keskY(ri, k);
          const y2 = keskY(ri, k + 1);
          const xOut = colX(ri) + mo.COL_W;
          const xMid = xOut + mo.GAP / 2;
          joon("brk-line--h", { left: `${xOut}px`, top: `${y1}px`, width: `${mo.GAP / 2}px` });
          joon("brk-line--h", { left: `${xOut}px`, top: `${y2}px`, width: `${mo.GAP / 2}px` });
          joon("brk-line--v", { left: `${xMid}px`, top: `${y1}px`, height: `${y2 - y1}px` });
          joon("brk-line--h", {
            left: `${xMid}px`, top: `${keskY(ri + 1, j)}px`, width: `${mo.GAP / 2}px`,
          });
        }
      }

      r.matches.forEach((m, mi) => {
        const el = kahvliMang(m, mo);
        el.style.left = `${colX(ri)}px`;
        el.style.top = `${keskY(ri, mi + 1) - mo.MATCH_H / 2}px`;
        el.style.width = `${mo.COL_W}px`;
        el.style.height = `${mo.MATCH_H}px`;
        canvas.appendChild(el);
      });
    });

    scroll.appendChild(canvas);
    return scroll;
  }

  function renderTabel() {
    const box = $("#mv-view-tabel");
    box.innerHTML = "";
    const legend = document.createElement("p");
    legend.className = "br-legend";
    legend.textContent = "Number nime ees on mängija koht püramiidis. " +
      "Kollasel taustal mängud liigutavad püramiidi kohti. Tabel on külgsuunas keritav.";
    box.appendChild(legend);

    (state.data.brackets || []).forEach((b) => {
      const kahvel = buildKahvel(b);
      if (!kahvel) return;
      const h = document.createElement("h3");
      h.className = "mv-day";
      h.textContent = b.title;
      box.appendChild(h);
      box.appendChild(kahvel);
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

    // Kahvli koordinaadid on pikslites — laiuse murdepunkti ületamisel
    // tuleb see uuesti joonistada.
    let kitsasEnne = window.innerWidth < 700;
    let ootel;
    window.addEventListener("resize", () => {
      clearTimeout(ootel);
      ootel = setTimeout(() => {
        const kitsasNyyd = window.innerWidth < 700;
        if (kitsasNyyd !== kitsasEnne && state.data) {
          kitsasEnne = kitsasNyyd;
          renderTabel();
        }
      }, 200);
    });
    // Turniiri ajal on MV avaekraan. Pärast MV_AVAEKRAAN_KUNI keskööd
    // (Eesti aja järgi) läheb leht ise tagasi Edetabelile — midagi ei pea
    // käsitsi ümber lülitama. #mv link ja otsene vahekaardi klikk töötavad
    // igal ajal edasi.
    const MV_AVAEKRAAN_KUNI = "2026-08-23";
    const nyyd = new Date();
    const taana = `${nyyd.getFullYear()}-${String(nyyd.getMonth() + 1).padStart(2, "0")}-` +
      `${String(nyyd.getDate()).padStart(2, "0")}`;
    const mvOnAvaekraan = taana <= MV_AVAEKRAAN_KUNI;
    const kasutajaValisMuu = /^#(standings|tournament|trend|history)$/.test(location.hash);

    if (location.hash === "#mv" || (mvOnAvaekraan && !kasutajaValisMuu)) {
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
