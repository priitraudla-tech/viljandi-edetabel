/* Viljandimaa MV — ajastatud käivitaja.
 *
 * Cron äratab selle Workeri, see vajutab GitHubis "Run workflow" nuppu
 * (workflow_dispatch). Ülejäänu teeb olemasolev Action: tõmbab tournatedist,
 * uuendab data/mv.json ja püramiidi, commitib.
 *
 * Vajalik saladus:  GITHUB_TOKEN  (õigus: Actions write ehk klassikalisel
 * tokenil 'repo' + 'workflow'). Seadista:  npx wrangler secret put GITHUB_TOKEN
 *
 * Valikuline saladus:  TRIGGER_KEY  — kui seatud, saab uuenduse käivitada ka
 * käsitsi:  POST https://<worker>/trigger?key=<TRIGGER_KEY>
 * Kui seadmata, on see otspunkt välja lülitatud.
 */

export const REPO = "priitraudla-tech/viljandi-edetabel";
export const WORKFLOW = "mv.yml";
export const REF = "main";

const KATSEID = 3;
const OOTEAJAD_MS = [2000, 6000];

const oota = (ms) => new Promise((r) => setTimeout(r, ms));

/** Käivita GitHubi workflow. Tagastab {ok, status, katseid} või viskab vea. */
export async function dispatch(env, { fetchImpl = fetch, sleep = oota } = {}) {
  if (!env || !env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN pole seadistatud (npx wrangler secret put GITHUB_TOKEN)");
  }

  let viimane = null;
  for (let katse = 1; katse <= KATSEID; katse++) {
    let res;
    try {
      res = await fetchImpl(
        `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.GITHUB_TOKEN}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "viljandi-mv-cron",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ref: REF }),
        },
      );
    } catch (e) {
      viimane = `võrguviga: ${e.message}`;
      if (katse < KATSEID) { await sleep(OOTEAJAD_MS[katse - 1]); continue; }
      break;
    }

    if (res.status === 204) return { ok: true, status: 204, katseid: katse };

    const keha = await res.text().catch(() => "");
    viimane = `HTTP ${res.status}: ${keha.slice(0, 300)}`;

    // 401/403/404 = vale token või vale rada. Kordamine ei aita.
    if ([401, 403, 404, 422].includes(res.status)) break;
    if (katse < KATSEID) await sleep(OOTEAJAD_MS[katse - 1]);
  }
  throw new Error(`workflow_dispatch ebaõnnestus: ${viimane}`);
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      dispatch(env)
        .then((r) => console.log(`MV workflow käivitatud (katseid ${r.katseid})`))
        .catch((e) => {
          console.error(`MV workflow käivitamine ebaõnnestus: ${e.message}`);
          throw e; // jäta Cloudflare'i logisse veaks
        }),
    );
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/trigger" && request.method === "POST") {
      if (!env.TRIGGER_KEY) {
        return uus({ ok: false, error: "Käsitsi käivitamine pole lubatud (TRIGGER_KEY seadmata)." }, 404);
      }
      if (url.searchParams.get("key") !== env.TRIGGER_KEY) {
        return uus({ ok: false, error: "Vale võti." }, 403);
      }
      try {
        const r = await dispatch(env);
        return uus({ ok: true, ...r });
      } catch (e) {
        return uus({ ok: false, error: e.message }, 502);
      }
    }

    return uus({
      teenus: "viljandi-mv-cron",
      teeb: `käivitab ${REPO} → ${WORKFLOW} iga 30 min turniiripäevadel`,
      kasitsi: env.TRIGGER_KEY ? "POST /trigger?key=..." : "välja lülitatud",
    });
  },
};

function uus(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
