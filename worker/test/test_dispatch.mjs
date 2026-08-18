/* Test: kas Worker käivitab GitHubi workflow õigesti ja talub tõrkeid?
 *
 * Käivita:  node worker/test/test_dispatch.mjs
 * Võrguühendust EI kasuta — fetch on asendatud.
 */

import { dispatch, REPO, WORKFLOW, REF } from "../src/index.js";

let vigu = 0;
const chk = (nimi, ok, lisa = "") => {
  if (!ok) vigu++;
  console.log(`  [${ok ? "OK  " : "VIGA"}] ${nimi}${lisa ? " - " + lisa : ""}`);
};
const nosleep = async () => {};
const vastus = (status, keha = "") => ({
  status,
  text: async () => keha,
});

// 1. Õnnestunud käivitus
{
  const kutsed = [];
  const fetchImpl = async (url, opts) => { kutsed.push({ url, opts }); return vastus(204); };
  const r = await dispatch({ GITHUB_TOKEN: "t" }, { fetchImpl, sleep: nosleep });
  chk("204 -> õnnestus", r.ok === true && r.katseid === 1);
  chk("õige URL", kutsed[0].url ===
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    kutsed[0].url);
  chk("meetod POST", kutsed[0].opts.method === "POST");
  chk("ref kaasas", JSON.parse(kutsed[0].opts.body).ref === REF);
  chk("token päises", kutsed[0].opts.headers.Authorization === "Bearer t");
  chk("API versioon fikseeritud",
    kutsed[0].opts.headers["X-GitHub-Api-Version"] === "2022-11-28");
}

// 2. Token puudu
{
  let viga = null;
  try { await dispatch({}, { fetchImpl: async () => vastus(204), sleep: nosleep }); }
  catch (e) { viga = e.message; }
  chk("token puudu -> selge viga", viga && viga.includes("GITHUB_TOKEN"), viga || "");
}

// 3. Ajutine 500 -> korratakse ja õnnestub
{
  let n = 0;
  const fetchImpl = async () => { n++; return n < 3 ? vastus(500, "oops") : vastus(204); };
  const r = await dispatch({ GITHUB_TOKEN: "t" }, { fetchImpl, sleep: nosleep });
  chk("kaks 500-t, kolmas õnnestub", r.ok === true && n === 3, `katseid=${n}`);
}

// 4. Võrguviga -> korratakse
{
  let n = 0;
  const fetchImpl = async () => { n++; throw new Error("ECONNRESET"); };
  let viga = null;
  try { await dispatch({ GITHUB_TOKEN: "t" }, { fetchImpl, sleep: nosleep }); }
  catch (e) { viga = e.message; }
  chk("võrguviga -> kolm katset", n === 3, `katseid=${n}`);
  chk("veateade sisaldab põhjust", viga && viga.includes("ECONNRESET"), viga || "");
}

// 5. 401 (vale token) -> EI korrata
{
  let n = 0;
  const fetchImpl = async () => { n++; return vastus(401, "Bad credentials"); };
  let viga = null;
  try { await dispatch({ GITHUB_TOKEN: "vale" }, { fetchImpl, sleep: nosleep }); }
  catch (e) { viga = e.message; }
  chk("401 -> ei korrata", n === 1, `katseid=${n}`);
  chk("veateade sisaldab HTTP koodi", viga && viga.includes("401"), (viga || "").slice(0, 60));
}

// 6. 404 (vale workflow/repo) -> EI korrata
{
  let n = 0;
  const fetchImpl = async () => { n++; return vastus(404, "Not Found"); };
  try { await dispatch({ GITHUB_TOKEN: "t" }, { fetchImpl, sleep: nosleep }); } catch {}
  chk("404 -> ei korrata", n === 1, `katseid=${n}`);
}

console.log("\n" + (vigu ? `VIGA: ${vigu} kontrolli kukkus labi.` : "KORRAS: kaivitaja tootab."));
process.exit(vigu ? 1 : 0);
