// Cloudflare Pages Function: püramiidi haldus (parooliga kaitstud).
// Route: POST /api/puramiid-update
// Sama loogika kui varasemal Netlify funktsioonil, kuid runtime-agnostiline:
// ilma Buffer/node:crypto-ta (TextEncoder + atob/btoa).
//
// Env-muutujad: PYRAMID_ADMIN_PASSWORD, GITHUB_TOKEN
// Valikulised: GITHUB_OWNER, GITHUB_REPO, GITHUB_REF

const FILE_PATH = "data/puramiid.json";
const CHALLENGE_DAYS = 14;
const ERAND_MAX = 2;
const ERAND_MAX_DIST = 2;
const COOLDOWN_DAYS = 14;

// ---------- runtime-agnostilised abid ----------

function safeEqual(a, b) {
  const ea = new TextEncoder().encode(String(a || ""));
  const eb = new TextEncoder().encode(String(b || ""));
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

function b64decodeUtf8(b64) {
  const bin = atob(String(b64).replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function b64encodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------- püramiidi reeglid (sama mis UI-s) ----------

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

  // Üks aktiivne väljakutse mängija kohta korraga.
  const busy = new Set();
  (data.challenges || []).forEach((c) => {
    busy.add(c.challenger);
    busy.add(c.challenged);
  });
  if (busy.has(p.challenger)) {
    throw new Error(`${p.challenger} on juba ootel väljakutses — uue saab esitada pärast selle mängimist.`);
  }
  if (busy.has(p.challenged)) {
    throw new Error(`${p.challenged} on juba ootel väljakutses — teda ei saa hetkel välja kutsuda.`);
  }

  if (p.erand) {
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

  let note = "";
  if (p.type !== "arvestusevaline") {
    if (erand) {
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

// ---------- handler ----------

export async function onRequestPost(context) {
  const env = context.env;
  const owner = env.GITHUB_OWNER || "priitraudla-tech";
  const repo = env.GITHUB_REPO || "viljandi-edetabel";
  const ref = env.GITHUB_REF || "main";

  let body;
  try {
    body = await context.request.json();
  } catch {
    return Response.json({ ok: false, error: "Vigane päring." }, { status: 400 });
  }

  const expected = env.PYRAMID_ADMIN_PASSWORD || "";
  if (!expected) {
    return Response.json(
      { ok: false, error: "PYRAMID_ADMIN_PASSWORD pole seadistatud." },
      { status: 500 },
    );
  }
  if (!safeEqual(body.password, expected)) {
    return Response.json({ ok: false, error: "Vale parool." }, { status: 401 });
  }

  if (!env.GITHUB_TOKEN) {
    return Response.json(
      { ok: false, error: "GITHUB_TOKEN pole seadistatud." },
      { status: 500 },
    );
  }

  const ghHeaders = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "puramiid-update-fn",
  };

  // 1. Loe fail (sisu + sha).
  const getRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${FILE_PATH}?ref=${ref}`,
    { headers: ghHeaders },
  );
  if (!getRes.ok) {
    return Response.json(
      { ok: false, error: `GitHub lugemine ebaõnnestus (${getRes.status}).` },
      { status: 502 },
    );
  }
  const file = await getRes.json();
  const data = JSON.parse(b64decodeUtf8(file.content));

  // 2. Rakenda tegevus.
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

  // 3. Commit tagasi.
  const putRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${FILE_PATH}`,
    {
      method: "PUT",
      headers: ghHeaders,
      body: JSON.stringify({
        message,
        content: b64encodeUtf8(JSON.stringify(data, null, 2)),
        sha: file.sha,
        branch: ref,
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
}
