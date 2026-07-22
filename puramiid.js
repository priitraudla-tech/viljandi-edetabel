// Püramiid — visuaal, mängud, väljakutsed, statistika + haldus.

const state = {
  data: null,
  gamesSearch: "",
  gamesType: "",
  adminTab: "challenge",
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("et-EE", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtDateISO(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("et-EE", {
      year: "numeric", month: "2-digit", day: "2-digit",
    });
  } catch {
    return iso;
  }
}

async function fetchJSON(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

const CHALLENGE_DAYS = 14; // väljakutse tuleb mängida 2 nädala jooksul

function addDays(isoDate, days) {
  const d = new Date(isoDate + "T00:00:00");
  if (isNaN(d)) return null;
  d.setDate(d.getDate() + days);
  // NB: mitte toISOString() — see nihutaks UTC+ ajavööndis päeva tagasi.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function daysUntil(isoDate) {
  const d = new Date(isoDate + "T00:00:00");
  if (isNaN(d)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

// "2026-07-18T19:00" -> "L, 18.07.2026 kell 19:00"
function fmtAgreed(dt) {
  const m = String(dt || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return dt || "";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const wd = ["P", "E", "T", "K", "N", "R", "L"][d.getDay()];
  return `${wd}, ${m[3]}.${m[2]}.${m[1]} kell ${m[4]}:${m[5]}`;
}

// Varem kasutatud mängukohad (väljakutsetest ja mängudest) — soovitusteks.
function knownVenues() {
  const seen = new Set();
  const out = [];
  const add = (v) => {
    const s = String(v || "").trim();
    if (!s) return;
    const key = s.toLowerCase();
    if (!seen.has(key)) { seen.add(key); out.push(s); }
  };
  (state.data.challenges || []).forEach((c) => add(c.venue));
  (state.data.games || []).forEach((g) => add(g.venue));
  return out;
}

function refreshVenueDatalist() {
  const dl = $("#venue-list");
  if (!dl) return;
  dl.innerHTML = "";
  knownVenues().forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v;
    dl.appendChild(opt);
  });
}

// Skoor, mis on tegelikult seletustekst (nt "Ei mängitud, kuna ...") —
// kuvatakse kompaktse margisena, taistekst avaneb klopsuga.
// Paris skoorid (sh "3/6 7/6(5) 7/10", "katkestus"-lisandiga) jaavad puutumata.
function scoreNote(score) {
  const s = String(score || "").trim();
  if (s.length <= 12) return null;
  if (/\d\s*[\/:]\s*\d/.test(s)) return null; // sisaldab paris skoori
  const label = /^ei mängitud/i.test(s) ? "Ei mängitud" : "Märkus";
  return { label, full: s };
}

function agreedInPast(dt) {
  const m = String(dt || "").match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  return d < new Date();
}

// ---------- rules helpers ----------

const ERAND_MAX = 2;        // allapoole-väljakutseid hooajal mängija kohta
const ERAND_MAX_DIST = 2;   // mitu kohta allapoole tohib kutsuda
const COOLDOWN_DAYS = 14;   // sama paari uus väljakutse

function playerByName(name) {
  return state.data.players.find((p) => p.name === name) || null;
}

// Mängijad, kellel on ootel väljakutse — nad on "mängus" ega ole valitavad.
function busyPlayers() {
  const busy = new Set();
  (state.data.challenges || []).forEach((c) => {
    busy.add(c.challenger);
    busy.add(c.challenged);
  });
  return busy;
}

function rowOf(name) {
  const rows = pyramidRows(state.data.players);
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some((p) => p.name === name)) return { index: i, rows };
  }
  return null;
}

// Reegel: samas reas vasakul + rida ülevalpool.
function allowedTargets(name) {
  const loc = rowOf(name);
  if (!loc) return [];
  const me = playerByName(name);
  const sameRowLeft = loc.rows[loc.index].filter((p) => p.pos < me.pos);
  const rowAbove = loc.index > 0 ? loc.rows[loc.index - 1] : [];
  return [...rowAbove, ...sameRowLeft].sort((a, b) => a.pos - b.pos);
}

// Erand: kuni 2 kohta allpool.
function downwardTargets(name) {
  const me = playerByName(name);
  if (!me) return [];
  return state.data.players
    .filter((p) => p.pos > me.pos && p.pos <= me.pos + ERAND_MAX_DIST)
    .sort((a, b) => a.pos - b.pos);
}

function erandUsed(name) {
  const inGames = state.data.games.filter(
    (g) => g.erand && g.challenger === name).length;
  const pending = (state.data.challenges || []).filter(
    (c) => c.erand && c.challenger === name).length;
  return inGames + pending;
}

// Viimane kohtumine/ootel väljakutse sama paari vahel viimase 14 päeva sees.
// Vanade mängude segaseid kuupäevi ("15.06") ei loeta — ainult ISO.
function recentMeeting(a, b) {
  const isISO = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s);
  const pair = (x, y) =>
    (x.challenger === a && x.challenged === b) ||
    (x.challenger === b && x.challenged === a);

  for (const c of state.data.challenges || []) {
    if (pair(c)) return { type: "ootel väljakutse", date: c.challenge_date };
  }
  let latest = null;
  for (const g of state.data.games) {
    if (!pair(g)) continue;
    const d = isISO(g.play_date) ? g.play_date : null;
    if (!d) continue;
    if (!latest || d > latest) latest = d;
  }
  if (latest) {
    const age = -daysUntil(latest); // päevi tagasi
    if (age !== null && age < COOLDOWN_DAYS) {
      return { type: "mäng", date: latest, daysAgo: age };
    }
  }
  return null;
}

