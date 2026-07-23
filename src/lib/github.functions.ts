import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const GATEWAY = "https://connector-gateway.lovable.dev/github";

function ghHeaders() {
  const lovable = process.env.LOVABLE_API_KEY;
  const gh = process.env.GITHUB_API_KEY;
  if (!lovable || !gh) throw new Error("GitHub connection is not configured");
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    Authorization: `Bearer ${lovable}`,
    "X-Connection-Api-Key": gh,
  };
}

async function gh<T>(path: string): Promise<T> {
  const res = await fetch(`${GATEWAY}${path}`, { headers: ghHeaders() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

const LANG_MAP: Record<string, string> = {
  py: "python", js: "javascript", jsx: "javascript",
  ts: "typescript", tsx: "typescript", java: "java",
  go: "go", rs: "rust", c: "c", cpp: "cpp", cc: "cpp",
  h: "c", php: "php", rb: "ruby", cs: "csharp",
  kt: "kotlin", swift: "swift", scala: "scala", sh: "bash",
  sql: "sql", html: "html", css: "css", vue: "vue", svelte: "svelte",
};
function detectLang(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return LANG_MAP[ext] ?? "text";
}

/* ------------------------------ Repos ------------------------------ */

export const listRepos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    type Repo = {
      id: number;
      name: string;
      full_name: string;
      private: boolean;
      description: string | null;
      default_branch: string;
      stargazers_count: number;
      forks_count: number;
      open_issues_count: number;
      language: string | null;
      updated_at: string;
      owner: { login: string; avatar_url: string };
      html_url: string;
    };
    const repos = await gh<Repo[]>(
      "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
    );
    return repos.map((r) => ({
      id: r.id,
      name: r.name,
      full_name: r.full_name,
      private: r.private,
      description: r.description,
      default_branch: r.default_branch,
      stars: r.stargazers_count,
      forks: r.forks_count,
      open_issues: r.open_issues_count,
      language: r.language,
      updated_at: r.updated_at,
      owner: r.owner.login,
      avatar_url: r.owner.avatar_url,
      html_url: r.html_url,
    }));
  });

export const getRepoStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ owner: z.string(), repo: z.string() }).parse(d),
  )
  .handler(async ({ data }) => {
    type Repo = {
      full_name: string;
      description: string | null;
      private: boolean;
      default_branch: string;
      stargazers_count: number;
      forks_count: number;
      open_issues_count: number;
      subscribers_count: number;
      language: string | null;
      size: number;
      pushed_at: string;
      html_url: string;
      license: { name: string } | null;
    };
    const r = await gh<Repo>(`/repos/${data.owner}/${data.repo}`);
    const languages = await gh<Record<string, number>>(
      `/repos/${data.owner}/${data.repo}/languages`,
    ).catch(() => ({}));
    return {
      full_name: r.full_name,
      description: r.description,
      private: r.private,
      default_branch: r.default_branch,
      stars: r.stargazers_count,
      forks: r.forks_count,
      open_issues: r.open_issues_count,
      watchers: r.subscribers_count,
      language: r.language,
      size_kb: r.size,
      pushed_at: r.pushed_at,
      html_url: r.html_url,
      license: r.license?.name ?? null,
      languages,
    };
  });

/* ------------------------------ Files ------------------------------ */

export const listRepoTree = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ owner: z.string(), repo: z.string(), ref: z.string().optional() })
      .parse(d),
  )
  .handler(async ({ data }) => {
    let ref = data.ref;
    if (!ref) {
      const r = await gh<{ default_branch: string }>(
        `/repos/${data.owner}/${data.repo}`,
      );
      ref = r.default_branch;
    }
    const tree = await gh<{
      tree: Array<{ path: string; type: string; size?: number; sha: string }>;
      truncated: boolean;
    }>(`/repos/${data.owner}/${data.repo}/git/trees/${ref}?recursive=1`);
    const files = tree.tree
      .filter((t) => t.type === "blob")
      .filter((t) => (t.size ?? 0) < 400_000)
      .map((t) => ({ path: t.path, size: t.size ?? 0, sha: t.sha }))
      .sort((a, b) => a.path.localeCompare(b.path));
    return { ref, files, truncated: tree.truncated };
  });

export const getFileContent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        owner: z.string(),
        repo: z.string(),
        path: z.string(),
        ref: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const q = data.ref ? `?ref=${encodeURIComponent(data.ref)}` : "";
    const f = await gh<{
      content: string;
      encoding: string;
      path: string;
      size: number;
    }>(`/repos/${data.owner}/${data.repo}/contents/${encodeURIComponent(data.path)}${q}`);
    if (f.encoding !== "base64") throw new Error("Unsupported file encoding");
    const decoded = Buffer.from(f.content, "base64").toString("utf-8");
    return { path: f.path, size: f.size, content: decoded };
  });

