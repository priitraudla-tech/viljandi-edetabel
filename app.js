// Viljandi üksikmängu edetabel — interaktiivne tabel + ajalugu + trend.

// First-place highlight — applied wherever a ranked list is shown.
function isFirstPlace(player) {
  return player?.rank === 1;
}

const state = {
  current: null,
  history: {},        // date -> snapshot
  historyDates: [],
  sort: { key: "rank", dir: "asc" },
  search: "",
  hideZero: false,
  trendChart: null,
  bracket: null,            // current loaded bracket data (or null)
  bracketView: "punktid",   // "punktid" | "tabel"
};

// ---------- utils ----------

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function fmtDateTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("et-EE", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("et-EE", { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    return iso;
  }
}

function shortStageLabel(label) {
  // "1. etapp 24.01.2026" -> "1. etapp"
  // "Viljandi maakonna MV 08.2025" -> "Maakonna MV"
  // "Masters 27.12.2025" -> "Masters"
  const m1 = label.match(/^(\d+)\.\s*etapp/);
  if (m1) return `${m1[1]}. etapp`;
  if (/maakonna/i.test(label)) return "Maakonna MV";
  if (/masters/i.test(label)) return "Masters";
  return label;
}

async function fetchJSON(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

// ---------- load ----------

async function init() {
  try {
    state.current = await fetchJSON("data/current.json");
    state.historyDates = await fetchJSON("data/history.json").catch(() => []);
  } catch (e) {
    document.body.innerHTML = `<div style="padding:32px;font-family:sans-serif">
      <h2>Viga andmete laadimisel</h2>
      <pre>${e.message}</pre>
      <p>Veendu, et <code>data/current.json</code> on olemas. Käivita esmalt <code>python scripts/fetch.py</code>.</p>
    </div>`;
    return;
  }

  const title = state.current.title || "Viljandi üksikmängu edetabel";
  // Strip "(X seisuga)" suffix from title — display it separately as meta
  $("#title").textContent = title.replace(/\s*\([^)]*\)\s*$/, "");
  $("#meta-asof").textContent = title.match(/\(([^)]+)\)/)?.[1] || "";
  $("#meta-fetched").textContent = `viimati kontrollitud ${fmtDateTime(state.current.fetched_at)}`;
  const compared = state.current.compared_to;
  $("#meta-compared").textContent = compared
    ? `võrdluses ${fmtDate(compared)} seisuga`
    : "võrdlust pole — ootame järgmist snapshot'i";

  setupTabs();
  setupRefresh();
  setupTournamentToggle();
  renderStandings();
  renderTournament();
  setupTrend();
  setupHistory();
}

// ---------- manual refresh ----------

function setupRefresh() {
  const btn = $("#refresh-btn");
  if (!btn) return;
  btn.addEventListener("click", () => triggerRefresh(btn));
}

async function triggerRefresh(btn) {
  const label = btn.querySelector(".refresh-label");
  const setState = (state, text) => {
    btn.dataset.state = state;
    btn.disabled = state === "loading";
    if (text) label.textContent = text;
  };
  const reset = () => {
    btn.dataset.state = "";
    btn.disabled = false;
    label.textContent = "Uuenda andmeid";
  };

  setState("loading", "Käivitan…");

  try {
    const res = await fetch("/.netlify/functions/refresh", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      setState("ok", "Käivitatud — sait uueneb 1–2 min");
      // Reload after Actions + Netlify deploy is likely done.
      setTimeout(() => window.location.reload(), 90 * 1000);
      // After 8 min, give up auto-reload and reset button.
      setTimeout(reset, 8 * 60 * 1000);
    } else {
      console.error("Refresh failed:", data);
      setState("error", data.error || `Viga (${res.status})`);
      setTimeout(reset, 6000);
    }
  } catch (e) {
    console.error("Refresh network error:", e);
    setState("error", "Võrgu viga");
    setTimeout(reset, 6000);
  }
}

// ---------- tabs ----------