// ---------- init ----------

async function init() {
  try {
    state.data = await fetchJSON("data/puramiid.json");
  } catch (e) {
    document.body.innerHTML = `<div style="padding:32px;font-family:sans-serif">
      <h2>Viga andmete laadimisel</h2><pre>${escapeHtml(e.message)}</pre></div>`;
    return;
  }

  $("#meta-updated").textContent = `uuendatud ${fmtDateTime(state.data.updated_at)}`;
  const played = state.data.games.length;
  const pending = (state.data.challenges || []).length;
  $("#meta-counts").textContent =
    `${state.data.players.length} mängijat · ${played} mängu` +
    (pending ? ` · ${pending} ootel väljakutset` : "");

  setupTabs();
  renderPyramid();
  setupGamesControls();
  renderGames();
  renderChallenges();
  renderStats();
  setupAdmin();
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

// ---------- pyramid ----------

function pyramidRows(players) {
  // Triangular layout: row n holds n slots.
  // The LAST position always sits alone on the bottom row (nagu Excelis:
  // 25. koht üksinda püramiidi põhjas).
  const sorted = players.slice().sort((a, b) => a.pos - b.pos);
  if (sorted.length < 2) return sorted.length ? [sorted] : [];
  const last = sorted[sorted.length - 1];
  const rest = sorted.slice(0, -1);
  const rows = [];
  let i = 0;
  let size = 1;
  while (i < rest.length) {
    rows.push(rest.slice(i, i + size));
    i += size;
    size += 1;
  }
  rows.push([last]);
  return rows;
}

function renderPyramid() {
  const wrap = $("#pyramid");
  wrap.innerHTML = "";
  const busy = busyPlayers();
  pyramidRows(state.data.players).forEach((row) => {
    const rowEl = document.createElement("div");
    rowEl.className = "pyr-row";
    row.forEach((p) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "pyr-card";
      if (p.pos === 1) card.classList.add("pyr-first");
      const isBusy = busy.has(p.name);
      if (isBusy) {
        card.classList.add("pyr-busy");
        card.title = "Ootel väljakutse — hetkel ei saa välja kutsuda";
      }
      card.innerHTML = `
        <span class="pyr-pos">${p.pos}.</span>
        <span class="pyr-name">${escapeHtml(p.name)}</span>
        ${p.badge ? `<span class="pyr-badge">${p.badge}</span>` : ""}
        ${isBusy ? '<span class="pyr-busy-badge" aria-label="mängus">🎾</span>' : ""}
      `;
      card.dataset.name = p.name;
      card.addEventListener("click", () => togglePlayerHighlight(p.name));
      rowEl.appendChild(card);
    });
    wrap.appendChild(rowEl);
  });

  // On narrow screens the pyramid is wider than the viewport — start centred.
  // Re-run after fonts load, since card widths (and scrollWidth) change then.
  const scroller = $("#pyramid-wrap");
  if (scroller) {
    const centre = () => {
      scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2;
    };
    requestAnimationFrame(centre);
    if (document.fonts?.ready) document.fonts.ready.then(centre);
    window.addEventListener("load", centre, { once: true });
  }
}