/* --------------------------- PRs & Commits --------------------------- */

export const listPullRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        owner: z.string(),
        repo: z.string(),
        state: z.enum(["open", "closed", "all"]).default("open"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    type PR = {
      number: number;
      title: string;
      state: string;
      user: { login: string; avatar_url: string };
      created_at: string;
      updated_at: string;
      html_url: string;
      draft: boolean;
      head: { ref: string };
      base: { ref: string };
    };
    const prs = await gh<PR[]>(
      `/repos/${data.owner}/${data.repo}/pulls?state=${data.state}&per_page=30`,
    );
    return prs.map((p) => ({
      number: p.number,
      title: p.title,
      state: p.state,
      draft: p.draft,
      author: p.user.login,
      avatar: p.user.avatar_url,
      created_at: p.created_at,
      updated_at: p.updated_at,
      html_url: p.html_url,
      head: p.head.ref,
      base: p.base.ref,
    }));
  });

export const listCommits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ owner: z.string(), repo: z.string(), ref: z.string().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    type C = {
      sha: string;
      commit: { message: string; author: { name: string; date: string } };
      author: { login: string; avatar_url: string } | null;
      html_url: string;
    };
    const q = data.ref ? `?sha=${encodeURIComponent(data.ref)}&per_page=30` : "?per_page=30";
    const commits = await gh<C[]>(`/repos/${data.owner}/${data.repo}/commits${q}`);
    return commits.map((c) => ({
      sha: c.sha,
      short: c.sha.slice(0, 7),
      message: c.commit.message.split("\n")[0],
      author: c.author?.login ?? c.commit.author.name,
      avatar: c.author?.avatar_url ?? null,
      date: c.commit.author.date,
      html_url: c.html_url,
    }));
  });

/* ------------------------------ Scans ------------------------------ */

const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
const CATEGORIES = [
  "security",
  "bug",
  "performance",
  "quality",
  "style",
  "maintainability",
] as const;

const AnalysisSchema = z.object({
  summary: z.string(),
  overall_score: z.number(),
  security_score: z.number(),
  quality_score: z.number(),
  performance_score: z.number(),
  maintainability_score: z.number(),
  issues: z.array(
    z.object({
      title: z.string(),
      category: z.enum(CATEGORIES),
      severity: z.enum(SEVERITIES),
      description: z.string(),
      why_dangerous: z.string().nullable(),
      line_start: z.number().nullable(),
      line_end: z.number().nullable(),
      cvss: z.number().nullable(),
      fix_explanation: z.string().nullable(),
      fixed_code: z.string().nullable(),
      code_snippet: z.string().nullable(),
    }),
  ),
});

const SYSTEM_PROMPT = `You are AI Code Guardian, an expert security and code-quality reviewer.
You analyze source code (or a diff/patch) and produce a structured report.
- Detect security vulnerabilities (OWASP Top 10), bugs, perf issues, code smells.
- For diffs, focus on the changed lines; call out risky additions.
- Score 0-100. Strict but fair.
- Provide fixed_code snippets under 40 lines.
- Explain in plain English.`;

