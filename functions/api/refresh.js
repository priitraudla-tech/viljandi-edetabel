// Cloudflare Pages Function: manuaalne andmete uuendus.
// Route: POST /api/refresh
// Triggerib GitHub Actions workflow (update.yml) workflow_dispatch kaudu.
//
// Env-muutujad (Cloudflare Pages → Settings → Environment variables):
//   GITHUB_TOKEN  — PAT `workflow` scope'iga
// Valikulised: GITHUB_OWNER, GITHUB_REPO, GITHUB_REF

const DEFAULTS = {
  owner: "priitraudla-tech",
  repo: "viljandi-edetabel",
  ref: "main",
  workflow: "update.yml",
};

export async function onRequestPost(context) {
  const env = context.env;
  const token = env.GITHUB_TOKEN;
  if (!token) {
    return Response.json(
      { ok: false, error: "GITHUB_TOKEN keskkonnamuutuja pole seadistatud." },
      { status: 500 },
    );
  }

  const owner = env.GITHUB_OWNER || DEFAULTS.owner;
  const repo = env.GITHUB_REPO || DEFAULTS.repo;
  const ref = env.GITHUB_REF || DEFAULTS.ref;

  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${DEFAULTS.workflow}/dispatches`;

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "viljandi-edetabel-refresh-fn",
      },
      body: JSON.stringify({ ref }),
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: "Võrgu viga GitHub API-ga.", detail: String(e) },
      { status: 502 },
    );
  }

  if (res.status === 204) {
    return Response.json({ ok: true, message: "Workflow triggered." });
  }

  const detail = await res.text().catch(() => "");
  return Response.json(
    {
      ok: false,
      status: res.status,
      error:
        res.status === 401 || res.status === 403
          ? "GitHub keeldus — kontrolli, et GITHUB_TOKEN-il oleks `workflow` scope ja õige repo ligipääs."
          : "GitHub API viga.",
      detail,
    },
    { status: res.status === 401 || res.status === 403 ? 500 : 502 },
  );
}