// ---------- pyramid highlight (kes keda saab kutsuda) ----------

function togglePlayerHighlight(name) {
  const info = $("#pyramid-info");
  const cards = $$(".pyr-card");
  const wasSelected = state.selectedPlayer === name;

  cards.forEach((c) => c.classList.remove("pyr-selected", "pyr-target"));

  if (wasSelected) {
    state.selectedPlayer = null;
    info.hidden = true;
    return;
  }

  state.selectedPlayer = name;
  const busy = busyPlayers();
  const all = allowedTargets(name);
  const free = all.filter((t) => !busy.has(t.name));
  const inPlay = all.filter((t) => busy.has(t.name));
  const freeNames = new Set(free.map((t) => t.name));

  cards.forEach((c) => {
    if (c.dataset.name === name) c.classList.add("pyr-selected");
    else if (freeNames.has(c.dataset.name)) c.classList.add("pyr-target");
  });

  info.hidden = false;
  const me = playerByName(name);
  if (busy.has(name)) {
    info.innerHTML =
      `<b>${escapeHtml(name)}</b> on hetkel mängus (ootel väljakutse) — ` +
      `uue väljakutse saab esitada pärast selle mängimist. `;
  } else if (!all.length) {
    info.innerHTML = `<b>${escapeHtml(name)}</b> on püramiidi tipus — teda saab ainult välja kutsuda. `;
  } else {
    const busyNote = inPlay.length
      ? ` <span class="dim">Hetkel mängus (ei saa kutsuda): ${inPlay.map((t) => escapeHtml(t.name)).join(", ")}.</span>`
      : "";
    info.innerHTML =
      `<b>${escapeHtml(name)}</b> (${me.pos}.) saab välja kutsuda: ` +
      (free.length
        ? free.map((t) => `<span class="pyr-target-name">${t.pos}. ${escapeHtml(t.name)}</span>`).join(", ")
        : '<span class="dim">kedagi mitte — kõik lubatud vastased on mängus</span>') +
      `.${busyNote} <span class="dim">Erandiga (2× hooajal) ka kuni 2 kohta allpool.</span> `;
  }
  const link = document.createElement("button");
  link.type = "button";
  link.className = "linklike";
  link.textContent = `Vaata ${name} mänge →`;
  link.addEventListener("click", () => {
    state.gamesSearch = name.toLowerCase();
    $("#games-search").value = name;
    renderGames();
    switchTab("games");
  });
  info.appendChild(link);
}

// ---------- games ----------

function setupGamesControls() {
  $("#games-search").addEventListener("input", (e) => {
    state.gamesSearch = e.target.value.trim().toLowerCase();
    renderGames();
  });
  $("#games-type").addEventListener("change", (e) => {
    state.gamesType = e.target.value;
    renderGames();
  });
}

