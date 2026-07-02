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

function applyAddChallenge(data, p) {
  if (!p.challenger || !p.challenged) throw new Error("Mängijad puudu.");
  if (p.challenger === p.challenged) throw new Error("Sama mängija mõlemal poolel.");
  data.challenges = data.challenges || [];
  data.challenges.push({
    challenger: p.challenger,
    challenged: p.challenged,
    challenge_date: p.challenge_date || null,
    deadline: p.deadline || null,
    created_at: new Date().toISOString(),
  });
  return `puramiid: väljakutse ${p.challenger} → ${p.challenged}`;
}

function applyAddResult(data, p) {
  if (!p.challenger || !p.challenged || !p.winner) throw new Error("Väljad puudu.");
  if (![p.challenger, p.challenged].includes(p.winner)) {
    throw new Error("Võitja peab olema üks kahest mängijast.");
  }

  const nr = data.games.reduce((m, g) => Math.max(m, g.nr || 0), 0) + 1;
  data.games.push({
    nr,
    challenger: p.challenger,
    challenged: p.challenged,
    score: p.score || "",
    winner: p.winner,
    type: p.type || "tavaline",
    challenge_date: null,
    play_date: p.play_date || null,
  });

  // Remove the linked pending challenge (by index, verified by names).
  if (p.challenge_index !== null && p.challenge_index !== undefined) {
    const c = (data.challenges || [])[p.challenge_index];
    if (c && c.challenger === p.challenger && c.challenged === p.challenged) {
      data.challenges.splice(p.challenge_index, 1);
      data.games[data.games.length - 1].challenge_date = c.challenge_date;
    }
  }

  // Automatic position swap: challenger win swaps places.
  // Off-record games never move positions.
  let swapNote = "";
  if (p.swap && p.winner === p.challenger && p.type !== "arvestusevaline") {
    const a = data.players.find((pl) => pl.name === p.challenger);
    const b = data.players.find((pl) => pl.name === p.challenged);
    if (a && b && a.pos > b.pos) {
      [a.pos, b.pos] = [b.pos, a.pos];
      data.players.sort((x, y) => x.pos - y.pos);
      swapNote = " (kohavahetus)";
    }
  }

  return `puramiid: mäng #${nr} ${p.challenger} vs ${p.challenged} → ${p.winner}${swapNote}`;
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