async function runAiAndPersist(opts: {
  supabase: import("@supabase/supabase-js").SupabaseClient;
  userId: string;
  title: string;
  language: string;
  source_code: string;
  source: string;
  repo_full_name?: string;
  ref?: string;
  file_path?: string;
  promptPrefix?: string;
}) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");

  const truncated = opts.source_code.slice(0, 60_000);
  const { data: scan, error: insertErr } = await opts.supabase
    .from("scans")
    .insert({
      user_id: opts.userId,
      title: opts.title,
      language: opts.language,
      source_code: truncated,
      status: "running",
      source: opts.source,
      repo_full_name: opts.repo_full_name ?? null,
      ref: opts.ref ?? null,
      file_path: opts.file_path ?? null,
    })
    .select()
    .single();
  if (insertErr || !scan) throw new Error(insertErr?.message ?? "Failed to create scan");

  try {
    const gateway = createLovableAiGatewayProvider(key);
    const numbered = truncated
      .split("\n")
      .map((l, i) => `${String(i + 1).padStart(4, " ")}  ${l}`)
      .join("\n");

    const { output: a } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system: SYSTEM_PROMPT,
      output: Output.object({ schema: AnalysisSchema }),
      prompt: `${opts.promptPrefix ?? ""}Language: ${opts.language}\n\nContent (line-numbered):\n\`\`\`\n${numbered}\n\`\`\``,
    });

    await opts.supabase
      .from("scans")
      .update({
        status: "done",
        summary: a.summary,
        overall_score: Math.round(a.overall_score),
        security_score: Math.round(a.security_score),
        quality_score: Math.round(a.quality_score),
        performance_score: Math.round(a.performance_score),
        maintainability_score: Math.round(a.maintainability_score),
        scores: {
          overall: a.overall_score,
          security: a.security_score,
          quality: a.quality_score,
          performance: a.performance_score,
          maintainability: a.maintainability_score,
        },
      })
      .eq("id", scan.id);

    if (a.issues.length > 0) {
      await opts.supabase.from("scan_issues").insert(
        a.issues.map((i) => ({
          scan_id: scan.id,
          user_id: opts.userId,
          category: i.category,
          severity: i.severity,
          title: i.title,
          description: i.description,
          why_dangerous: i.why_dangerous,
          line_start: i.line_start,
          line_end: i.line_end,
          cvss: i.cvss,
          fix_explanation: i.fix_explanation,
          fixed_code: i.fixed_code,
          code_snippet: i.code_snippet,
        })),
      );
    }

    const criticals = a.issues.filter((i) => i.severity === "critical").length;
    const highs = a.issues.filter((i) => i.severity === "high").length;
    const notifType = criticals > 0 ? "critical" : highs > 0 ? "warning" : "success";
    const parts: string[] = [];
    if (criticals) parts.push(`${criticals} critical`);
    if (highs) parts.push(`${highs} high`);
    const notifBody = parts.length
      ? `Found ${parts.join(", ")} · score ${Math.round(a.overall_score)}/100`
      : `Clean scan · score ${Math.round(a.overall_score)}/100`;

    await opts.supabase.from("notifications").insert({
      user_id: opts.userId,
      title: `Scan complete: ${opts.title}`,
      body: notifBody,
      type: notifType,
      link: `/scan/${scan.id}`,
    });
    return { scan_id: scan.id as string };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await opts.supabase
      .from("scans")
      .update({ status: "error", error: message })
      .eq("id", scan.id);
    throw new Error(message);
  }
}

export const scanRepoFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        owner: z.string(),
        repo: z.string(),
        path: z.string(),
        ref: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const q = data.ref ? `?ref=${encodeURIComponent(data.ref)}` : "";
    const f = await gh<{ content: string; encoding: string; path: string }>(
      `/repos/${data.owner}/${data.repo}/contents/${encodeURIComponent(data.path)}${q}`,
    );
    if (f.encoding !== "base64") throw new Error("Unsupported encoding");
    const content = Buffer.from(f.content, "base64").toString("utf-8");
    return runAiAndPersist({
      supabase: context.supabase,
      userId: context.userId,
      title: `${data.owner}/${data.repo}:${data.path}`,
      language: detectLang(data.path),
      source_code: content,
      source: "github_file",
      repo_full_name: `${data.owner}/${data.repo}`,
      ref: data.ref,
      file_path: data.path,
    });
  });

export const scanPullRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ owner: z.string(), repo: z.string(), number: z.number() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const pr = await gh<{ title: string; head: { sha: string; ref: string } }>(
      `/repos/${data.owner}/${data.repo}/pulls/${data.number}`,
    );
    const res = await fetch(
      `${GATEWAY}/repos/${data.owner}/${data.repo}/pulls/${data.number}`,
      { headers: { ...ghHeaders(), Accept: "application/vnd.github.v3.diff" } },
    );
    if (!res.ok) throw new Error(`GitHub PR diff ${res.status}`);
    const diff = await res.text();
    return runAiAndPersist({
      supabase: context.supabase,
      userId: context.userId,
      title: `PR #${data.number}: ${pr.title}`,
      language: "diff",
      source_code: diff,
      source: "github_pr",
      repo_full_name: `${data.owner}/${data.repo}`,
      ref: pr.head.sha,
      file_path: `pull/${data.number}`,
      promptPrefix:
        "This is a unified GitHub pull request diff. Focus on newly added/changed lines (prefixed with '+').\n\n",
    });
  });

export const scanCommit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ owner: z.string(), repo: z.string(), sha: z.string() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const res = await fetch(
      `${GATEWAY}/repos/${data.owner}/${data.repo}/commits/${data.sha}`,
      { headers: { ...ghHeaders(), Accept: "application/vnd.github.v3.diff" } },
    );
    if (!res.ok) throw new Error(`GitHub commit diff ${res.status}`);
    const diff = await res.text();
    return runAiAndPersist({
      supabase: context.supabase,
      userId: context.userId,
      title: `Commit ${data.sha.slice(0, 7)}`,
      language: "diff",
      source_code: diff,
      source: "github_commit",
      repo_full_name: `${data.owner}/${data.repo}`,
      ref: data.sha,
      promptPrefix:
        "This is a unified GitHub commit diff. Focus on newly added/changed lines (prefixed with '+').\n\n",
    });
  });