function renderGames() {
  const tbody = $("#games-table tbody");
  tbody.innerHTML = "";

  let games = state.data.games.slice().reverse(); // newest first
  if (state.gamesSearch) {
    games = games.filter((g) =>
      g.challenger.toLowerCase().includes(state.gamesSearch) ||
      g.challenged.toLowerCase().includes(state.gamesSearch));
  }
  if (state.gamesType) {
    games = games.filter((g) => g.type === state.gamesType);
  }

  games.forEach((g) => {
    const tr = document.createElement("tr");
    if (g.type === "arvestusevaline") tr.classList.add("game-off");
    const dates = [g.challenge_date, g.play_date].filter(Boolean).join(" → ");
    const mvBadge = (g.type === "mv" ? ' <span class="type-badge type-mv">MV</span>' : "") +
      (g.erand ? ' <span class="type-badge type-erand">Erand</span>' : "");
    const chW = g.winner === g.challenger;
    const cdW = g.winner === g.challenged;

    // Seletustekstiga "skoor" -> kompaktne margis, taistekst avaneb klopsuga
    const note = scoreNote(g.score);
    const scoreCell = note
      ? `<button type="button" class="score-note-btn" aria-expanded="false">${note.label} ⓘ</button>`
      : escapeHtml(g.score || "—");

    tr.innerHTML = `
      <td class="num dim">${g.nr}</td>
      <td class="dim">${escapeHtml(dates || "—")}</td>
      <td class="${chW ? "game-winner" : ""}">${escapeHtml(g.challenger)}${mvBadge}</td>
      <td class="num">${scoreCell}</td>
      <td class="${cdW ? "game-winner" : ""}">${escapeHtml(g.challenged)}</td>
      <td class="game-winner">${escapeHtml(g.winner || "—")}</td>
    `;
    tbody.appendChild(tr);

    if (note) {
      const noteRow = document.createElement("tr");
      noteRow.className = "game-note-row";
      noteRow.hidden = true;
      noteRow.innerHTML = `<td colspan="6">${escapeHtml(note.full)}</td>`;
      tbody.appendChild(noteRow);
      const btn = tr.querySelector(".score-note-btn");
      btn.addEventListener("click", () => {
        noteRow.hidden = !noteRow.hidden;
        btn.setAttribute("aria-expanded", String(!noteRow.hidden));
      });
    }
  });
}

// ---------- challenges (upcoming) ----------

function renderChallenges() {
  const list = $("#challenges-list");
  const empty = $("#challenges-empty");
  list.innerHTML = "";
  const items = state.data.challenges || [];
  empty.hidden = items.length > 0;

  items.forEach((c) => {
    const card = document.createElement("div");
    card.className = "challenge-card";

    // Deadline: stored value, or challenge date + 14 days.
    const deadline = c.deadline ||
      (c.challenge_date ? addDays(c.challenge_date, CHALLENGE_DAYS) : null);

    let deadlineHtml = "";
    if (deadline) {
      const left = daysUntil(deadline);
      let cls = "";
      let label = `Mängida hiljemalt ${escapeHtml(fmtDateISO(deadline))}`;
      if (left !== null) {
        if (left < 0) {
          cls = "is-overdue";
          label += ` — tähtaeg möödas ${Math.abs(left)} päeva`;
        } else if (left === 0) {
          cls = "is-soon";
          label += " — täna!";
        } else if (left <= 3) {
          cls = "is-soon";
          label += ` — ${left} päeva jäänud`;
        } else {
          label += ` — ${left} päeva jäänud`;
        }
      }
      deadlineHtml = `<div class="challenge-deadline ${cls}">${label}</div>`;
    }

    // Kokkulepitud mänguaeg ja koht (kui on)
    let agreedHtml = "";
    const venuePart = c.venue ? ` · 📍 ${escapeHtml(c.venue)}` : "";
    if (c.agreed_time) {
      const past = agreedInPast(c.agreed_time);
      agreedHtml = `<div class="challenge-agreed ${past ? "is-past" : ""}">🕐 Mäng: ${escapeHtml(fmtAgreed(c.agreed_time))}${venuePart}${past ? " — kas tulemus on sisestamata?" : ""}</div>`;
    } else if (c.venue) {
      agreedHtml = `<div class="challenge-agreed is-unset">🕐 Aeg kokku leppimata${venuePart}</div>`;
    } else {
      agreedHtml = '<div class="challenge-agreed is-unset">🕐 Mänguaeg kokku leppimata</div>';
    }

    card.innerHTML = `
      <div class="challenge-players">
        <span class="challenge-name">${escapeHtml(c.challenger)}</span>
        <span class="challenge-vs">vs</span>
        <span class="challenge-name">${escapeHtml(c.challenged)}</span>
        ${c.erand ? '<span class="type-badge type-erand">Erand</span>' : ""}
      </div>
      <div class="challenge-meta">
        <span>Esitatud: ${escapeHtml(fmtDateISO(c.challenge_date) || "—")}</span>
      </div>
      ${agreedHtml}
      ${deadlineHtml}
    `;
    list.appendChild(card);
  });
}

// ---------- stats ----------

