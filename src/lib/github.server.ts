/**
 * Lets Eva read her own source code on GitHub and propose changes via PR.
 * Deliberately does NOT expose merge/push-to-main — every change lands as a
 * PR for Felix to review. Requires a fine-grained GITHUB_TOKEN scoped to
 * exactly this repo, with Contents (read/write) and Pull requests (read/write).
 */

const API = "https://api.github.com";

function ghHeaders() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      "GitHub integration not configured: set GITHUB_TOKEN (fine-grained PAT, scoped to this repo only, Contents + Pull requests write).",
    );
  }
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

function repoConfig() {
  return {
    owner: process.env.GITHUB_OWNER || "fhmic",
    repo: process.env.GITHUB_REPO || "eva-core",
    base: process.env.GITHUB_BASE_BRANCH || "main",
  };
}

/**
 * encodeURIComponent() on a full path turns "/" into "%2F", which breaks
 * GitHub's contents endpoint routing for any nested path — it expects literal
 * "/" between segments, with only special characters *within* each segment
 * encoded (spaces, unicode, etc).
 */
function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

export async function githubListTree(): Promise<string[]> {
  const { owner, repo, base } = repoConfig();
  const res = await fetch(`${API}/repos/${owner}/${repo}/git/trees/${base}?recursive=1`, {
    headers: ghHeaders(),
  });
  if (!res.ok) throw new Error(`GitHub list tree failed [${res.status}]: ${await res.text()}`);
  const data = await res.json();
  return (data.tree ?? [])
    .filter((n: { type: string }) => n.type === "blob")
    .map((n: { path: string }) => n.path);
}

export async function githubSearchCode(
  query: string,
): Promise<Array<{ path: string; url: string }>> {
  const { owner, repo } = repoConfig();
  const q = encodeURIComponent(`${query} repo:${owner}/${repo}`);
  const res = await fetch(`${API}/search/code?q=${q}`, { headers: ghHeaders() });
  if (!res.ok) throw new Error(`GitHub code search failed [${res.status}]: ${await res.text()}`);
  const data = await res.json();
  return (data.items ?? [])
    .slice(0, 15)
    .map((it: { path: string; html_url: string }) => ({ path: it.path, url: it.html_url }));
}

const MAX_READ_CHARS = 60000;

export async function githubReadFile(
  path: string,
): Promise<{ content: string; sha: string; truncated: boolean }> {
  const { owner, repo, base } = repoConfig();
  const res = await fetch(
    `${API}/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${base}`,
    { headers: ghHeaders() },
  );
  if (!res.ok) throw new Error(`GitHub read file failed [${res.status}] (${path}): ${await res.text()}`);
  const data = await res.json();
  if (Array.isArray(data)) throw new Error(`${path} is a directory, not a file.`);
  const decoded = Buffer.from(data.content, data.encoding === "base64" ? "base64" : "utf-8").toString(
    "utf-8",
  );
  return {
    content: decoded.slice(0, MAX_READ_CHARS),
    sha: data.sha,
    truncated: decoded.length > MAX_READ_CHARS,
  };
}

export type GithubFileChange = { path: string; content: string };

export async function githubProposeChange(opts: {
  changes: GithubFileChange[];
  slug: string;
  commitMessage: string;
  prTitle: string;
  prBody: string;
}): Promise<{ prUrl: string; prNumber: number }> {
  const { owner, repo, base } = repoConfig();
  const headers = ghHeaders();
  const branchName = `eva/${opts.slug.replace(/[^a-z0-9-]/gi, "-").toLowerCase()}-${Date.now()}`;

  const refRes = await fetch(`${API}/repos/${owner}/${repo}/git/ref/heads/${base}`, { headers });
  if (!refRes.ok) throw new Error(`GitHub: could not read base branch ref: ${await refRes.text()}`);
  const baseSha = (await refRes.json()).object.sha;

  const branchRes = await fetch(`${API}/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha }),
  });
  if (!branchRes.ok) throw new Error(`GitHub: branch creation failed: ${await branchRes.text()}`);

  for (const change of opts.changes) {
    let existingSha: string | undefined;
    const existingRes = await fetch(
      `${API}/repos/${owner}/${repo}/contents/${encodePath(change.path)}?ref=${branchName}`,
      { headers },
    );
    if (existingRes.ok) {
      existingSha = (await existingRes.json()).sha;
    }

    const putRes = await fetch(
      `${API}/repos/${owner}/${repo}/contents/${encodePath(change.path)}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({
          message: opts.commitMessage,
          content: Buffer.from(change.content, "utf-8").toString("base64"),
          branch: branchName,
          ...(existingSha ? { sha: existingSha } : {}),
        }),
      },
    );
    if (!putRes.ok) throw new Error(`GitHub: commit to ${change.path} failed: ${await putRes.text()}`);
  }

  const prRes = await fetch(`${API}/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    headers,
    body: JSON.stringify({ title: opts.prTitle, body: opts.prBody, head: branchName, base }),
  });
  if (!prRes.ok) throw new Error(`GitHub: PR creation failed: ${await prRes.text()}`);
  const pr = await prRes.json();
  return { prUrl: pr.html_url, prNumber: pr.number };
}