function setupTabs() {
  $$(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      $$(".tab").forEach((b) => b.classList.toggle("active", b === btn));
      $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${tab}`));
    });
  });
}

// ---------- standings ----------

function setupStandingsControls() {
  $("#search").addEventListener("input", (e) => {
    state.search = e.target.value.trim().toLowerCase();
    renderStandingsBody();
  });
  $("#hide-zero").addEventListener("change", (e) => {
    state.hideZero = e.target.checked;
    renderStandingsBody();
  });
}

function buildColumns(data) {
  // Compact default — fits mobile without horizontal scroll.
  // Stages shown in expandable detail row instead.
  return [
    { key: "rank", label: "Koht", num: true, get: (p) => p.rank },
    {
      key: "rank_delta",
      label: "Δ",
      title: data.compared_to
        ? `Muutus võrreldes ${fmtDate(data.compared_to)} seisuga`
        : "Muutust ei kuvata — varasemat snapshot'i pole",
      delta: true,
      get: (p) => p.rank_delta,
    },
    { key: "name", label: "Nimi", get: (p) => p.name, name: true },
    { key: "total", label: "Punkte", num: true, get: (p) => p.total },
    {
      key: "average",
      label: "Keskmine",
      num: true,
      hideOnMobile: true,
      get: (p) => p.average,
      fmt: (v) => v.toFixed(1),
    },
  ];
}

function renderDeltaCell(td, player, hasComparison) {
  if (!hasComparison) {
    td.classList.add("dim");
    td.textContent = "—";
    return;
  }
  const delta = player.rank_delta;
  const wrap = document.createElement("span");
  wrap.classList.add("delta");
  if (delta === null || delta === undefined) {
    wrap.classList.add("new");
    wrap.textContent = "uus";
  } else if (delta > 0) {
    wrap.classList.add("up");
    wrap.innerHTML = `<span class="glyph">▲</span>${delta}`;
  } else if (delta < 0) {
    wrap.classList.add("down");
    wrap.innerHTML = `<span class="glyph">▼</span>${Math.abs(delta)}`;
  } else {
    wrap.classList.add("flat");
    wrap.textContent = "—";
  }
  td.appendChild(wrap);
}

function renderStandings() {
  const data = state.current;
  const cols = buildColumns(data);
  state.cols = cols;
  state.expandedRow = null;

  const thead = $("#standings-table thead");
  thead.innerHTML = "";
  const tr = document.createElement("tr");
  cols.forEach((c) => {
    const th = document.createElement("th");
    th.textContent = c.label;
    if (c.num) th.classList.add("num");
    if (c.hideOnMobile) th.classList.add("hide-mobile");
    if (c.title) th.title = c.title;
    th.addEventListener("click", () => onSort(c.key));
    const arrow = document.createElement("span");
    arrow.className = "arrow";
    th.appendChild(arrow);
    tr.appendChild(th);
  });
  // chevron column for expand indicator
  const thChev = document.createElement("th");
  thChev.className = "chev-col";
  thChev.setAttribute("aria-label", "Ava detail");
  tr.appendChild(thChev);
  thead.appendChild(tr);

  setupStandingsControls();
  renderStandingsBody();
}

function onSort(key) {
  if (state.sort.key === key) {
    state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
  } else {
    state.sort.key = key;
    // numbers default desc, name default asc
    state.sort.dir = key === "name" || key === "rank" ? "asc" : "desc";
  }
  renderStandingsBody();
}

function getValue(player, key) {
  if (key.startsWith("stage:")) return player.stages?.[key.slice(6)];
  return player[key];
}

function compare(a, b, key) {
  const va = getValue(a, key);
  const vb = getValue(b, key);
  const aNull = va === null || va === undefined;
  const bNull = vb === null || vb === undefined;
  if (aNull && bNull) return 0;
  if (aNull) return 1;   // nulls always bottom
  if (bNull) return -1;
  if (typeof va === "number" && typeof vb === "number") return va - vb;
  return String(va).localeCompare(String(vb), "et");
}

function renderStandingsBody() {
  const tbody = $("#standings-table tbody");
  const cols = state.cols;
  const dir = state.sort.dir === "asc" ? 1 : -1;

  // update arrows (skip the trailing chevron-only column)
  $$("#standings-table thead th").forEach((th, i) => {
    const c = cols[i];
    if (!c) return; // chev-col has no cols[] entry
    const arrow = th.querySelector(".arrow");
    if (c.key === state.sort.key) {
      th.classList.add("sorted");
      if (arrow) arrow.textContent = state.sort.dir === "asc" ? "▲" : "▼";
    } else {
      th.classList.remove("sorted");
      if (arrow) arrow.textContent = "";
    }
  });

  let players = state.current.players.slice();
  if (state.search) {
    players = players.filter((p) => p.name.toLowerCase().includes(state.search));
  }
  if (state.hideZero) {
    players = players.filter((p) => (p.total || 0) > 0);
  }
  players.sort((a, b) => dir * compare(a, b, state.sort.key));

  const hasComparison = !!state.current.compared_to;

  tbody.innerHTML = "";
  players.forEach((p) => {
    const tr = document.createElement("tr");
    tr.classList.add("player-row");
    tr.dataset.name = p.name;
    if (isFirstPlace(p)) tr.classList.add("highlight");
    if (state.expandedRow === p.name) tr.classList.add("expanded");

    cols.forEach((c) => {
      const td = document.createElement("td");
      const v = c.get(p);
      if (c.name) {
        td.classList.add("player-name");
        const btn = document.createElement("button");
        btn.textContent = v;
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          openTrendFor(p.name);
        });
        td.appendChild(btn);
      } else if (c.delta) {
        renderDeltaCell(td, p, hasComparison);
      } else if (v === null || v === undefined || v === "") {
        td.classList.add("dim");
        td.textContent = "—";
      } else {
        td.textContent = c.fmt ? c.fmt(v) : v;
      }
      if (c.num) td.classList.add("num");
      if (c.hideOnMobile) td.classList.add("hide-mobile");
      tr.appendChild(td);
    });

    // chevron cell
    const tdChev = document.createElement("td");
    tdChev.className = "chev-col";
    tdChev.innerHTML = '<span class="chev" aria-hidden="true">›</span>';
    tr.appendChild(tdChev);

    tr.addEventListener("click", () => toggleExpand(p.name));
    tbody.appendChild(tr);

    if (state.expandedRow === p.name) {
      tbody.appendChild(buildDetailRow(p, cols.length + 1));
    }
  });
}

function toggleExpand(name) {
  state.expandedRow = state.expandedRow === name ? null : name;
  renderStandingsBody();
}

function buildDetailRow(player, colspan) {
  const tr = document.createElement("tr");
  tr.className = "detail-row";
  const td = document.createElement("td");
  td.colSpan = colspan;
  td.appendChild(buildDetail(player));
  tr.appendChild(td);
  return tr;
}

function buildDetail(player) {
  const wrap = document.createElement("div");
  wrap.className = "detail";

  // Stage tiles grid
  const grid = document.createElement("div");
  grid.className = "stage-grid";
  state.current.stages.forEach((s) => {
    const tile = document.createElement("div");
    tile.className = "stage-tile";
    const value = player.stages?.[s.label];
    if (value === null || value === undefined || value === "") {
      tile.classList.add("empty");
    }

    const label = document.createElement("div");
    label.className = "stage-label";
    label.textContent = shortStageLabel(s.label);
    tile.appendChild(label);

    const date = document.createElement("div");
    date.className = "stage-date";
    date.textContent = s.date ? fmtDate(s.date) : "—";
    tile.appendChild(date);

    const val = document.createElement("div");
    val.className = "stage-value";
    val.textContent = (value === null || value === undefined || value === "") ? "—" : value;
    tile.appendChild(val);

    if (s.first_seen) {
      const meta = document.createElement("div");
      meta.className = "stage-meta";
      meta.textContent = `salvestatud ${fmtDateTime(s.first_seen)}`;
      tile.appendChild(meta);
    }

    grid.appendChild(tile);
  });
  wrap.appendChild(grid);

  // Summary stats
  const summary = document.createElement("div");
  summary.className = "detail-summary";
  summary.innerHTML = `
    <span><span class="muted">Mängitud turniire:</span> <b>${player.tournaments_played ?? 0}</b></span>
    <span><span class="muted">Keskmine punktisumma:</span> <b>${(player.average ?? 0).toFixed(1)}</b></span>
    <span><span class="muted">Punkte kokku:</span> <b>${player.total ?? 0}</b></span>
  `;
  wrap.appendChild(summary);

  return wrap;
}

// ---------- tournament (latest stage podium + list) ----------

function findLatestStageWithResults() {
  // Stages are pre-sorted chronologically (asc) in current.json.
  // Iterate from newest backward, return the first stage where any player
  // has a non-null score.
  const stages = state.current.stages.slice().reverse();
  for (const s of stages) {
    const hasResults = state.current.players.some((p) => {
      const v = p.stages?.[s.label];
      return v !== null && v !== undefined && v !== "";
    });
    if (hasResults) return s;
  }
  return null;
}

function buildTournamentResults(stageLabel) {
  // Collect participants (non-null), sort desc, assign ranks with ties.
  const participants = [];
  state.current.players.forEach((p) => {
    const points = p.stages?.[stageLabel];
    if (points !== null && points !== undefined && points !== "") {
      participants.push({ name: p.name, points });
    }
  });
  participants.sort((a, b) => b.points - a.points);

  let prevPoints = null;
  let prevRank = 0;
  participants.forEach((entry, idx) => {
    const position = idx + 1;
    if (entry.points !== prevPoints) prevRank = position;
    prevPoints = entry.points;
    entry.rank = prevRank;
  });
  return participants;
}

async function renderTournament() {
  const stage = findLatestStageWithResults();
  const titleEl = $("#tournament-title");
  const metaEl = $("#tournament-meta");
  const podium = $("#podium");
  const restWrap = $("#tournament-rest");
  const empty = $("#tournament-empty");
  const tbody = $("#tournament-table tbody");

  podium.innerHTML = "";
  tbody.innerHTML = "";
  restWrap.hidden = true;
  empty.hidden = true;

  // Reset bracket view; reload below if a JSON exists for this stage's date.
  state.bracket = null;
  $("#tournament-view-toggle").hidden = true;
  $("#tournament-view-tabel").innerHTML = "";
  setTournamentView("punktid");

  if (!stage) {
    titleEl.textContent = "Turniir";
    metaEl.textContent = "";
    empty.hidden = false;
    return;
  }

  titleEl.textContent = stage.label;

  // Participant count from per-stage tally (more accurate than counting non-null).
  const participantsCount =
    state.current.participants_per_stage?.[stage.label] ??
    buildTournamentResults(stage.label).length;

  const metaParts = [];
  if (stage.date) metaParts.push(fmtDate(stage.date));
  metaParts.push(`${participantsCount} osalejat`);
  metaEl.textContent = metaParts.join(" · ");

  const results = buildTournamentResults(stage.label);
  if (!results.length) {
    empty.hidden = false;
    return;
  }

  // Podium: take first 3 results (rank 1, 2, 3 — but with ties multiple may share)
  const topThree = results.filter((r) => r.rank <= 3);
  // Render with display order [silver, gold, bronze] (2-1-3 visual layout)
  const byRank = { 1: [], 2: [], 3: [] };
  topThree.forEach((r) => {
    if (byRank[r.rank]) byRank[r.rank].push(r);
  });

  const podiumOrder = [
    { rank: 2, slot: "silver" },
    { rank: 1, slot: "gold" },
    { rank: 3, slot: "bronze" },
  ];
  podiumOrder.forEach(({ rank, slot }) => {
    const entries = byRank[rank];
    const card = document.createElement("div");
    card.className = `podium-card ${slot}`;
    if (!entries || !entries.length) {
      card.classList.add("empty");
      card.innerHTML = `<div class="podium-rank">${rank}.</div><div class="podium-empty">—</div>`;
      podium.appendChild(card);
      return;
    }
    const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉";
    const namesHtml = entries
      .map((e) => `<div class="podium-name">${escapeHtml(e.name)}</div>`)
      .join("");
    const pts = entries[0].points;
    card.innerHTML = `
      <div class="podium-medal" aria-hidden="true">${medal}</div>
      <div class="podium-rank">${rank}.</div>
      ${namesHtml}
      <div class="podium-points"><span class="num">${pts}</span><span class="podium-pts-label">punkti</span></div>
    `;
    podium.appendChild(card);
  });

  // Rest list (rank > 3)
  const rest = results.filter((r) => r.rank > 3);
  if (rest.length) {
    restWrap.hidden = false;
    rest.forEach((r) => {
      const tr = document.createElement("tr");
      if (r.rank === 1) tr.classList.add("highlight");
      tr.innerHTML = `
        <td class="num">${r.rank}</td>
        <td class="player-name"><button type="button">${escapeHtml(r.name)}</button></td>
        <td class="num">${r.points}</td>
      `;
      tr.querySelector("button").addEventListener("click", () => openTrendFor(r.name));
      tbody.appendChild(tr);
    });
  }

  // Try loading the bracket JSON for this stage's date. Surfaces the toggle
  // only if a JSON exists; otherwise the tab stays at "Punktid" alone.
  const bracket = await loadBracketIfExists(stage.date);
  if (bracket) {
    state.bracket = bracket;
    $("#tournament-view-tabel").innerHTML = "";
    $("#tournament-view-tabel").appendChild(buildBracketView(bracket));
    $("#tournament-view-toggle").hidden = false;
  }
}

// ---------- bracket (per-tournament view) ----------

async function loadBracketIfExists(date) {
  if (!date) return null;
  try {
    const res = await fetch(`data/turniirid/${date}.json`, { cache: "no-cache" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function setupTournamentToggle() {
  $$("#tournament-view-toggle .view-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => setTournamentView(btn.dataset.view));
  });
}

function setTournamentView(view) {
  state.bracketView = view;
  $$("#tournament-view-toggle .view-toggle-btn").forEach((b) => {
    const active = b.dataset.view === view;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", active ? "true" : "false");
  });
  const punktid = $("#tournament-view-punktid");
  const tabel = $("#tournament-view-tabel");
  if (punktid) punktid.hidden = view !== "punktid";
  if (tabel) tabel.hidden = view !== "tabel";
}

function parseScore(skoor) {
  if (skoor == null) return { winner: "", loser: "" };
  if (skoor === "w/o") return { winner: "w/o", loser: "—" };
  if (skoor === "ret.") return { winner: "ret.", loser: "—" };
  if (skoor === "?") return { winner: "?", loser: "?" };
  if (skoor === "—") return { winner: "—", loser: "—" };
  const m = String(skoor).match(/^(\d+)\s*[-:]\s*(\d+)$/);
  if (m) return { winner: m[1], loser: m[2] };
  return { winner: String(skoor), loser: "" };
}

function formatKoht(koht) {
  if (typeof koht === "number") return `${koht}.`;
  if (typeof koht === "string") {
    const m = koht.match(/^(\d+)\s*[-–]\s*(\d+)$/);
    if (m) return `${m[1]}.–${m[2]}.`;
    return koht;
  }
  return String(koht);
}

function buildSeedMap(mangijad) {
  const map = {};
  (mangijad || []).forEach((m) => {
    if (m.asetus !== null && m.asetus !== undefined) map[m.nimi] = m.asetus;
  });
  return map;
}

function bracketPlayerRow({ name, score, seed, role, medal }) {
  // role: "winner" | "loser" | "neutral" | "bye"
  const row = document.createElement("div");
  row.className = "br-player";
  if (role === "winner") row.classList.add("is-winner");
  else if (role === "loser") row.classList.add("is-loser");
  else if (role === "bye") row.classList.add("is-bye");

  const left = document.createElement("span");
  left.className = "br-name";
  if (seed) {
    const s = document.createElement("span");
    s.className = "br-seed";
    s.textContent = `[${seed}]`;
    left.appendChild(s);
  }
  if (medal) {
    const md = document.createElement("span");
    md.className = "br-medal";
    md.textContent = medal;
    left.appendChild(md);
  }
  left.appendChild(document.createTextNode(name || ""));

  const sc = document.createElement("span");
  sc.className = "br-score";
  sc.textContent = score == null || score === "" ? "" : score;

  row.appendChild(left);
  row.appendChild(sc);
  return row;
}

function bracketMatch(match, opts = {}) {
  // opts: { seedMap, final, faded, winnerMedal, loserMedal }
  const m = document.createElement("div");
  m.className = "br-match";
  if (opts.final) m.classList.add("is-final");
  if (opts.faded) m.classList.add("is-faded");

  const score = parseScore(match.skoor);
  const seedMap = opts.seedMap || {};
  const winnerName = match.voitja || "";
  const loserName = match.kaotaja || "";
  const winnerIsBye = winnerName === "Bye" || winnerName === "bye";
  const loserIsBye = loserName === "Bye" || loserName === "bye";

  const role = (isWinner) => {
    if (opts.faded) return "neutral";
    if (isWinner) return winnerIsBye ? "neutral" : "winner";
    return loserIsBye ? "bye" : "loser";
  };

  m.appendChild(bracketPlayerRow({
    name: winnerName,
    score: opts.faded ? "—" : score.winner,
    seed: seedMap[winnerName],
    role: winnerIsBye ? "bye" : role(true),
    medal: opts.winnerMedal,
  }));
  m.appendChild(bracketPlayerRow({
    name: loserName,
    score: opts.faded ? "—" : score.loser,
    seed: seedMap[loserName],
    role: role(false),
    medal: opts.loserMedal,
  }));
  return m;
}

function bracketRound(title, matches, opts = {}) {
  const round = document.createElement("div");
  round.className = "br-round";

  const t = document.createElement("div");
  t.className = "br-round-title";
  t.textContent = title;
  round.appendChild(t);

  const list = document.createElement("div");
  list.className = "br-matches";
  (matches || []).filter(Boolean).forEach((mm) => {
    const matchOpts = {
      seedMap: opts.seedMap,
      final: opts.final,
      faded: opts.faded,
      winnerMedal: opts.winnerMedal,
    };
    list.appendChild(bracketMatch(mm, matchOpts));
  });
  round.appendChild(list);
  return round;
}

function bracketSectionTitle(text, level = 3) {
  const el = document.createElement(level === 4 ? "h4" : "h3");
  el.className = level === 4 ? "br-subtitle" : "br-title";
  el.textContent = text;
  return el;
}

function buildMainBracket(data) {
  const wrap = document.createElement("div");
  wrap.className = "br-wrap";
  const bracket = document.createElement("div");
  bracket.className = "br-bracket br-bracket--main";

  const seedMap = buildSeedMap(data.mangijad);
  const pt = data.pohitabel || {};

  bracket.appendChild(bracketRound("1. ring", pt.round_1 || [], { seedMap }));
  bracket.appendChild(bracketRound("Veerandfinaal", pt.veerandfinaalid || []));
  bracket.appendChild(bracketRound("Poolfinaal", pt.poolfinaalid || []));
  if (pt.finaal) {
    bracket.appendChild(bracketRound("Finaal", [pt.finaal], {
      final: true,
      winnerMedal: "🏆",
    }));
  }

  wrap.appendChild(bracket);
  return wrap;
}

function buildPlayoff58(data) {
  const wrap = document.createElement("div");
  wrap.className = "br-wrap";
  const bracket = document.createElement("div");
  bracket.className = "br-bracket br-bracket--mini";

  bracket.appendChild(bracketRound("Poolfinaal", data.poolfinaalid || []));

  const fivesix = data.koht_5_6;
  const seveneight = data.koht_7_8;
  const round = document.createElement("div");
  round.className = "br-round";
  const t = document.createElement("div");
  t.className = "br-round-title";
  t.textContent = "5.–6. / 7.–8.";
  round.appendChild(t);
  const list = document.createElement("div");
  list.className = "br-matches";

  const renderPos = (pos, fallbackVoitja, fallbackKaotaja) => {
    if (pos && pos.staatus !== "ei mängitud" && pos.voitja) {
      list.appendChild(bracketMatch(pos));
    } else if (fallbackVoitja && fallbackKaotaja) {
      list.appendChild(bracketMatch(
        { voitja: fallbackVoitja, kaotaja: fallbackKaotaja, skoor: "—" },
        { faded: true },
      ));
    }
  };

  // Faded fallbacks: SF winners meet for 5-6, SF losers for 7-8.
  const sf1 = data.poolfinaalid?.[0];
  const sf2 = data.poolfinaalid?.[1];
  renderPos(fivesix, sf1?.voitja, sf2?.voitja);
  renderPos(seveneight, sf1?.kaotaja, sf2?.kaotaja);

  round.appendChild(list);
  bracket.appendChild(round);
  wrap.appendChild(bracket);
  return wrap;
}

function buildRoundRobin(group) {
  const col = document.createElement("div");
  col.className = "br-col";
  col.appendChild(bracketSectionTitle("Grupp A · ringsüsteem", 4));

  const wrap = document.createElement("div");
  wrap.className = "table-wrap rr-wrap";

  const table = document.createElement("table");
  table.className = "rr-table";
  const players = (group.tabel || []).map((r) => r.mangija);

  const thead = document.createElement("thead");
  const trh = document.createElement("tr");
  trh.innerHTML = `
    <th class="num rr-pos">#</th>
    <th>Mängija</th>
    ${players.map((_, i) => `<th class="num">${i + 1}</th>`).join("")}
    <th class="num">V–K</th>
  `;
  thead.appendChild(trh);
  table.appendChild(thead);

  // Build lookup of head-to-head results.
  const lookup = {};
  (group.mangud || []).forEach((m) => {
    const sc = parseScore(m.skoor);
    lookup[`${m.voitja}|${m.kaotaja}`] = `${sc.winner}/${sc.loser}`;
    lookup[`${m.kaotaja}|${m.voitja}`] = `${sc.loser}/${sc.winner}`;
  });

  const tbody = document.createElement("tbody");
  (group.tabel || []).forEach((row) => {
    const tr = document.createElement("tr");
    if (row.koht === 1) tr.classList.add("rr-first");
    let html = `
      <td class="num rr-pos">${row.koht}</td>
      <td class="rr-name">${escapeHtml(row.mangija)}</td>
    `;
    players.forEach((opp) => {
      if (opp === row.mangija) {
        html += `<td class="num rr-diag">—</td>`;
      } else {
        const v = lookup[`${row.mangija}|${opp}`];
        html += `<td class="num">${v || "—"}</td>`;
      }
    });
    html += `<td class="num"><strong>${row.voidud ?? 0}–${row.kaotused ?? 0}</strong></td>`;
    tr.innerHTML = html;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  wrap.appendChild(table);
  col.appendChild(wrap);
  return col;
}

function buildGroupB(group) {
  const col = document.createElement("div");
  col.className = "br-col";
  col.appendChild(bracketSectionTitle("Grupp B · play-off", 4));

  const wrap = document.createElement("div");
  wrap.className = "br-wrap";
  const bracket = document.createElement("div");
  bracket.className = "br-bracket br-bracket--mini";

  bracket.appendChild(bracketRound("Poolfinaal", group.poolfinaalid || []));

  const finals = [];
  if (group.finaal) finals.push(group.finaal);
  if (group.koht_3_4) finals.push(group.koht_3_4);
  if (finals.length) {
    bracket.appendChild(bracketRound("Finaal · 3.–4.", finals));
  }

  wrap.appendChild(bracket);
  col.appendChild(wrap);
  return col;
}

function buildFinalStandings(loppjarjestus) {
  const grid = document.createElement("div");
  grid.className = "br-standings";

  loppjarjestus.forEach((entry) => {
    const row = document.createElement("div");
    row.className = "br-standing-row";
    if (typeof entry.koht === "number" && entry.koht <= 3) {
      row.classList.add("is-podium");
    }

    const pos = document.createElement("span");
    pos.className = "br-standing-pos";
    pos.textContent = formatKoht(entry.koht);

    const name = document.createElement("span");
    name.className = "br-standing-name";
    name.textContent = entry.mangija;

    const pts = document.createElement("span");
    pts.className = "br-standing-pts";
    if (entry.punktid !== null && entry.punktid !== undefined) {
      pts.textContent = `${entry.punktid} p`;
    }

    row.appendChild(pos);
    row.appendChild(name);
    row.appendChild(pts);
    grid.appendChild(row);
  });
  return grid;
}

function buildBracketView(data) {
  const wrap = document.createElement("div");
  wrap.className = "br-root";

  // Põhitabel
  if (data.pohitabel) {
    wrap.appendChild(bracketSectionTitle("Põhitabel"));
    wrap.appendChild(buildMainBracket(data));

    if (data.pohitabel.koht_3_4) {
      wrap.appendChild(bracketSectionTitle("3.–4. koha mäng", 4));
      const single = bracketMatch(data.pohitabel.koht_3_4, { winnerMedal: "🥉" });
      single.classList.add("br-match--single");
      wrap.appendChild(single);
    }
  }

  // Kohamäng 5–8
  if (data.kohamang_5_8) {
    wrap.appendChild(bracketSectionTitle("Kohamäng 5.–8."));
    wrap.appendChild(buildPlayoff58(data.kohamang_5_8));
    const k56 = data.kohamang_5_8.koht_5_6;
    const k78 = data.kohamang_5_8.koht_7_8;
    const notPlayed = [k56, k78].filter((p) => p && p.staatus === "ei mängitud");
    if (notPlayed.length) {
      const note = document.createElement("p");
      note.className = "br-legend";
      note.textContent = "5.–6. ja 7.–8. koha mängud jäid mängimata — kohad jagatud.";
      wrap.appendChild(note);
    }
  }

  // Lohutused
  const hasA = !!data.lohutused_grupp_A;
  const hasB = !!data.lohutused_grupp_B;
  if (hasA || hasB) {
    wrap.appendChild(bracketSectionTitle("Lohutused"));
    const note = document.createElement("p");
    note.className = "br-legend";
    note.textContent = "Esimese ringi kaotajad. Punktid lähevad samuti edetabelisse.";
    wrap.appendChild(note);

    const cols = document.createElement("div");
    cols.className = "br-two-col";
    if (hasA) cols.appendChild(buildRoundRobin(data.lohutused_grupp_A));
    if (hasB) cols.appendChild(buildGroupB(data.lohutused_grupp_B));
    wrap.appendChild(cols);
  }

  // Lõppjärjestus
  if (Array.isArray(data.loppjarjestus) && data.loppjarjestus.length) {
    wrap.appendChild(bracketSectionTitle("Lõppjärjestus & punktid"));
    wrap.appendChild(buildFinalStandings(data.loppjarjestus));
  }

  return wrap;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------- trend ----------

function setupTrend() {
  const sel = $("#trend-player");
  sel.innerHTML = "";
  state.current.players
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "et"))
    .forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.name;
      opt.textContent = p.name;
      sel.appendChild(opt);
    });
  // Default to current rank-1 player if available, otherwise first in list.
  const topPlayer = state.current.players.find((p) => p.rank === 1);
  sel.value = topPlayer?.name || state.current.players[0]?.name;

  sel.addEventListener("change", renderTrend);
  renderTrend();
}

function playerSet() {
  const s = {};
  state.current.players.forEach((p) => (s[p.name] = true));
  return s;
}

function openTrendFor(name) {
  $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === "trend"));
  $$(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "tab-trend"));
  $("#trend-player").value = name;
  renderTrend();
}

async function ensureHistorySnapshot(date) {
  if (state.history[date]) return state.history[date];
  const data = await fetchJSON(`data/history/${date}.json`);
  state.history[date] = data;
  return data;
}

async function renderTrend() {
  const name = $("#trend-player").value;
  const note = $("#trend-note");

  // Per-stage results from current data
  const player = state.current.players.find((p) => p.name === name);
  const labels = state.current.stages.map((s) => shortStageLabel(s.label));
  const values = state.current.stages.map((s) => player?.stages?.[s.label] ?? null);
  drawChart(labels, [{ label: `${name} — etapi tulemus`, data: values }]);
  note.textContent = "Mängija tulemused etappide kaupa.";
}

function drawChart(labels, datasets) {
  const ctx = $("#trend-chart").getContext("2d");
  if (state.trendChart) state.trendChart.destroy();

  // ElevenLabs warm-stone palette
  const grid = "rgba(0, 0, 0, 0.05)";
  const text = "#4e4e4e";
  const muted = "#777169";
  const line = "#1a1a1a";
  const fill = "rgba(78, 50, 23, 0.06)";
  const bodyFont = '"Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';

  const invertY = datasets[0]?.invertY;

  state.trendChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: datasets.map((d) => ({
        label: d.label,
        data: d.data,
        borderColor: line,
        borderWidth: 1.5,
        backgroundColor: fill,
        fill: true,
        tension: 0.3,
        spanGaps: true,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: "#ffffff",
        pointBorderColor: line,
        pointBorderWidth: 1.5,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" },
      layout: { padding: 4 },
      scales: {
        x: {
          grid: { color: grid, drawTicks: false },
          border: { display: false },
          ticks: {
            color: muted,
            font: { family: bodyFont, size: 11, weight: 500 },
            padding: 8,
          },
        },
        y: {
          grid: { color: grid, drawTicks: false },
          border: { display: false },
          ticks: {
            color: muted,
            font: { family: bodyFont, size: 11, weight: 500 },
            padding: 10,
            precision: 0,
            callback: (v) => Number.isInteger(v) ? v : "",
          },
          reverse: !!invertY,
          beginAtZero: !invertY,
        },
      },
      plugins: {
        legend: {
          labels: {
            color: text,
            font: { family: bodyFont, size: 13, weight: 500 },
            usePointStyle: true,
            pointStyle: "line",
            boxWidth: 24,
            boxHeight: 1,
          },
        },
        tooltip: {
          backgroundColor: "#ffffff",
          titleColor: text,
          bodyColor: line,
          borderColor: "rgba(0, 0, 0, 0.06)",
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8,
          titleFont: { family: bodyFont, size: 12, weight: 500 },
          bodyFont: { family: bodyFont, size: 13, weight: 400 },
          displayColors: false,
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed.y;
              if (v === null) return "—";
              return invertY ? `${ctx.dataset.label}: ${v}.` : `${ctx.dataset.label}: ${v}`;
            },
          },
        },
      },
    },
  });
}

// ---------- history ----------

function setupHistory() {
  const sel = $("#history-date");
  sel.innerHTML = "";
  state.historyDates.slice().reverse().forEach((d) => {
    const opt = document.createElement("option");
    opt.value = d;
    opt.textContent = fmtDate(d);
    sel.appendChild(opt);
  });
  sel.addEventListener("change", () => renderHistory(sel.value));
  if (state.historyDates.length) renderHistory(sel.value);
}

async function renderHistory(date) {
  const meta = $("#history-meta");
  const thead = $("#history-table thead");
  const tbody = $("#history-table tbody");
  thead.innerHTML = "";
  tbody.innerHTML = "";
  if (!date) {
    meta.textContent = "Ajalugu on tühi.";
    return;
  }
  const data = await ensureHistorySnapshot(date);
  meta.textContent = `${data.players.length} mängijat · seis: ${data.title?.match(/\(([^)]+)\)/)?.[1] || "—"}`;

  const tr = document.createElement("tr");
  ["Koht", "Nimi", "Punkte", "Turniire", "Keskmine"].forEach((h, i) => {
    const th = document.createElement("th");
    th.textContent = h;
    if (i !== 1) th.classList.add("num");
    tr.appendChild(th);
  });
  thead.appendChild(tr);

  data.players.forEach((p) => {
    const r = document.createElement("tr");
    if (isFirstPlace(p)) r.classList.add("highlight");
    [
      [p.rank, true],
      [p.name, false],
      [p.total, true],
      [p.tournaments_played, true],
      [(p.average ?? 0).toFixed(1), true],
    ].forEach(([v, num]) => {
      const td = document.createElement("td");
      td.textContent = v;
      if (num) td.classList.add("num");
      r.appendChild(td);
    });
    tbody.appendChild(r);
  });
}

// ---------- start ----------

document.addEventListener("DOMContentLoaded", init);