function computeStats() {
  const counted = state.data.games.filter((g) => g.type !== "arvestusevaline");
  const challenged = {};
  const challengers = {};
  const wins = {};
  const total = {};

  counted.forEach((g) => {
    challenged[g.challenged] = (challenged[g.challenged] || 0) + 1;
    challengers[g.challenger] = (challengers[g.challenger] || 0) + 1;
    if (g.winner) wins[g.winner] = (wins[g.winner] || 0) + 1;
    total[g.challenger] = (total[g.challenger] || 0) + 1;
    total[g.challenged] = (total[g.challenged] || 0) + 1;
  });

  const top = (obj, n = 5) =>
    Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);

  const winRate = Object.keys(total)
    .filter((name) => total[name] >= 5)
    .map((name) => ({
      name,
      played: total[name],
      wins: wins[name] || 0,
      rate: (wins[name] || 0) / total[name],
    }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 5);

  return {
    mostChallenged: top(challenged),
    biggestChallengers: top(challengers),
    mostWins: top(wins),
    winRate,
  };
}

function statCard(title, rows) {
  const card = document.createElement("div");
  card.className = "stat-card";
  card.innerHTML = `<h3>${title}</h3>`;
  const list = document.createElement("ol");
  rows.forEach((r) => {
    const li = document.createElement("li");
    li.innerHTML = r;
    list.appendChild(li);
  });
  card.appendChild(list);
  return card;
}

function renderStats() {
  const grid = $("#stats-grid");
  grid.innerHTML = "";
  const s = computeStats();

  grid.appendChild(statCard("Enim väljakutsutud",
    s.mostChallenged.map(([n, c]) => `${escapeHtml(n)} <b>${c}×</b>`)));
  grid.appendChild(statCard("Suurimad väljakutsujad",
    s.biggestChallengers.map(([n, c]) => `${escapeHtml(n)} <b>${c}×</b>`)));
  grid.appendChild(statCard("Enim võite",
    s.mostWins.map(([n, c]) => `${escapeHtml(n)} <b>${c}</b>`)));
  grid.appendChild(statCard("Parim võiduprotsent (≥5 mängu)",
    s.winRate.map((r) =>
      `${escapeHtml(r.name)} <b>${Math.round(r.rate * 100)}%</b> <span class="dim">(${r.wins}/${r.played})</span>`)));
}

// ---------- admin ----------

function playerOptions(select, includeEmpty) {
  select.innerHTML = includeEmpty ? '<option value="">— vali —</option>' : "";
  state.data.players
    .slice()
    .sort((a, b) => a.pos - b.pos)
    .forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.name;
      opt.textContent = `${p.pos}. ${p.name}`;
      select.appendChild(opt);
    });
}

