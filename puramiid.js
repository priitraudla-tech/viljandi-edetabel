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
  const sorted = players.slice().sort((a, b) => a.pos - b.pos);
  const rows = [];
  let i = 0;
  let size = 1;
  while (i < sorted.length) {
    rows.push(sorted.slice(i, i + size));
    i += size;
    size += 1;
  }
  return rows;
}

function renderPyramid() {
  const wrap = $("#pyramid");
  wrap.innerHTML = "";
  pyramidRows(state.data.players).forEach((row) => {
    const rowEl = document.createElement("div");
    rowEl.className = "pyr-row";
    row.forEach((p) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "pyr-card";
      if (p.pos === 1) card.classList.add("pyr-first");
      card.innerHTML = `
        <span class="pyr-pos">${p.pos}.</span>
        <span class="pyr-name">${escapeHtml(p.name)}</span>
        ${p.badge ? `<span class="pyr-badge">${p.badge}</span>` : ""}
      `;
      card.addEventListener("click", () => {
        state.gamesSearch = p.name.toLowerCase();
        $("#games-search").value = p.name;
        renderGames();
        switchTab("games");
      });
      rowEl.appendChild(card);
    });
    wrap.appendChild(rowEl);
  });
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
    const mvBadge = g.type === "mv" ? ' <span class="type-badge type-mv">MV</span>' : "";
    const chW = g.winner === g.challenger;
    const cdW = g.winner === g.challenged;
    tr.innerHTML = `
      <td class="num dim">${g.nr}</td>
      <td class="dim">${escapeHtml(dates || "—")}</td>
      <td class="${chW ? "game-winner" : ""}">${escapeHtml(g.challenger)}${mvBadge}</td>
      <td class="num">${escapeHtml(g.score || "—")}</td>
      <td class="${cdW ? "game-winner" : ""}">${escapeHtml(g.challenged)}</td>
      <td class="game-winner">${escapeHtml(g.winner || "—")}</td>
    `;
    tbody.appendChild(tr);
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
    card.innerHTML = `
      <div class="challenge-players">
        <span class="challenge-name">${escapeHtml(c.challenger)}</span>
        <span class="challenge-vs">vs</span>
        <span class="challenge-name">${escapeHtml(c.challenged)}</span>
      </div>
      <div class="challenge-meta">
        <span>Esitatud: ${escapeHtml(fmtDateISO(c.challenge_date) || "—")}</span>
        ${c.deadline ? `<span>· Tähtaeg: ${escapeHtml(fmtDateISO(c.deadline))}</span>` : ""}
      </div>
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
    });
  });

  // Populate selects
  playerOptions($("#ch-challenger"));
  playerOptions($("#ch-challenged"));
  playerOptions($("#res-challenger"));
  playerOptions($("#res-challenged"));

  // Pending-challenge picker fills the result form
  const resChallenge = $("#res-challenge");
  (state.data.challenges || []).forEach((c, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `${c.challenger} vs ${c.challenged}`;
    resChallenge.appendChild(opt);
  });
  resChallenge.addEventListener("change", () => {
    const i = resChallenge.value;
    if (i === "") return;
    const c = state.data.challenges[Number(i)];
    $("#res-challenger").value = c.challenger;
    $("#res-challenged").value = c.challenged;
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

  $("#form-challenge").addEventListener("submit", (e) => {
    e.preventDefault();
    submitAdmin("add_challenge", {
      challenger: $("#ch-challenger").value,
      challenged: $("#ch-challenged").value,
      challenge_date: $("#ch-date").value,
      deadline: $("#ch-deadline").value || null,
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
    const res = await fetch("/.netlify/functions/puramiid-update", {
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
