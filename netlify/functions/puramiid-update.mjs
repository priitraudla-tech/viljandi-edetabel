// Püramiidi haldus: parooliga kaitstud kirjutamine data/puramiid.json faili.
//
// POST {password, action, payload}
//   add_challenge  {challenger, challenged, challenge_date, deadline}
//   add_result     {challenge_index|null, challenger, challenged, score,
//                   winner, play_date, type, swap}
//
// Vajalikud env-muutujad (Netlify → Environment variables):
//   PYRAMID_ADMIN_PASSWORD — haldusparool
//   GITHUB_TOKEN           — PAT repo-kirjutusõigusega (juba olemas refresh-nupust)
// Valikulised: GITHUB_OWNER, GITHUB_REPO, GITHUB_REF

import { timingSafeEqual } from "node:crypto";

const OWNER = () => Netlify.env.get("GITHUB_OWNER") || "priitraudla-tech";
const REPO = () => Netlify.env.get("GITHUB_REPO") || "viljandi-edetabel";
const REF = () => Netlify.env.get("GITHUB_REF") || "main";
const FILE_PATH = "data/puramiid.json";

function passwordOk(supplied) {
  const expected = Netlify.env.get("PYRAMID_ADMIN_PASSWORD") || "";
  if (!expected) return { ok: false, reason: "PYRAMID_ADMIN_PASSWORD pole seadistatud." };
  const a = Buffer.from(String(supplied || ""), "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return { ok: false, reason: "Vale parool." };
  return timingSafeEqual(a, b)
    ? { ok: true }
    : { ok: false, reason: "Vale parool." };
}

async function ghFetch(url, options = {}) {
  const token = Netlify.env.get("GITHUB_TOKEN");
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "puramiid-update-fn",
      ...(options.headers || {}),
    },
  });
}

const CHALLENGE_DAYS = 14;  // väljakutse tuleb mängida 2 nädala jooksul
const ERAND_MAX = 2;        // allapoole-väljakutseid hooajal mängija kohta
const ERAND_MAX_DIST = 2;   // mitu kohta allapoole tohib kutsuda
const COOLDOWN_DAYS = 14;   // sama paari uus väljakutse

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Sama paigutus nagu UI-s: kolmnurkrid, viimane koht üksinda põhjas.
function pyramidRows(players) {
  const sorted = players.slice().sort((a, b) => a.pos - b.pos);
  if (sorted.length < 2) return sorted.length ? [sorted] : [];
  const last = sorted[sorted.length - 1];
  const rest = sorted.slice(0, -1);
  const rows = [];
  let i = 0, size = 1;
  while (i < rest.length) {
    rows.push(rest.slice(i, i + size));
    i += size;
    size += 1;
  }
  rows.push([last]);
  return rows;
}

// Reegel: välja saab kutsuda samas reas vasakul + rida ülevalpool olevaid.
function isAllowedTarget(players, challengerName, challengedName) {
  const rows = pyramidRows(players);
  const rowIdx = rows.findIndex((r) => r.some((p) => p.name === challengerName));
  if (rowIdx < 0) return false;
  const me = players.find((p) => p.name === challengerName);
  const sameRowLeft = rows[rowIdx].filter((p) => p.pos < me.pos);
  const rowAbove = rowIdx > 0 ? rows[rowIdx - 1] : [];
  return [...rowAbove, ...sameRowLeft].some((p) => p.name === challengedName);
}

function erandUsed(data, name) {
  const inGames = data.games.filter((g) => g.erand && g.challenger === name).length;
  const pending = (data.challenges || []).filter((c) => c.erand && c.challenger === name).length;
  return inGames + pending;
}

function recentMeeting(data, a, b) {
  const isISO = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s);
  const pair = (x) =>
    (x.challenger === a && x.challenged === b) ||
    (x.challenger === b && x.challenged === a);
  if ((data.challenges || []).some(pair)) return "ootel väljakutse on juba olemas";
  const cutoff = addDays(new Date().toISOString().slice(0, 10), -COOLDOWN_DAYS);
  for (const g of data.games) {
    if (pair(g) && isISO(g.play_date) && g.play_date >= cutoff) {
      return `viimane omavaheline mäng oli ${g.play_date}`;
    }
  }
  return null;
}

function applyAddChallenge(data, p) {
  if (!p.challenger || !p.challenged) throw new Error("Mängijad puudu.");
  if (p.challenger === p.challenged) throw new Error("Sama mängija mõlemal poolel.");

  const challenger = data.players.find((x) => x.name === p.challenger);
  const challenged = data.players.find((x) => x.name === p.challenged);
  if (!challenger || !challenged) throw new Error("Mängijat pole püramiidis.");

  if (p.erand) {
    // Erand: kuni 2 kohta allpool, max 2× hooajal.
    const dist = challenged.pos - challenger.pos;
    if (dist < 1 || dist > ERAND_MAX_DIST) {
      throw new Error(`Erand lubab kutsuda ainult 1–${ERAND_MAX_DIST} kohta allpool olevat mängijat.`);
    }
    if (erandUsed(data, p.challenger) >= ERAND_MAX) {
      throw new Error(`${p.challenger} on juba kasutanud ${ERAND_MAX} erandit sel hooajal.`);
    }
  } else if (!p.override) {
    if (!isAllowedTarget(data.players, p.challenger, p.challenged)) {
      throw new Error(
        "Reegli järgi saab kutsuda ainult samas reas vasakul või rida ülevalpool olevaid mängijaid. " +
        "Allapoole kutsumiseks kasuta erandi-linnukest.");
    }
  }

  if (!p.override) {
    const recent = recentMeeting(data, p.challenger, p.challenged);
    if (recent) {
      throw new Error(`Sama paari uus väljakutse on lubatud 2 nädala pärast (${recent}).`);
    }
  }

  const deadline = p.deadline ||
    (p.challenge_date ? addDays(p.challenge_date, CHALLENGE_DAYS) : null);
  data.challenges = data.challenges || [];
  data.challenges.push({
    challenger: p.challenger,
    challenged: p.challenged,
    challenge_date: p.challenge_date || null,
    deadline,
    erand: !!p.erand,
    created_at: new Date().toISOString(),
  });
  return `puramiid: väljakutse ${p.challenger} → ${p.challenged}${p.erand ? " (erand)" : ""}`;
}

