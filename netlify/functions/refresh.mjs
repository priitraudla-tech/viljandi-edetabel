// Manual refresh trigger.
// Called by the "Uuenda andmeid" button on the site.
// Triggers the GitHub Actions workflow `update.yml` via repository_dispatches API.
//
// Required env vars (Netlify project settings → Environment variables):
//   GITHUB_TOKEN   — Personal Access Token with `workflow` scope (or fine-grained
//                    PAT with Actions: Write + Metadata: Read on this repo).
// Optional:
//   GITHUB_OWNER   — defaults to "priitraudla-tech"
//   GITHUB_REPO    — defaults to "viljandi-edetabel"
//   GITHUB_REF     — defaults to "main"

const DEFAULTS = {
  owner: "priitraudla-tech",
  repo: "viljandi-edetabel",
  ref: "main",
  workflow: "update.yml",
};

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  const token = Netlify.env.get("GITHUB_TOKEN");
  if (!token) {
    return Response.json(
      {
        ok: false,
        error: "GITHUB_TOKEN keskkonnamuutuja pole Netlify saidil seadistatud.",
      },
      { status: 500 },
    );
  }

  const owner = Netlify.env.get("GITHUB_OWNER") || DEFAULTS.owner;
  const repo = Netlify.env.get("GITHUB_REPO") || DEFAULTS.repo;
  const ref = Netlify.env.get("GITHUB_REF") || DEFAULTS.ref;
  const workflow = DEFAULTS.workflow;

  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`;

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
};
