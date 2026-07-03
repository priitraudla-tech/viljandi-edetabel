// Mängijad — ATP-stiilis profiilid ja omavaheliste mängude (H2H) statistika.
// Agregeerib: data/puramiid.json + data/turniirid/*.json + data/current.json.

// Nimede ühtlustamine: turniiripaberitel esinevad variandid.
const NAME_ALIASES = {
  "Helmar Mirka": "Heimar Mirka",
};

const state = {
  vus: null,          // current.json
  puramiid: null,     // puramiid.json
  tournaments: [],    // laaditud turniiri-JSON-id
  matches: [],        // ühtlustatud mängude list
  players: new Map(), // name -> {name, vusRank, vusPoints, pyrPos, stats...}
  sort: "vus",
  search: "",
  profileName: null,
  profileFormat: "",
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function norm(name) {
  if (!name) return null;
  const n = String(name).trim();
  return NAME_ALIASES[n] || n;
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

async function fetchJSON(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

// ---------- load ----------

async function init() {
  try {
    [state.vus, state.puramiid] = await Promise.all([
      fetchJSON("data/current.json"),
      fetchJSON("data/puramiid.json"),
    ]);
  } catch (e) {
    document.body.innerHTML = `<div style="padding:32px;font-family:sans-serif">
      <h2>Viga andmete laadimisel</h2><pre>${escapeHtml(e.message)}</pre></div>`;
    return;
  }

  // Turniirifailid: proovi iga etapi kuupäeva (404 = pole bracketit).
  const dates = (state.vus.stages || []).map((s) => s.date).filter(Boolean);
  const loaded = await Promise.all(dates.map((d) =>
    fetchJSON(`data/turniirid/${d}.json`)
      .then((j) => ({ date: d, json: j }))
      .catch(() => null)));
  state.tournaments = loaded.filter(Boolean);

  buildMatches();
  buildPlayers();

  $("#meta-counts").textContent =
    `${state.players.size} mängijat · ${state.matches.length} mängu ` +
    `(${state.matches.filter((m) => m.format === "vus").length} turniiridel, ` +
    `${state.matches.filter((m) => m.format === "puramiid").length} püramiidis)`;

  setupTabs();
  setupRegister();
  setupH2H();
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
  });

  // Uusim ees; kuupäevata lõppu.
  state.matches.sort((x, y) => {
    if (x.date && y.date) return y.date.localeCompare(x.date);
    if (x.date) return -1;
    if (y.date) return 1;
    return 0;
  });
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
        vusW: 0, vusL: 0, pyrW: 0, pyrL: 0,
        form: [], // uusim esimesena
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
      else { won ? pl.pyrW++ : pl.pyrL++; }
      if (pl.form.length < 5) pl.form.push(won ? "W" : "L");
    });
  });
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
    matches: (a, b) => b.played - a.played,
    winpct: (a, b) => winPct(b) - winPct(a) || b.played - a.played,
    name: (a, b) => a.name.localeCompare(b.name, "et"),
  };
  list.sort(sorters[state.sort] || sorters.vus);

  list.forEach((p) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "player-card";
    card.innerHTML = `
      <div class="player-card-name">${escapeHtml(p.name)}</div>
      <div class="player-card-meta">
        ${p.vusRank ? `VÜS: ${p.vusRank}. koht · ${p.vusPoints} p` : "VÜS: —"}
      </div>
      <div class="player-card-meta">
        ${p.pyrPos ? `Püramiid: ${p.pyrPos}. koht` : "Püramiid: —"}
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
  if (p.vusRank) badges.push(`<span class="profile-badge">VÜS ${p.vusRank}. koht · ${p.vusPoints} p</span>`);
  if (p.pyrPos) badges.push(`<span class="profile-badge">Püramiid ${p.pyrPos}. koht</span>`);
  badges.push(`<span class="profile-badge">Vorm: ${formDots(p.form) || "—"}</span>`);
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
  ]));
  stats.appendChild(statCard("VÜS turniirid", [
    `Võite: <b>${p.vusW}</b> · Kaotusi: <b>${p.vusL}</b>`,
    p.vusRank ? `Edetabel: <b>${p.vusRank}.</b> (${p.vusPoints} p)` : "Edetabelis ei osale",
  ]));
  stats.appendChild(statCard("Püramiid", [
    `Võite: <b>${p.pyrW}</b> · Kaotusi: <b>${p.pyrL}</b>`,
    p.pyrPos ? `Positsioon: <b>${p.pyrPos}.</b>` : "Püramiidis ei osale",
  ]));

  renderProfileMatches();
  renderProfileOpponents();
  window.scrollTo(0, 0);
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
      <td class="num">${escapeHtml(m.score)}</td>
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

  if (!meetings.length) {
    result.hidden = true;
    empty.hidden = false;
    empty.textContent = "Need mängijad pole omavahel mänginud.";
    return;
  }

  empty.hidden = true;
  result.hidden = false;

  const counted = meetings.filter((m) => !m.off);
  const aWins = counted.filter((m) => m.winner === a).length;
  const bWins = counted.filter((m) => m.winner === b).length;
  const vusA = counted.filter((m) => m.format === "vus" && m.winner === a).length;
  const vusB = counted.filter((m) => m.format === "vus" && m.winner === b).length;
  const pyrA = counted.filter((m) => m.format === "puramiid" && m.winner === a).length;
  const pyrB = counted.filter((m) => m.format === "puramiid" && m.winner === b).length;

  $("#h2h-name-a").textContent = a;
  $("#h2h-name-b").textContent = b;
  $("#h2h-score").textContent = `${aWins} : ${bWins}`;
  $("#h2h-breakdown").innerHTML = `
    <span>VÜS turniirid <b>${vusA} : ${vusB}</b></span>
    <span>Püramiid <b>${pyrA} : ${pyrB}</b></span>
    ${meetings.length !== counted.length ? `<span class="dim">+ ${meetings.length - counted.length} arvestuseväline</span>` : ""}
  `;

  meetings.forEach((m) => {
    const tr = document.createElement("tr");
    if (m.off) tr.classList.add("game-off");
    tr.innerHTML = `
      <td class="dim">${escapeHtml(m.display)}</td>
      <td>${escapeHtml(m.event)}</td>
      <td class="num">${escapeHtml(m.score)}</td>
      <td class="game-winner">${escapeHtml(m.winner || "—")}${m.off ? ' <span class="dim">(arvestuseväline)</span>' : ""}</td>
    `;
    tbody.appendChild(tr);
  });
}

document.addEventListener("DOMContentLoaded", init);