function setupAdmin() {
  const overlay = $("#admin-overlay");

  $("#admin-btn").addEventListener("click", () => {
    overlay.hidden = false;
    $("#admin-password").value = sessionStorage.getItem("pyr_pw") || "";
  });
  $("#admin-close").addEventListener("click", () => (overlay.hidden = true));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.hidden = true;
  });

  // Admin sub-tabs
  $$(".admin-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.adminTab = btn.dataset.adminTab;
      $$(".admin-tab").forEach((b) => b.classList.toggle("active", b === btn));
      $("#form-challenge").hidden = state.adminTab !== "challenge";
      $("#form-result").hidden = state.adminTab !== "result";
      $("#form-time").hidden = state.adminTab !== "time";
    });
  });

  // Populate selects
  playerOptions($("#ch-challenger"));
  playerOptions($("#res-challenger"));
  playerOptions($("#res-challenged"));

  // Väljakutsutava valik sõltub väljakutsujast ja erandi-linnukesest (reegel A/B).
  const chChallenger = $("#ch-challenger");
  const chChallenged = $("#ch-challenged");
  const chErand = $("#ch-erand");
  const chErandInfo = $("#ch-erand-info");
  const chAllowedInfo = $("#ch-allowed-info");

  const refreshChallengedOptions = () => {
    const name = chChallenger.value;
    const erand = chErand.checked;
    const busy = busyPlayers();

    // Väljakutsuja ise on mängus -> uut väljakutset ei saa esitada.
    if (busy.has(name)) {
      chChallenged.innerHTML = "";
      chErandInfo.hidden = true;
      chAllowedInfo.textContent =
        `${name} on hetkel mängus (ootel väljakutse) — uue saab esitada pärast selle mängimist.`;
      return;
    }

    const allTargets = erand ? downwardTargets(name) : allowedTargets(name);
    const targets = allTargets.filter((p) => !busy.has(p.name));
    const busyCount = allTargets.length - targets.length;

    chChallenged.innerHTML = "";
    targets.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.name;
      opt.textContent = `${p.pos}. ${p.name}`;
      chChallenged.appendChild(opt);
    });

    const busyNote = busyCount ? ` (${busyCount} vastast on hetkel mängus)` : "";
    if (erand) {
      const used = erandUsed(name);
      chErandInfo.hidden = false;
      chErandInfo.textContent = `Erandeid kasutatud: ${used}/${ERAND_MAX}. ` +
        (used >= ERAND_MAX ? "Limiit täis — uut erandit ei saa esitada!" :
         "Võit = 2 boonuspunkti, kohad ei muutu. Kaotus = kohavahetus.");
      chAllowedInfo.textContent = (targets.length
        ? "Erand: kuni 2 kohta allpool olevad mängijad."
        : "Vabu vastaseid pole (kuni 2 kohta allpool).") + busyNote;
    } else {
      chErandInfo.hidden = true;
      chAllowedInfo.textContent = (targets.length
        ? "Lubatud: samas reas vasakul + rida ülevalpool."
        : "Vabu vastaseid hetkel pole.") + busyNote;
    }
  };
  chChallenger.addEventListener("change", refreshChallengedOptions);
  chErand.addEventListener("change", refreshChallengedOptions);
  refreshChallengedOptions();

  // Erand-mängu puhul kohavahetuse linnuke ei kehti (loogika on teine).
  const resErand = $("#res-erand");
  const resSwapLabel = $("#res-swap-label");
  resErand.addEventListener("change", () => {
    resSwapLabel.hidden = resErand.checked;
  });

  // Pending-challenge picker fills the result form
  const resChallenge = $("#res-challenge");
  (state.data.challenges || []).forEach((c, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `${c.challenger} vs ${c.challenged}`;
    resChallenge.appendChild(opt);
  });

  // Mänguaja vorm: ootel väljakutsete valik + olemasoleva aja/koha eeltäide
  const timeChallenge = $("#time-challenge");
  const timeAgreed = $("#time-agreed");
  const timeVenue = $("#time-venue");
  refreshVenueDatalist();
  timeChallenge.innerHTML = "";
  (state.data.challenges || []).forEach((c, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `${c.challenger} vs ${c.challenged}` +
      (c.agreed_time ? ` (${fmtAgreed(c.agreed_time)})` : "");
    timeChallenge.appendChild(opt);
  });
  const prefillAgreed = () => {
    const c = state.data.challenges?.[Number(timeChallenge.value)];
    timeAgreed.value = c?.agreed_time || "";
    timeVenue.value = c?.venue || "";
  };
  timeChallenge.addEventListener("change", prefillAgreed);
  if (timeChallenge.options.length) prefillAgreed();

  $("#form-time").addEventListener("submit", (e) => {
    e.preventDefault();
    if (timeChallenge.value === "") {
      alert("Ootel väljakutseid pole.");
      return;
    }
    submitAdmin("set_agreed_time", {
      challenge_index: Number(timeChallenge.value),
      agreed_time: timeAgreed.value,
      venue: timeVenue.value.trim() || null,
    });
  });
  resChallenge.addEventListener("change", () => {
    const i = resChallenge.value;
    if (i === "") return;
    const c = state.data.challenges[Number(i)];
    $("#res-challenger").value = c.challenger;
    $("#res-challenged").value = c.challenged;
    // Ootel väljakutse erandi-staatus kandub tulemuse vormi üle.
    resErand.checked = !!c.erand;
    resSwapLabel.hidden = resErand.checked;
    updateWinnerOptions();
  });

  // Winner dropdown mirrors the two selected players
  const updateWinnerOptions = () => {
    const w = $("#res-winner");
    const a = $("#res-challenger").value;
    const b = $("#res-challenged").value;
    w.innerHTML = '<option value="">— vali —</option>';
    [a, b].filter(Boolean).forEach((n) => {
      const opt = document.createElement("option");
      opt.value = n;
      opt.textContent = n;
      w.appendChild(opt);
    });
  };
  $("#res-challenger").addEventListener("change", updateWinnerOptions);
  $("#res-challenged").addEventListener("change", updateWinnerOptions);
  updateWinnerOptions();

  // Deadline auto-fills to challenge date + 14 days; manual edits stick.
  const chDate = $("#ch-date");
  const chDeadline = $("#ch-deadline");
  let deadlineAutoFilled = true;
  chDate.addEventListener("change", () => {
    if (chDate.value && (deadlineAutoFilled || !chDeadline.value)) {
      chDeadline.value = addDays(chDate.value, CHALLENGE_DAYS) || "";
      deadlineAutoFilled = true;
    }
  });
  chDeadline.addEventListener("input", () => {
    deadlineAutoFilled = false;
  });

  $("#form-challenge").addEventListener("submit", (e) => {
    e.preventDefault();
    const challenger = chChallenger.value;
    const challenged = chChallenged.value;
    const erand = chErand.checked;
    const date = chDate.value;

    if (erand && erandUsed(challenger) >= ERAND_MAX) {
      alert(`${challenger} on juba kasutanud ${ERAND_MAX} erandit sel hooajal.`);
      return;
    }

    // Cooldown-kontroll (reegel C): sama paar viimase 14 päeva sees.
    let override = false;
    const recent = recentMeeting(challenger, challenged);
    if (recent) {
      const msg = recent.type === "ootel väljakutse"
        ? `${challenger} ja ${challenged} vahel on juba ootel väljakutse.`
        : `${challenger} ja ${challenged} mängisid ${recent.daysAgo} päeva tagasi — ` +
          `reegli järgi saab sama vastast uuesti kutsuda 2 nädala pärast.`;
      if (!confirm(msg + "\n\nKas lisan väljakutse siiski (erandkorras)?")) return;
      override = true;
    }

    submitAdmin("add_challenge", {
      challenger,
      challenged,
      challenge_date: date,
      deadline: chDeadline.value || (date ? addDays(date, CHALLENGE_DAYS) : null),
      agreed_time: $("#ch-agreed").value || null,
      venue: $("#ch-venue").value.trim() || null,
      erand,
      override,
    });
  });

  $("#form-result").addEventListener("submit", (e) => {
    e.preventDefault();
    submitAdmin("add_result", {
      challenge_index: $("#res-challenge").value === "" ? null : Number($("#res-challenge").value),
      challenger: $("#res-challenger").value,
      challenged: $("#res-challenged").value,
      score: $("#res-score").value.trim(),
      winner: $("#res-winner").value,
      play_date: $("#res-date").value || null,
      type: $("#res-type").value,
      swap: $("#res-swap").checked,
      erand: resErand.checked,
    });
  });
}

async function submitAdmin(action, payload) {
  const status = $("#admin-status");
  const password = $("#admin-password").value;
  if (!password) {
    status.hidden = false;
    status.textContent = "Sisesta parool.";
    status.className = "admin-status is-error";
    return;
  }
  if (payload.challenger && payload.challenger === payload.challenged) {
    status.hidden = false;
    status.textContent = "Väljakutsuja ja väljakutsutav ei saa olla sama mängija.";
    status.className = "admin-status is-error";
    return;
  }

  status.hidden = false;
  status.textContent = "Salvestan…";
  status.className = "admin-status";

  try {
    const res = await fetch("/api/puramiid-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, action, payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      sessionStorage.setItem("pyr_pw", password);
      status.textContent = "Salvestatud! Leht uueneb umbes minuti pärast automaatselt.";
      status.className = "admin-status is-ok";
      setTimeout(() => window.location.reload(), 75 * 1000);
    } else {
      status.textContent = data.error || `Viga (${res.status})`;
      status.className = "admin-status is-error";
    }
  } catch (err) {
    status.textContent = "Võrgu viga — proovi uuesti.";
    status.className = "admin-status is-error";
  }
}

document.addEventListener("DOMContentLoaded", init);
