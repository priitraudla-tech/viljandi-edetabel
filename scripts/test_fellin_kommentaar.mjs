// Testid: functions/api/fellin-kommentaar.js (ilma võrguta — GitHubi API on asendatud).
// Käivita:  node scripts/test_fellin_kommentaar.mjs
//
// Test kasutab oma võtit (env.FELLIN_VOTME_RASI) — päris kliendivõti ei ole repos.

import { createHash } from "node:crypto";
import { onRequestGet, onRequestPost } from "../functions/api/fellin-kommentaar.js";

const TESTVOTI = "testvoti-123";
const env = {
  GITHUB_TOKEN: "test",
  FELLIN_VOTME_RASI: createHash("sha256").update(TESTVOTI).digest("hex"),
};

let ok = 0, vigu = 0;
const kontroll = (tingimus, nimi) => {
  if (tingimus) { ok++; console.log(`  OK   ${nimi}`); }
  else { vigu++; console.log(`  VIGA ${nimi}`); }
};

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const unb64 = (s) => Buffer.from(s, "base64").toString("utf8");

// Võlts-GitHub: hoiab faili mälus, PUT kontrollib sha-d nagu päris API.
function voltsGithub({ konflikte = 0 } = {}) {
  const st = {
    data: { versioonid: [{ nr: 1, kuupaev: "2026-11-09", muudatused: ["x"] }], kommentaarid: [] },
    sha: "sha0", putte: 0, sonumid: [], konflikte,
  };
  globalThis.fetch = async (url, init = {}) => {
    if (!init.method || init.method === "GET") {
      return new Response(JSON.stringify({ content: b64(JSON.stringify(st.data)), sha: st.sha }), { status: 200 });
    }
    const body = JSON.parse(init.body);
    st.putte++;
    if (st.konflikte > 0) { st.konflikte--; st.sha = st.sha + "x"; return new Response("{}", { status: 409 }); }
    if (body.sha !== st.sha) return new Response("{}", { status: 409 });
    st.data = JSON.parse(unb64(body.content));
    st.sha = "sha" + st.putte;
    st.sonumid.push(body.message);
    return new Response("{}", { status: 200 });
  };
  return st;
}

const post = (body, e = env) => onRequestPost({
  env: e, request: new Request("http://x/api/fellin-kommentaar", { method: "POST", body: JSON.stringify(body) }),
});
const hea = { k: TESTVOTI, osa: "hinnad", osa_nimi: "Hinnad ja broneerimine", nimi: "Ott", tekst: "Padeli hind on vale." };

console.log("fellin-kommentaar:");

{
  const st = voltsGithub();
  const r = await post({ ...hea, k: "vale" });
  kontroll(r.status === 403 && st.putte === 0, "vale võti → 403, midagi ei kirjutata");
  const r2 = await post({ ...hea, k: undefined });
  kontroll(r2.status === 403, "võti puudu → 403");
  const r3 = await post(hea, { GITHUB_TOKEN: "test" });
  kontroll(r3.status === 403, "testvõti ei kehti päris võtme räsi vastu");
}
{
  const st = voltsGithub();
  const r = await post(hea);
  const j = await r.json();
  const c = st.data.kommentaarid[0];
  kontroll(r.status === 200 && j.ok, "õige võti → 200");
  kontroll(st.data.kommentaarid.length === 1 && c.tekst === hea.tekst && c.nimi === "Ott" && c.osa === "hinnad",
    "kommentaar salvestati faili");
  kontroll(/^[0-9a-f]{8}$/.test(c.id) && c.staatus === "avatud" && c.vastus_id === null && !Number.isNaN(Date.parse(c.aeg)),
    "id, staatus, aeg on olemas");
  kontroll(st.sonumid[0].includes("[skip ci]"), "commit-sõnumis on [skip ci]");
  kontroll(j.andmed && j.andmed.kommentaarid.length === 1 && j.andmed.versioonid.length === 1,
    "vastuses on uuendatud andmed (leht ei pea ootama)");
  kontroll(!("k" in c) && !("veeb" in c), "võtit ega mesipotti faili ei salvestata");

  const r2 = await post({ ...hea, nimi: "Priit", tekst: "Parandan.", vastus_id: c.id });
  kontroll(r2.status === 200 && st.data.kommentaarid[1].vastus_id === c.id, "vastus kommentaarile");
  const r3 = await post({ ...hea, vastus_id: "deadbeef" });
  kontroll(r3.status === 400, "vastus olematule kommentaarile → 400");
}
{
  const st = voltsGithub();
  const tests = [
    [{ ...hea, tekst: "   " }, "tühi tekst"],
    [{ ...hea, nimi: "" }, "nimi puudu"],
    [{ ...hea, tekst: "a".repeat(3001) }, "liiga pikk tekst"],
    [{ ...hea, osa: "<script>" }, "vigane osa"],
  ];
  for (const [b, nimi] of tests) {
    const r = await post(b);
    kontroll(r.status === 400, `${nimi} → 400`);
  }
  kontroll(st.putte === 0, "vigased päringud ei kirjuta midagi");
}
{
  const st = voltsGithub();
  const r = await post({ ...hea, veeb: "http://spam" });
  kontroll(r.status === 200 && st.putte === 0, "mesipott: robotile 200, aga ei salvestata");
}
{
  const st = voltsGithub({ konflikte: 2 });
  const r = await post(hea);
  kontroll(r.status === 200 && st.data.kommentaarid.length === 1 && st.putte === 3,
    "samaaegne kirjutus (409) → loeb uuesti ja proovib, 3. katse õnnestub");
}
{
  const st = voltsGithub({ konflikte: 5 });
  const r = await post(hea);
  kontroll(r.status === 503 && st.data.kommentaarid.length === 0, "püsiv konflikt → 503, ei kirjuta poolikult");
}
{
  voltsGithub();
  const r = await onRequestGet({ env });
  const j = await r.json();
  kontroll(r.status === 200 && Array.isArray(j.kommentaarid) && r.headers.get("Cache-Control") === "no-store",
    "GET tagastab andmed, ilma vahemäluta");
  const r2 = await onRequestGet({ env: {} });
  kontroll(r2.status === 500, "GET ilma GITHUB_TOKENita → 500");
}
{
  const st = voltsGithub();
  st.data.kommentaarid = Array.from({ length: 500 }, (_, i) => ({ id: String(i).padStart(8, "0"), osa: "x" }));
  const r = await post(hea);
  kontroll(r.status === 400 && st.putte === 0, "500 kommentaari piir");
}

console.log(`\n${ok} OK, ${vigu} viga`);
process.exit(vigu ? 1 : 0);