function applyAddResult(data, p) {
  if (!p.challenger || !p.challenged || !p.winner) throw new Error("Väljad puudu.");
  if (![p.challenger, p.challenged].includes(p.winner)) {
    throw new Error("Võitja peab olema üks kahest mängijast.");
  }

  // Erand-staatus: kliendi linnuke või seotud ootel väljakutse küljest.
  let erand = !!p.erand;
  if (p.challenge_index !== null && p.challenge_index !== undefined) {
    const c = (data.challenges || [])[p.challenge_index];
    if (c && c.erand) erand = true;
  }

  const nr = data.games.reduce((m, g) => Math.max(m, g.nr || 0), 0) + 1;
  const game = {
    nr,
    challenger: p.challenger,
    challenged: p.challenged,
    score: p.score || "",
    winner: p.winner,
    type: p.type || "tavaline",
    erand,
    challenge_date: null,
    play_date: p.play_date || null,
  };
  data.games.push(game);

  // Remove the linked pending challenge (by index, verified by names).
  if (p.challenge_index !== null && p.challenge_index !== undefined) {
    const c = (data.challenges || [])[p.challenge_index];
    if (c && c.challenger === p.challenger && c.challenged === p.challenged) {
      data.challenges.splice(p.challenge_index, 1);
      game.challenge_date = c.challenge_date;
    }
  }

  const a = data.players.find((pl) => pl.name === p.challenger);
  const b = data.players.find((pl) => pl.name === p.challenged);
  const doSwap = () => {
    if (a && b) {
      [a.pos, b.pos] = [b.pos, a.pos];
      data.players.sort((x, y) => x.pos - y.pos);
      return true;
    }
    return false;
  };

  // Positsioonide loogika. Arvestusevälised mängud kohti ei muuda.
  let note = "";
  if (p.type !== "arvestusevaline") {
    if (erand) {
      // Erand (väljakutse allapoole): võit = 2 boonuspunkti, kohad ei muutu;
      // kaotus = kohavahetus nõrgemal positsioonil mängijaga.
      if (p.winner === p.challenger) {
        note = " (erand: võit — 2 boonuspunkti, kohad ei muutu)";
      } else if (a && b && a.pos < b.pos && doSwap()) {
        note = " (erand: kaotus — kohavahetus)";
      }
    } else if (p.swap && p.winner === p.challenger && a && b && a.pos > b.pos) {
      if (doSwap()) note = " (kohavahetus)";
    }
  }

  return `puramiid: mäng #${nr} ${p.challenger} vs ${p.challenged} → ${p.winner}${note}`;
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Vigane päring." }, { status: 400 });
  }

  const auth = passwordOk(body.password);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.reason }, { status: 401 });
  }

  if (!Netlify.env.get("GITHUB_TOKEN")) {
    return Response.json(
      { ok: false, error: "GITHUB_TOKEN pole seadistatud." },
      { status: 500 },
    );
  }

  // 1. Read current file (content + sha for the update).
  const getUrl =
    `https://api.github.com/repos/${OWNER()}/${REPO()}/contents/${FILE_PATH}?ref=${REF()}`;
  const getRes = await ghFetch(getUrl);
  if (!getRes.ok) {
    return Response.json(
      { ok: false, error: `GitHub lugemine ebaõnnestus (${getRes.status}).` },
      { status: 502 },
    );
  }
  const file = await getRes.json();
  const data = JSON.parse(Buffer.from(file.content, "base64").toString("utf8"));

  // 2. Apply the action.
  let message;
  try {
    if (body.action === "add_challenge") {
      message = applyAddChallenge(data, body.payload || {});
    } else if (body.action === "add_result") {
      message = applyAddResult(data, body.payload || {});
    } else {
      return Response.json({ ok: false, error: "Tundmatu tegevus." }, { status: 400 });
    }
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 400 });
  }

  data.updated_at = new Date().toISOString();

  // 3. Commit back.
  const putRes = await ghFetch(
    `https://api.github.com/repos/${OWNER()}/${REPO()}/contents/${FILE_PATH}`,
    {
      method: "PUT",
      body: JSON.stringify({
        message,
        content: Buffer.from(JSON.stringify(data, null, 2), "utf8").toString("base64"),
        sha: file.sha,
        branch: REF(),
      }),
    },
  );
  if (!putRes.ok) {
    const detail = await putRes.text().catch(() => "");
    return Response.json(
      { ok: false, error: `GitHub kirjutamine ebaõnnestus (${putRes.status}).`, detail },
      { status: 502 },
    );
  }

  return Response.json({ ok: true, message });
};
