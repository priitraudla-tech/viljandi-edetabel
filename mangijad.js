// Mängijad — ATP-stiilis profiilid ja omavaheliste mängude (H2H) statistika.
// Agregeerib: data/puramiid.json + data/turniirid/*.json + data/current.json.

// Nimede ühtlustamine: turniiripaberitel esinevad variandid.
const NAME_ALIASES = {
  "Helmar Mirka": "Heimar Mirka",
  "Gen Lepp": "Gennadi Lepp",   // Sheetsis lühinimi, püramiidis ja MV-l täisnimi
};

// Kanooniline kirjapilt: võti = väiketähed + ühekordsed tühikud.
// tournatedis on nimed käsitsi sisestatud ("kert perkmann"), püramiidis ja
// Sheetsis korrektselt — ilma selleta tekiks samast inimesest kaks mängijat.
const CANON = new Map();
function registerCanon(name) {
  if (!name) return;
  const n = String(name).trim().split(/\s+/).join(" ");
  const a = NAME_ALIASES[n] || n;
  if (!CANON.has(a.toLowerCase())) CANON.set(a.toLowerCase(), a);
}

const state = {
  vus: null,          // current.json
  puramiid: null,     // puramiid.json
  tournaments: [],    // laaditud turniiri-JSON-id
  history: [],        // [{date, players:[{name, rank}]}] — edetabeli snapshotid
  matches: [],        // ühtlustatud mängude list
  players: new Map(), // name -> {name, vusRank, vusPoints, pyrPos, stats...}
  sort: "vus",
  search: "",
  profileName: null,
  profileFormat: "",
  rankChart: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function norm(name) {
  if (!name) return null;
  const n = String(name).trim().split(/\s+/).join(" ");
  const a = NAME_ALIASES[n] || n;
  return CANON.get(a.toLowerCase()) || a;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDateISO(iso) {
  if (!iso) return "—";
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return iso;
}

// Seletustekstiga "skoor" (nt "Ei mängitud, kuna ...") -> kompaktne margis,
// taistekst title-vihjena. Paris skoorid jaavad puutumata.
function fmtScore(score) {
  const s = String(score || "").trim();
  if (!s) return "—";
  if (s.length <= 12 || /\d\s*[\/:]\s*\d/.test(s)) return escapeHtml(s);
  const label = /^ei mängitud/i.test(s) ? "Ei mängitud" : "Märkus";
  return `<span class="score-note" title="${escapeHtml(s)}">${label} ⓘ</span>`;
}

async function fetchJSON(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

// ---------- load ----------

async function init() {
  try {
    [state.vus, state.puramiid, state.mv] = await Promise.all([
      fetchJSON("data/current.json"),
      fetchJSON("data/puramiid.json"),
      fetchJSON("data/mv.json").catch(() => null),
    ]);
    (state.puramiid.players || []).forEach((p) => registerCanon(p.name));
    (state.vus.players || []).forEach((p) => registerCanon(p.name));
  } catch (e) {
    document.body.innerHTML = `<div style="padding:32px;font-family:sans-serif">
      <h2>Viga andmete laadimisel</h2><pre>${escapeHtml(e.message)}</pre></div>`;
    return;
  }

  // Turniirifailid: Sheetsi etappide kuupäevad + data/turniirid/index.json
  // (etapid, mida Sheetsis veel pole — nende mängud jõuavad H2H-sse ja Elo
  // arvutusse kohe, mitte alles Sheetsi uuendusega). 404 = pole bracketit.
  const indeks = await fetchJSON("data/turniirid/index.json").catch(() => []);
  const dates = [...new Set([
    ...(state.vus.stages || []).map((s) => s.date),
    ...(Array.isArray(indeks) ? indeks : []).map((t) => t.date),
  ].filter(Boolean))];
  const loaded = await Promise.all(dates.map((d) =>
    fetchJSON(`data/turniirid/${d}.json`)
      .then((j) => ({ date: d, json: j }))
      .catch(() => null)));
  state.tournaments = loaded.filter(Boolean);

  // Edetabeli ajaloo snapshotid (koha graafiku jaoks).
  try {
    const histDates = await fetchJSON("data/history.json");
    const snaps = await Promise.all(histDates.map((d) =>
      fetchJSON(`data/history/${d}.json`)
        .then((j) => ({
          date: d,
          players: (j.players || []).map((p) => ({ name: norm(p.name), rank: p.rank })),
        }))
        .catch(() => null)));
    state.history = snaps.filter(Boolean);
  } catch { state.history = []; }

  buildMatches();
  buildPlayers();

  $("#meta-counts").textContent =
    `${state.players.size} mängijat · ${state.matches.length} mängu ` +
    `(${state.matches.filter((m) => m.format === "vus").length} turniiridel, ` +
    `${state.matches.filter((m) => m.format === "puramiid").length} püramiidis, ` +
    `${state.matches.filter((m) => m.format === "mv").length} maakonna MV-l)`;

  setupTabs();
  setupRegister();
  setupH2H();
  renderRecords();
  renderRegister();

  // Hash-route: #p=Nimi avab profiili
  const hash = decodeURIComponent(location.hash || "");
  const pm = hash.match(/^#p=(.+)$/);
  if (pm && state.players.has(pm[1])) openProfile(pm[1]);
}

// ---------- matches ----------

function pushMatch(m) {
  if (!m.a || !m.b || m.a === "Bye" || m.b === "Bye") return;
  state.matches.push(m);
}

function buildMatches() {
  state.matches = [];

  // --- Püramiid: aasta tuletamine "dd.mm" kuupäevadele ---
  const games = (state.puramiid.games || []).slice().sort((a, b) => a.nr - b.nr);
  let year = 2025; // hooaeg algas juunis 2025
  let prevMonth = null;
  games.forEach((g) => {
    const raw = g.play_date || g.challenge_date || "";
    let iso = null;
    let display = raw || "—";
    const isoM = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
    const dmM = String(raw).match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?$/);
    if (isoM) {
      iso = isoM[0];
      year = Number(isoM[1]);
      prevMonth = Number(isoM[2]);
      display = fmtDateISO(iso);
    } else if (dmM) {
      const day = Number(dmM[1]);
      const mon = Number(dmM[2]);
      if (dmM[3]) {
        year = Number(dmM[3]);
      } else if (prevMonth !== null && prevMonth - mon >= 2) {
        year += 1; // kuu hüppas tagasi -> uus aasta
      }
      prevMonth = mon;
      iso = `${year}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      display = `${String(day).padStart(2, "0")}.${String(mon).padStart(2, "0")}.${year}`;
    }

    const bits = ["väljakutse"];
    if (g.type === "mv") bits.push("maakonna MV");
    if (g.erand) bits.push("erand");
    pushMatch({
      date: iso,
      display,
      event: `Püramiid · ${bits.join(" · ")}`,
      format: "puramiid",
      a: norm(g.challenger),
      b: norm(g.challenged),
      winner: norm(g.winner),
      score: g.score || "—",
      off: g.type === "arvestusevaline",
    });
  });

  // --- Viljandimaa MV (data/mv.json) ---
  // Püramiidi mängijate omavahelised MV mängud on juba püramiidis
  // (mv_match_id) — need jäetakse vahele, et Elo neid topelt ei loeks.
  if (state.mv && Array.isArray(state.mv.results)) {
    const pyrIds = new Set((state.puramiid.games || []).map((g) => g.mv_match_id).filter(Boolean));
    const aasta = (state.mv.title || "").match(/\d{4}/)?.[0] || "";
    state.mv.results.forEach((m) => {
      if (!m.winner || !m.loser || pyrIds.has(m.id)) return;
      const tabel = m.bracket === "main" ? "põhitabel"
        : `${String(m.bracket || "").split("/")[0].replace("-", ".–")}. koht`;
      pushMatch({
        date: m.date || null,
        display: m.date ? fmtDateISO(m.date) : "—",
        event: `Maakonna MV ${aasta} · ${tabel} · ${m.round_title || "mäng"}`,
        format: "mv",
        a: norm(m.winner),
        b: norm(m.loser),
        winner: norm(m.winner),
        score: m.score || (m.walkover ? "w/o" : "—"),
        off: false,
      });
    });
  }

  // --- VÜS turniirid ---
  state.tournaments.forEach(({ date, json }) => {
    const tname = (json.turniir?.nimi || "VÜS turniir").replace(/^VÜS \d+ /, "VÜS ");
    const add = (match, label) => {
      if (!match || match.staatus === "ei mängitud" || !match.voitja) return;
      pushMatch({
        date,
        display: fmtDateISO(date),
        event: `${tname} · ${label}`,
        format: "vus",
        a: norm(match.voitja),
        b: norm(match.kaotaja),
        winner: norm(match.voitja),
        score: match.skoor || "—",
        off: false,
      });
    };

    const pt = json.pohitabel;
    if (pt) {
      (pt.round_1 || []).forEach((m) => add(m, "1. ring"));
      (pt.veerandfinaalid || []).forEach((m) => add(m, "veerandfinaal"));
      (pt.poolfinaalid || []).forEach((m) => add(m, "poolfinaal"));
      add(pt.finaal, "finaal");
      add(pt.koht_3_4, "3.–4. koht");
    }
    const k58 = json.kohamang_5_8;
    if (k58) {
      (k58.poolfinaalid || []).forEach((m) => add(m, "kohamäng 5.–8."));
      add(k58.koht_5_6, "5.–6. koht");
      add(k58.koht_7_8, "7.–8. koht");
    }
    const lA = json.lohutused_grupp_A;
    if (lA) (lA.mangud || []).forEach((m) => add(m, "lohutus A"));
    const lB = json.lohutused_grupp_B;
    if (lB) {
      (lB.poolfinaalid || []).forEach((m) => add(m, "lohutus B"));
      add(lB.finaal, "lohutus B · finaal");
      add(lB.koht_3_4, "lohutus B · 3.–4.");
    }
    (json.alagrupid || []).forEach((g) => {
      (g.mangud || []).forEach((m) => add(m, g.nimi || "alagrupp"));
    });
    (json.positsioonimangud || []).forEach((g) => {
      (g.mangud || []).forEach((m) => add(m, g.nimi || "kohamäng"));
    });
    const vm = json.valjamangud;
    if (vm) {
      (vm.poolfinaalid || []).forEach((m) => add(m, "poolfinaal"));
      add(vm.finaal, "finaal");
      add(vm.koht_3_4, "3.–4. koht");
      add(vm.koht_5_6, "5.–6. koht");
    }
  });

  // Uusim ees; kuupäevata lõppu.
  state.matches.sort((x, y) => {
    if (x.date && y.date) return y.date.localeCompare(x.date);
    if (x.date) return -1;
    if (y.date) return 1;
    return 0;
  });
}

// ---------- tugevus (geimipõhine) ----------
//
// Elo vaatab ainult võitu/kaotust. Tugevus kasutab iga geimi: 6:0 6:0 annab
// rohkem kui 7:6 7:6. Mudel: Bradley–Terry geimide peal, MAP-hinnang eeldusega,
// et igaüks on mänginud 12 geimi "keskmise" vastu 6:6 — see hoiab vähese
// mänguga mängijad tagasihoidlikuna. Järjekorrast sõltumatu.
// Skaala on Elo-laadne: 1500 = keskmine, +200 ≈ võidab keskmise vastu 76% geime.

const STR_PRIOR = 12;

// Skoor -> [võitja geimid, kaotaja geimid] või null (loobumine, skoor puudub).
// Setid orienteeritakse nii, et võitjal on rohkem võidetud sette — püramiidis
// on skoor väljakutsuja poolt, turniirides võitja poolt kirjas.
function parseGames(score) {
  const s = String(score || "").trim();
  if (!s || s === "—" || s === "?" || /w\/?o|loob|ret|katkest|vigast|ei m/i.test(s)) return null;
  // Tiebreaki punktid sulgudes välja: 7:6(8:6), 7/6(5), 6/7 (9)
  const puhas = s.replace(/\(\s*\d+(?:\s*[:\-/]\s*\d+)?\s*\)/g, " ");
  const sets = [];
  puhas.split(/[\s,;]+/).forEach((tok) => {
    const t = tok.replace(/[\[\]]/g, "").replace(/^[:\-/]+|[:\-/]+$/g, "");   // "4/6/" -> "4/6"
    const m = t.match(/^(\d+)[:\-/](\d+)$/);
    if (m) sets.push([Number(m[1]), Number(m[2])]);
  });
  if (!sets.length) return null;
  let x = 0, y = 0, sx = 0, sy = 0;
  sets.forEach(([a, b]) => {
    if (a > b) sx++; else if (b > a) sy++;
    // Kõik andmetes olevad >=10 setid on otsustavad supertiebreakid
    // (kontrollitud 09.2026, pro-sette pole) -> loeb 1 geimiks.
    if (Math.max(a, b) >= 10) { if (a > b) x += 1; else y += 1; }
    else { x += a; y += b; }
  });
  return sx >= sy ? [x, y] : [y, x];
}

function computeStrength() {
  const won = new Map();   // nimi -> võidetud geimid
  const opp = new Map();   // nimi -> Map(vastane -> geime kokku)
  const add = (map, k, v) => map.set(k, (map.get(k) || 0) + v);
  state.players.forEach((pl) => {
    pl.strength = null; pl.strengthLo = null; pl.strengthHi = null; pl.strengthRank = null;
    pl.scoredMatches = 0; pl.gamesW = 0; pl.gamesL = 0;
  });

  state.matches.forEach((m) => {
    if (m.off || !m.winner) return;
    const g = parseGames(m.score);
    if (!g) return;
    const w = m.winner;
    const l = m.winner === m.a ? m.b : m.a;
    const pw = state.players.get(w);
    const pl = state.players.get(l);
    if (!pw || !pl) return;
    add(won, w, g[0]); add(won, l, g[1]);
    if (!opp.has(w)) opp.set(w, new Map());
    if (!opp.has(l)) opp.set(l, new Map());
    add(opp.get(w), l, g[0] + g[1]); add(opp.get(l), w, g[0] + g[1]);
    pw.scoredMatches++; pl.scoredMatches++;
    pw.gamesW += g[0]; pw.gamesL += g[1]; pl.gamesW += g[1]; pl.gamesL += g[0];
  });

  const names = Array.from(opp.keys());
  if (!names.length) return;
  let s = new Map(names.map((n) => [n, 0]));
  for (let it = 0; it < 3000; it++) {
    const uus = new Map();
    names.forEach((i) => {
      const ei = Math.exp(s.get(i));
      let den = STR_PRIOR / (ei + 1);
      opp.get(i).forEach((k, j) => { den += k / (ei + Math.exp(s.get(j))); });
      uus.set(i, Math.log(((won.get(i) || 0) + STR_PRIOR / 2) / den));
    });
    const kesk = names.reduce((t, n) => t + uus.get(n), 0) / names.length;
    let muutus = 0;
    names.forEach((n) => {
      const v = uus.get(n) - kesk;
      muutus = Math.max(muutus, Math.abs(v - s.get(n)));
      uus.set(n, v);
    });
    s = uus;
    if (muutus < 1e-9) break;
  }

  // 95% vahemik Fisheri informatsiooni diagonaalist
  const SKAALA = 400 / Math.LN10;
  names.forEach((i) => {
    const ei = Math.exp(s.get(i));
    let info = STR_PRIOR * ei / ((ei + 1) ** 2);
    opp.get(i).forEach((k, j) => {
      const e = ei / (ei + Math.exp(s.get(j)));
      info += k * e * (1 - e);
    });
    const se = 1 / Math.sqrt(info);
    const p = state.players.get(i);
    p.strength = Math.round(1500 + SKAALA * s.get(i));
    p.strengthLo = Math.round(1500 + SKAALA * (s.get(i) - 1.96 * se));
    p.strengthHi = Math.round(1500 + SKAALA * (s.get(i) + 1.96 * se));
  });
  Array.from(state.players.values())
    .filter((p) => p.strength !== null)
    .sort((a, b) => b.strength - a.strength)
    .forEach((p, i) => { p.strengthRank = i + 1; });
}

// ---------- players ----------

function buildPlayers() {
  state.players = new Map();
  const ensure = (name) => {
    if (!name) return null;
    if (!state.players.has(name)) {
      state.players.set(name, {
        name,
        vusRank: null, vusPoints: null, pyrPos: null,
        played: 0, wins: 0, losses: 0,
        vusW: 0, vusL: 0, pyrW: 0, pyrL: 0, mvW: 0, mvL: 0,
        form: [],      // uusim esimesena
        results: [],   // kõik tulemused, uusim esimesena (seeriate jaoks)
      });
    }
    return state.players.get(name);
  };

  (state.vus.players || []).forEach((p) => {
    const pl = ensure(norm(p.name));
    pl.vusRank = p.rank;
    pl.vusPoints = p.total;
  });
  (state.puramiid.players || []).forEach((p) => {
    const pl = ensure(norm(p.name));
    pl.pyrPos = p.pos;
  });

  // Mängud on sorteeritud uusim-enne — form koguneb õiges järjekorras.
  state.matches.forEach((m) => {
    const a = ensure(m.a);
    const b = ensure(m.b);
    if (m.off) return; // arvestusevälised ei loe statistikasse
    [[a, m], [b, m]].forEach(([pl, match]) => {
      const won = match.winner === pl.name;
      pl.played += 1;
      if (won) pl.wins += 1; else pl.losses += 1;
      if (match.format === "vus") { won ? pl.vusW++ : pl.vusL++; }
      else if (match.format === "mv") { won ? pl.mvW++ : pl.mvL++; }
      else { won ? pl.pyrW++ : pl.pyrL++; }
      if (pl.form.length < 5) pl.form.push(won ? "W" : "L");
      pl.results.push(won ? "W" : "L");
    });
  });

  // Elo-reiting: kõik arvestuslikud mängud kronoloogiliselt (vanim enne) —
  // VÜS etapid + püramiid + maakonna MV (mv.json, ilma püramiidis olevate topeltmängudeta).
  // Start 1500, K=32. Prognoos H2H vaates põhineb samal valemil.
  const ELO_START = 1500;
  const ELO_K = 32;
  state.players.forEach((pl) => { pl.elo = ELO_START; pl.eloPeak = ELO_START; });
  state.matches.slice().reverse().forEach((m) => {
    if (m.off || !m.winner) return;
    const a = state.players.get(m.a);
    const b = state.players.get(m.b);
    if (!a || !b) return;
    const expA = 1 / (1 + Math.pow(10, (b.elo - a.elo) / 400));
    const scoreA = m.winner === a.name ? 1 : 0;
    a.elo += ELO_K * (scoreA - expA);
    b.elo += ELO_K * ((1 - scoreA) - (1 - expA));
    a.eloPeak = Math.max(a.eloPeak, a.elo);
    b.eloPeak = Math.max(b.eloPeak, b.elo);
  });
  state.players.forEach((pl) => {
    pl.elo = Math.round(pl.elo);
    pl.eloPeak = Math.round(pl.eloPeak);
  });
  // Elo-koht (ainult mänginud mängijate seas)
  const byElo = Array.from(state.players.values())
    .filter((p) => p.played > 0)
    .sort((a, b) => b.elo - a.elo);
  byElo.forEach((p, i) => { p.eloRank = i + 1; });

  // Geimipõhine tugevus (vt computeStrength)
  computeStrength();

  // Saavutused: etapivõidud (turniiride lõppjärjestustest), tipukohad.
  state.players.forEach((pl) => { pl.titles = 0; });
  state.tournaments.forEach(({ json }) => {
    (json.loppjarjestus || []).forEach((row) => {
      if (row.koht === 1) {
        const pl = state.players.get(norm(row.mangija));
        if (pl) pl.titles += 1;
      }
    });
  });

  // Seeriad: praegune (uusimast tahapoole) + pikim võiduseeria läbi aegade.
  state.players.forEach((pl) => {
    let cur = 0;
    const curType = pl.results[0] || null;
    for (const r of pl.results) {
      if (r === curType) cur += 1; else break;
    }
    pl.curStreakType = curType;
    pl.curStreakLen = cur;

    let best = 0, run = 0;
    // results on uusim-enne; seeria pikkuse jaoks suund ei loe
    for (const r of pl.results) {
      if (r === "W") { run += 1; best = Math.max(best, run); }
      else run = 0;
    }
    pl.bestWinStreak = best;
  });
}

// ---------- records ----------

function renderRecords() {
  const grid = $("#records-grid");
  grid.innerHTML = "";
  const list = Array.from(state.players.values()).filter((p) => p.played > 0);
  if (!list.length) return;

  const card = (title, rows) => {
    const el = document.createElement("div");
    el.className = "stat-card";
    el.innerHTML = `<h3>${title}</h3>` +
      rows.map((r) => `<div class="stat-row">${r}</div>`).join("");
    grid.appendChild(el);
  };
  const top3 = (arr, fmt) => arr.slice(0, 3).map((p, i) => `${i + 1}. ${escapeHtml(p.name)} <b>${fmt(p)}</b>`);

  card("🔥 Kuumim seeria praegu",
    top3(list.filter((p) => p.curStreakType === "W" && p.curStreakLen >= 2)
      .sort((a, b) => b.curStreakLen - a.curStreakLen), (p) => `${p.curStreakLen} võitu järjest`));

  card("🏆 Pikim võiduseeria",
    top3(list.filter((p) => p.bestWinStreak >= 2)
      .sort((a, b) => b.bestWinStreak - a.bestWinStreak), (p) => `${p.bestWinStreak}`));

  card("🎾 Enim mänge",
    top3(list.slice().sort((a, b) => b.played - a.played), (p) => `${p.played}`));

  card("💯 Parim võiduprotsent (≥8 mängu)",
    top3(list.filter((p) => p.played >= 8)
      .sort((a, b) => winPct(b) - winPct(a)), (p) => `${Math.round(winPct(p) * 100)}% (${p.wins}/${p.played})`));

  card("📈 Elo-reiting",
    top3(list.slice().sort((a, b) => b.elo - a.elo), (p) => `${p.elo}`));
  card("💪 Tugevus (geimipõhine)",
    top3(list.filter((p) => p.strength !== null && p.scoredMatches >= 3)
      .sort((a, b) => b.strength - a.strength), (p) => `${p.strength}`));
}

function winPct(p) {
  return p.played ? p.wins / p.played : 0;
}

// ---------- tabs ----------

function setupTabs() {
  $$(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".tab").forEach((b) => b.classList.toggle("active", b === btn));
      $$(".tab-panel").forEach((p) =>
        p.classList.toggle("active", p.id === `tab-${btn.dataset.tab}`));
    });
  });
}

function switchTab(tab) {
  $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${tab}`));
}

// ---------- register ----------

function setupRegister() {
  $("#player-search").addEventListener("input", (e) => {
    state.search = e.target.value.trim().toLowerCase();
    renderRegister();
  });
  $("#player-sort").addEventListener("change", (e) => {
    state.sort = e.target.value;
    renderRegister();
  });
  $("#profile-back").addEventListener("click", closeProfile);
  $("#profile-format").addEventListener("change", (e) => {
    state.profileFormat = e.target.value;
    renderProfileMatches();
  });
}

function formDots(form) {
  // form: uusim esimesena -> kuva vanim vasakul
  return form.slice().reverse()
    .map((r) => `<span class="dot-form ${r === "W" ? "dot-w" : "dot-l"}">${r}</span>`)
    .join("");
}

function renderRegister() {
  const grid = $("#player-grid");
  grid.innerHTML = "";

  let list = Array.from(state.players.values());
  if (state.search) {
    list = list.filter((p) => p.name.toLowerCase().includes(state.search));
  }

  const sorters = {
    vus: (a, b) => (a.vusRank ?? 999) - (b.vusRank ?? 999) || a.name.localeCompare(b.name, "et"),
    elo: (a, b) => (a.eloRank ?? 999) - (b.eloRank ?? 999),
    strength: (a, b) => (a.strengthRank ?? 999) - (b.strengthRank ?? 999),
    matches: (a, b) => b.played - a.played,
    winpct: (a, b) => winPct(b) - winPct(a) || b.played - a.played,
    name: (a, b) => a.name.localeCompare(b.name, "et"),
  };
  list.sort(sorters[state.sort] || sorters.vus);

  list.forEach((p) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "player-card";
    const trophies =
      (p.titles ? " " + "🏆".repeat(Math.min(p.titles, 3)) : "") +
      (p.pyrPos === 1 ? " 👑" : "");
    card.innerHTML = `
      <div class="player-card-name">${escapeHtml(p.name)}${trophies}</div>
      <div class="player-card-meta">
        ${p.vusRank ? `VÜS: ${p.vusRank}. koht · ${p.vusPoints} p` : "VÜS: —"}
      </div>
      <div class="player-card-meta">
        ${p.pyrPos ? `Püramiid: ${p.pyrPos}. koht` : "Püramiid: —"}${p.played ? ` · Elo ${p.elo}` : ""}${p.strength ? ` · Tugevus ${p.strength}` : ""}
      </div>
      <div class="player-card-stats">
        <span>${p.played} mängu</span>
        <span>${p.wins}V ${p.losses}K${p.played ? ` (${Math.round(winPct(p) * 100)}%)` : ""}</span>
      </div>
      <div class="player-card-form">${formDots(p.form)}</div>
    `;
    card.addEventListener("click", () => openProfile(p.name));
    grid.appendChild(card);
  });
}

// ---------- profile ----------

function openProfile(name) {
  state.profileName = name;
  state.profileFormat = "";
  $("#profile-format").value = "";
  location.hash = `p=${encodeURIComponent(name)}`;

  $("#view-register").hidden = true;
  $("#view-profile").hidden = false;
  switchTab("players");

  const p = state.players.get(name);
  $("#profile-name").textContent = name;

  const badges = [];
  if (p.titles) badges.push(`<span class="profile-badge">🏆 ${p.titles}× etapivõitja</span>`);
  if (p.pyrPos === 1) badges.push(`<span class="profile-badge">👑 Püramiidi tipp</span>`);
  if (p.vusRank === 1) badges.push(`<span class="profile-badge">🥇 VÜS liider</span>`);
  if (p.vusRank) badges.push(`<span class="profile-badge">VÜS ${p.vusRank}. koht · ${p.vusPoints} p</span>`);
  if (p.pyrPos) badges.push(`<span class="profile-badge">Püramiid ${p.pyrPos}. koht</span>`);
  if (p.played) badges.push(`<span class="profile-badge">Elo ${p.elo}${p.eloRank ? ` (${p.eloRank}.)` : ""}</span>`);
  if (p.strength) badges.push(`<span class="profile-badge">Tugevus ${p.strength}${p.strengthRank ? ` (${p.strengthRank}.)` : ""}</span>`);
  badges.push(`<span class="profile-badge">Vorm: ${formDots(p.form) || "—"}</span>`);
  if (p.curStreakType === "W" && p.curStreakLen >= 3) {
    badges.push(`<span class="profile-badge">🔥 ${p.curStreakLen} võitu järjest</span>`);
  }
  if (p.bestWinStreak >= 3) {
    badges.push(`<span class="profile-badge">Pikim seeria: ${p.bestWinStreak}</span>`);
  }
  $("#profile-badges").innerHTML = badges.join("");

  const stats = $("#profile-stats");
  stats.innerHTML = "";
  const statCard = (title, rows) => {
    const el = document.createElement("div");
    el.className = "stat-card";
    el.innerHTML = `<h3>${title}</h3>` + rows.map((r) => `<div class="stat-row">${r}</div>`).join("");
    return el;
  };
  stats.appendChild(statCard("Kokku", [
    `Mänge: <b>${p.played}</b>`,
    `Võite: <b>${p.wins}</b> · Kaotusi: <b>${p.losses}</b>`,
    `Võiduprotsent: <b>${p.played ? Math.round(winPct(p) * 100) + "%" : "—"}</b>`,
    `Elo: <b>${p.played ? p.elo : "—"}</b>${p.played && p.eloPeak > p.elo ? ` <span class="dim">(tipp ${p.eloPeak})</span>` : ""}`,
    p.strength
      ? `Tugevus: <b>${p.strength}</b> <span class="dim">(95%: ${p.strengthLo}–${p.strengthHi} · geimid ${p.gamesW}–${p.gamesL})</span>`
      : `Tugevus: <b>—</b>`,
  ]));
  stats.appendChild(statCard("VÜS turniirid", [
    `Võite: <b>${p.vusW}</b> · Kaotusi: <b>${p.vusL}</b>`,
    p.vusRank ? `Edetabel: <b>${p.vusRank}.</b> (${p.vusPoints} p)` : "Edetabelis ei osale",
  ]));
  stats.appendChild(statCard("Püramiid", [
    `Võite: <b>${p.pyrW}</b> · Kaotusi: <b>${p.pyrL}</b>`,
    p.pyrPos ? `Positsioon: <b>${p.pyrPos}.</b>` : "Püramiidis ei osale",
  ]));
  if (p.mvW + p.mvL > 0) {
    // Ainult need MV mängud, mida püramiidis pole (seal loetakse püramiidi alla).
    stats.appendChild(statCard("Maakonna MV", [
      `Võite: <b>${p.mvW}</b> · Kaotusi: <b>${p.mvL}</b>`,
      `<span class="dim">püramiidi mängijate omavahelised on püramiidi all</span>`,
    ]));
  }

  renderProfileChallenges(name);
  renderRankChart(name);
  renderProfileMatches();
  renderProfileOpponents();
  window.scrollTo(0, 0);
}

// A: ootel püramiidiväljakutsed selle mängijaga
function addDaysISO(isoDate, days) {
  const d = new Date(isoDate + "T00:00:00");
  if (isNaN(d)) return null;
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function daysUntilISO(isoDate) {
  const d = new Date(isoDate + "T00:00:00");
  if (isNaN(d)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

function renderProfileChallenges(name) {
  const section = $("#profile-challenges-section");
  const list = $("#profile-challenges");
  list.innerHTML = "";

  const mine = (state.puramiid.challenges || []).filter((c) =>
    norm(c.challenger) === name || norm(c.challenged) === name);
  section.hidden = mine.length === 0;

  mine.forEach((c) => {
    const deadline = c.deadline ||
      (c.challenge_date ? addDaysISO(c.challenge_date, 14) : null);
    let deadlineHtml = "";
    if (deadline) {
      const left = daysUntilISO(deadline);
      let cls = "";
      let label = `Mängida hiljemalt ${fmtDateISO(deadline)}`;
      if (left !== null) {
        if (left < 0) { cls = "is-overdue"; label += ` — tähtaeg möödas ${Math.abs(left)} päeva`; }
        else if (left <= 3) { cls = "is-soon"; label += left === 0 ? " — täna!" : ` — ${left} päeva jäänud`; }
        else label += ` — ${left} päeva jäänud`;
      }
      deadlineHtml = `<div class="challenge-deadline ${cls}">${label}</div>`;
    }
    let agreedHtml = "";
    const am = String(c.agreed_time || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    const venuePart = c.venue ? ` · 📍 ${escapeHtml(c.venue)}` : "";
    if (am) {
      const wd = ["P", "E", "T", "K", "N", "R", "L"][
        new Date(Number(am[1]), Number(am[2]) - 1, Number(am[3])).getDay()];
      agreedHtml = `<div class="challenge-agreed">🕐 Mäng: ${wd}, ${am[3]}.${am[2]}.${am[1]} kell ${am[4]}:${am[5]}${venuePart}</div>`;
    } else if (c.venue) {
      agreedHtml = `<div class="challenge-agreed">📍 ${escapeHtml(c.venue)}</div>`;
    }

    const card = document.createElement("div");
    card.className = "challenge-card";
    card.innerHTML = `
      <div class="challenge-players">
        <span class="challenge-name">${escapeHtml(norm(c.challenger))}</span>
        <span class="challenge-vs">vs</span>
        <span class="challenge-name">${escapeHtml(norm(c.challenged))}</span>
        ${c.erand ? '<span class="type-badge type-erand">Erand</span>' : ""}
      </div>
      <div class="challenge-meta"><span>Esitatud: ${fmtDateISO(c.challenge_date)}</span></div>
      ${agreedHtml}
      ${deadlineHtml}
    `;
    list.appendChild(card);
  });
}

// B: VÜS edetabelikoha ajaloograafik
function renderRankChart(name) {
  const section = $("#profile-rank-section");
  const snaps = state.history || [];

  const points = snaps.map((s) => {
    const p = s.players.find((x) => x.name === name);
    return { date: s.date, rank: p ? p.rank : null };
  });
  const known = points.filter((p) => p.rank !== null);

  if (known.length < 2 || typeof Chart === "undefined") {
    section.hidden = true;
    if (state.rankChart) { state.rankChart.destroy(); state.rankChart = null; }
    return;
  }
  section.hidden = false;

  const ctx = $("#profile-rank-chart").getContext("2d");
  if (state.rankChart) state.rankChart.destroy();

  const bodyFont = '"Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
  state.rankChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: points.map((p) => fmtDateISO(p.date)),
      datasets: [{
        label: `${name} — VÜS koht`,
        data: points.map((p) => p.rank),
        borderColor: "#1a1a1a",
        borderWidth: 1.5,
        backgroundColor: "rgba(78, 50, 23, 0.06)",
        fill: true,
        tension: 0.3,
        spanGaps: true,
        pointRadius: 4,
        pointBackgroundColor: "#ffffff",
        pointBorderColor: "#1a1a1a",
        pointBorderWidth: 1.5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: { color: "rgba(0,0,0,0.05)", drawTicks: false },
          border: { display: false },
          ticks: { color: "#777169", font: { family: bodyFont, size: 11, weight: 500 }, padding: 8 },
        },
        y: {
          reverse: true, // 1. koht üleval
          grid: { color: "rgba(0,0,0,0.05)", drawTicks: false },
          border: { display: false },
          ticks: {
            color: "#777169",
            font: { family: bodyFont, size: 11, weight: 500 },
            padding: 10,
            precision: 0,
            callback: (v) => Number.isInteger(v) ? `${v}.` : "",
          },
        },
      },
      plugins: {
        legend: {
          labels: { color: "#4e4e4e", font: { family: bodyFont, size: 13, weight: 500 },
            usePointStyle: true, pointStyle: "line", boxWidth: 24 },
        },
        tooltip: {
          backgroundColor: "#ffffff",
          titleColor: "#4e4e4e",
          bodyColor: "#1a1a1a",
          borderColor: "rgba(0,0,0,0.06)",
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          displayColors: false,
          callbacks: { label: (c) => c.parsed.y === null ? "—" : `${c.parsed.y}. koht` },
        },
      },
    },
  });
}

function closeProfile() {
  state.profileName = null;
  history.replaceState(null, "", location.pathname);
  $("#view-profile").hidden = true;
  $("#view-register").hidden = false;
}

function playerMatches(name) {
  return state.matches.filter((m) => m.a === name || m.b === name);
}

function renderProfileMatches() {
  const name = state.profileName;
  const tbody = $("#profile-matches tbody");
  tbody.innerHTML = "";
  let list = playerMatches(name);
  if (state.profileFormat) list = list.filter((m) => m.format === state.profileFormat);

  list.forEach((m) => {
    const opp = m.a === name ? m.b : m.a;
    const won = m.winner === name;
    const tr = document.createElement("tr");
    if (m.off) tr.classList.add("game-off");
    tr.innerHTML = `
      <td class="dim">${escapeHtml(m.display)}</td>
      <td>${escapeHtml(m.event)}</td>
      <td class="player-name"><button type="button">${escapeHtml(opp)}</button></td>
      <td class="num">${fmtScore(m.score)}</td>
      <td>${m.off ? '<span class="dim">arvestuseväline</span>'
        : won ? '<span class="res-w">Võit</span>' : '<span class="res-l">Kaotus</span>'}</td>
    `;
    tr.querySelector("button").addEventListener("click", () => openProfile(opp));
    tbody.appendChild(tr);
  });
}

function renderProfileOpponents() {
  const name = state.profileName;
  const tbody = $("#profile-opponents tbody");
  tbody.innerHTML = "";

  const opp = new Map();
  playerMatches(name).forEach((m) => {
    if (m.off) return;
    const o = m.a === name ? m.b : m.a;
    if (!opp.has(o)) opp.set(o, { w: 0, l: 0 });
    if (m.winner === name) opp.get(o).w += 1; else opp.get(o).l += 1;
  });

  Array.from(opp.entries())
    .sort((a, b) => (b[1].w + b[1].l) - (a[1].w + a[1].l))
    .forEach(([o, r]) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="player-name"><button type="button">${escapeHtml(o)}</button></td>
        <td class="num">${r.w + r.l}</td>
        <td class="num">${r.w}</td>
        <td class="num">${r.l}</td>
        <td class="num"><button type="button" class="linklike">vaata →</button></td>
      `;
      tr.querySelector(".player-name button").addEventListener("click", () => openProfile(o));
      tr.querySelector(".linklike").addEventListener("click", () => {
        $("#h2h-a").value = name;
        $("#h2h-b").value = o;
        renderH2H();
        switchTab("h2h");
        window.scrollTo(0, 0);
      });
      tbody.appendChild(tr);
    });
}

// ---------- H2H ----------

function setupH2H() {
  const names = Array.from(state.players.keys()).sort((a, b) => a.localeCompare(b, "et"));
  [["#h2h-a", 0], ["#h2h-b", 1]].forEach(([sel, idx]) => {
    const el = $(sel);
    el.innerHTML = "";
    names.forEach((n) => {
      const opt = document.createElement("option");
      opt.value = n;
      opt.textContent = n;
      el.appendChild(opt);
    });
    if (names[idx]) el.value = names[idx];
    el.addEventListener("change", renderH2H);
  });
  renderH2H();
}

function renderH2H() {
  const a = $("#h2h-a").value;
  const b = $("#h2h-b").value;
  const result = $("#h2h-result");
  const empty = $("#h2h-empty");
  const tbody = $("#h2h-matches tbody");
  tbody.innerHTML = "";

  if (!a || !b || a === b) {
    result.hidden = true;
    empty.hidden = false;
    empty.textContent = a === b ? "Vali kaks erinevat mängijat." : "Vali mängijad.";
    return;
  }

  const meetings = state.matches.filter((m) =>
    (m.a === a && m.b === b) || (m.a === b && m.b === a));

  // Kaart on nähtav ka ilma omavaheliste mängudeta — Elo-prognoos
  // ei sõltu kohtumistest. Peidame ainult kohtumiste tabeli.
  empty.hidden = true;
  result.hidden = false;
  $("#h2h-table-wrap").hidden = meetings.length === 0;

  const counted = meetings.filter((m) => !m.off);
  const aWins = counted.filter((m) => m.winner === a).length;
  const bWins = counted.filter((m) => m.winner === b).length;
  const vusA = counted.filter((m) => m.format === "vus" && m.winner === a).length;
  const vusB = counted.filter((m) => m.format === "vus" && m.winner === b).length;
  const pyrA = counted.filter((m) => m.format === "puramiid" && m.winner === a).length;
  const pyrB = counted.filter((m) => m.format === "puramiid" && m.winner === b).length;
  const mvA = counted.filter((m) => m.format === "mv" && m.winner === a).length;
  const mvB = counted.filter((m) => m.format === "mv" && m.winner === b).length;

  $("#h2h-name-a").textContent = a;
  $("#h2h-name-b").textContent = b;
  $("#h2h-score").textContent = `${aWins} : ${bWins}`;

  // Elo-põhine võiduprognoos
  const pa = state.players.get(a);
  const pb = state.players.get(b);
  const prob = $("#h2h-prob");
  const probNa = $("#h2h-prob-na");
  if (pa?.played && pb?.played) {
    const pA = 1 / (1 + Math.pow(10, (pb.elo - pa.elo) / 400));
    const pctA = Math.round(pA * 100);
    prob.hidden = false;
    probNa.hidden = true;
    $("#h2h-prob-a").textContent = `${a} ${pctA}%`;
    $("#h2h-prob-b").textContent = `${100 - pctA}% ${b}`;
    $("#h2h-prob-fill").style.width = `${pctA}%`;
  } else {
    // Selgita, KELLE tõttu prognoosi pole — mängijal pole ühtegi
    // kirjendatud mängu (punktid pärinevad etappidelt ilma tabeliteta).
    prob.hidden = true;
    const missing = [pa, pb].filter((p) => !p || !p.played)
      .map((p, i) => p ? p.name : (i === 0 ? a : b));
    probNa.hidden = false;
    probNa.textContent =
      `Võiduprognoosi ei saa arvutada: ${missing.join(" ja ")} — ` +
      `pole ühtegi kirjendatud üksikmängu. Punktid pärinevad etappidelt, ` +
      `mille mängutabeleid pole veel lisatud (Elo vajab vähemalt üht mängu).`;
  }
  $("#h2h-breakdown").innerHTML = meetings.length
    ? `
      <span>VÜS turniirid <b>${vusA} : ${vusB}</b></span>
      <span>Püramiid <b>${pyrA} : ${pyrB}</b></span>
      ${mvA + mvB > 0 ? `<span>Maakonna MV <b>${mvA} : ${mvB}</b></span>` : ""}
      ${meetings.length !== counted.length ? `<span class="dim">+ ${meetings.length - counted.length} arvestuseväline</span>` : ""}
    `
    : '<span class="dim">Pole veel omavahel mänginud</span>';

  meetings.forEach((m) => {
    const tr = document.createElement("tr");
    if (m.off) tr.classList.add("game-off");
    tr.innerHTML = `
      <td class="dim">${escapeHtml(m.display)}</td>
      <td>${escapeHtml(m.event)}</td>
      <td class="num">${fmtScore(m.score)}</td>
      <td class="game-winner">${escapeHtml(m.winner || "—")}${m.off ? ' <span class="dim">(arvestuseväline)</span>' : ""}</td>
    `;
    tbody.appendChild(tr);
  });
}

document.addEventListener("DOMContentLoaded", init);
