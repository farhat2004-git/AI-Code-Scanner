import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  listRepos,
  listRepoTree,
  listPullRequests,
  listCommits,
  getRepoStats,
  scanRepoFile,
  scanPullRequest,
  scanCommit,
} from "@/lib/github.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Github,
  Lock,
  Star,
  GitFork,
  AlertCircle,
  Loader2,
  Search,
  FileCode2,
  GitPullRequest,
  GitCommit,
  BarChart3,
  ShieldCheck,
  ChevronLeft,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/github")({
  head: () => ({
    meta: [
      { title: "GitHub — AI Code Guardian" },
      {
        name: "description",
        content: "Scan GitHub repositories, pull requests and commits with AI.",
      },
    ],
  }),
  component: GithubPage,
});

type Repo = Awaited<ReturnType<typeof listRepos>>[number];

function GithubPage() {
  const [selected, setSelected] = useState<Repo | null>(null);
  return selected ? (
    <RepoView repo={selected} onBack={() => setSelected(null)} />
  ) : (
    <RepoList onSelect={setSelected} />
  );
}

/* --------------------------- Repo list --------------------------- */

function RepoList({ onSelect }: { onSelect: (r: Repo) => void }) {
  const list = useServerFn(listRepos);
  const [q, setQ] = useState("");
  const reposQ = useQuery({
    queryKey: ["gh", "repos"],
    queryFn: () => list(),
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    const items = reposQ.data ?? [];
    if (!q.trim()) return items;
    const s = q.toLowerCase();
    return items.filter(
      (r) =>
        r.full_name.toLowerCase().includes(s) ||
        (r.description ?? "").toLowerCase().includes(s),
    );
  }, [q, reposQ.data]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Github className="h-6 w-6" /> GitHub
          </h1>
          <p className="text-sm text-muted-foreground">
            Pick a repository to browse files, PRs, and commits — then scan any of them.
          </p>
        </div>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filter repositories…"
          className="pl-9"
        />
      </div>

      {reposQ.isLoading ? (
        <div className="grid place-items-center rounded-md border border-border bg-surface p-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : reposQ.isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-6 text-sm">
          <AlertCircle className="mb-2 h-5 w-5 text-destructive" />
          Couldn&rsquo;t load your GitHub repositories.
          <div className="mt-1 text-xs text-muted-foreground">
            {(reposQ.error as Error)?.message}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-surface p-10 text-center text-sm text-muted-foreground">
          No repositories match.
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
          {filtered.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => onSelect(r)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
              >
                <img
                  src={r.avatar_url}
                  alt=""
                  className="h-8 w-8 flex-shrink-0 rounded-md"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{r.full_name}</span>
                    {r.private && (
                      <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                        <Lock className="h-3 w-3" /> Private
                      </span>
                    )}
                    {r.language && (
                      <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {r.language}
                      </span>
                    )}
                  </div>
                  {r.description && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {r.description}
                    </p>
                  )}
                </div>
                <div className="hidden shrink-0 items-center gap-3 text-xs text-muted-foreground sm:flex">
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3.5 w-3.5" />
                    {r.stars}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <GitFork className="h-3.5 w-3.5" />
                    {r.forks}
                  </span>
                  <span>
                    {formatDistanceToNow(new Date(r.updated_at), { addSuffix: true })}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* --------------------------- Repo view --------------------------- */

type Tab = "files" | "prs" | "commits" | "stats";

function RepoView({ repo, onBack }: { repo: Repo; onBack: () => void }) {
  const [tab, setTab] = useState<Tab>("files");
  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-3 -ml-2 gap-1">
          <ChevronLeft className="h-4 w-4" /> Repositories
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <img src={repo.avatar_url} alt="" className="h-10 w-10 rounded-md" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold">{repo.full_name}</h1>
              {repo.private && (
                <span className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                  <Lock className="h-3 w-3" /> Private
                </span>
              )}
            </div>
            {repo.description && (
              <p className="text-xs text-muted-foreground">{repo.description}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {(
          [
            ["files", FileCode2, "Files"],
            ["prs", GitPullRequest, "Pull requests"],
            ["commits", GitCommit, "Commits"],
            ["stats", BarChart3, "Stats"],
          ] as const
        ).map(([id, Icon, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={
              "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors " +
              (tab === id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === "files" && <FilesTab repo={repo} />}
      {tab === "prs" && <PrsTab repo={repo} />}
      {tab === "commits" && <CommitsTab repo={repo} />}
      {tab === "stats" && <StatsTab repo={repo} />}
    </div>
  );
}

/* --------------------------- Files --------------------------- */

const SCANNABLE_EXTS = new Set([
  "py", "js", "jsx", "ts", "tsx", "java", "go", "rs", "c", "cpp", "cc",
  "h", "hpp", "php", "rb", "cs", "kt", "swift", "scala", "sh", "sql",
  "vue", "svelte",
]);

function FilesTab({ repo }: { repo: Repo }) {
  const navigate = useNavigate();
  const listTree = useServerFn(listRepoTree);
  const scanFile = useServerFn(scanRepoFile);
  const [q, setQ] = useState("");
  const [scanning, setScanning] = useState<string | null>(null);

  const treeQ = useQuery({
    queryKey: ["gh", "tree", repo.full_name],
    queryFn: () =>
      listTree({ data: { owner: repo.owner, repo: repo.name, ref: repo.default_branch } }),
  });

  const filtered = useMemo(() => {
    const items = treeQ.data?.files ?? [];
    const scannable = items.filter((f) => {
      const ext = f.path.split(".").pop()?.toLowerCase() ?? "";
      return SCANNABLE_EXTS.has(ext);
    });
    if (!q.trim()) return scannable.slice(0, 500);
    const s = q.toLowerCase();
    return scannable.filter((f) => f.path.toLowerCase().includes(s)).slice(0, 500);
  }, [q, treeQ.data]);

  async function runScan(path: string) {
    setScanning(path);
    try {
      const res = await scanFile({
        data: { owner: repo.owner, repo: repo.name, path, ref: repo.default_branch },
      });
      toast.success("Scan complete");
      navigate({ to: "/scan/$id", params: { id: res.scan_id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(null);
    }
  }

  if (treeQ.isLoading) return <TabLoading />;
  if (treeQ.isError) return <TabError err={treeQ.error as Error} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter files…"
            className="pl-9"
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {filtered.length} scannable · branch{" "}
          <code className="font-mono">{treeQ.data?.ref}</code>
        </span>
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
        {filtered.map((f) => (
          <li
            key={f.sha}
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2"
          >
            <FileCode2 className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate font-mono text-xs">
              {f.path}
            </span>
            <span className="hidden shrink-0 text-[10px] text-muted-foreground sm:inline">
              {(f.size / 1024).toFixed(1)} KB
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => runScan(f.path)}
              disabled={scanning === f.path}
              className="gap-1.5"
            >
              {scanning === f.path ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" />
              )}
              Scan
            </Button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted-foreground">
            No scannable files match.
          </li>
        )}
      </ul>
    </div>
  );
}

/* --------------------------- PRs --------------------------- */

function PrsTab({ repo }: { repo: Repo }) {
  const navigate = useNavigate();
  const listPRs = useServerFn(listPullRequests);
  const scanPR = useServerFn(scanPullRequest);
  const [state, setState] = useState<"open" | "closed" | "all">("open");
  const [scanning, setScanning] = useState<number | null>(null);

  const prsQ = useQuery({
    queryKey: ["gh", "prs", repo.full_name, state],
    queryFn: () => listPRs({ data: { owner: repo.owner, repo: repo.name, state } }),
  });

  async function runScan(number: number) {
    setScanning(number);
    try {
      const res = await scanPR({ data: { owner: repo.owner, repo: repo.name, number } });
      toast.success("PR scan complete");
      navigate({ to: "/scan/$id", params: { id: res.scan_id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {(["open", "closed", "all"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setState(s)}
            className={
              "rounded-md px-2.5 py-1 text-xs capitalize " +
              (state === s
                ? "bg-surface-2 text-foreground"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {s}
          </button>
        ))}
      </div>

      {prsQ.isLoading ? (
        <TabLoading />
      ) : prsQ.isError ? (
        <TabError err={prsQ.error as Error} />
      ) : (prsQ.data ?? []).length === 0 ? (
        <EmptyRow>No pull requests.</EmptyRow>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
          {prsQ.data!.map((p) => (
            <li key={p.number} className="flex items-center gap-3 px-4 py-3">
              <GitPullRequest
                className={
                  "h-4 w-4 flex-shrink-0 " +
                  (p.state === "open" ? "text-emerald-500" : "text-purple-400")
                }
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{p.title}</span>
                  <span className="text-xs text-muted-foreground">#{p.number}</span>
                  {p.draft && (
                    <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                      Draft
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {p.author} · {p.head} → {p.base} ·{" "}
                  {formatDistanceToNow(new Date(p.updated_at), { addSuffix: true })}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={scanning === p.number}
                onClick={() => runScan(p.number)}
                className="gap-1.5"
              >
                {scanning === p.number ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5" />
                )}
                Scan diff
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* --------------------------- Commits --------------------------- */

function CommitsTab({ repo }: { repo: Repo }) {
  const navigate = useNavigate();
  const listC = useServerFn(listCommits);
  const scanC = useServerFn(scanCommit);
  const [scanning, setScanning] = useState<string | null>(null);

  const commitsQ = useQuery({
    queryKey: ["gh", "commits", repo.full_name],
    queryFn: () =>
      listC({ data: { owner: repo.owner, repo: repo.name, ref: repo.default_branch } }),
  });

  async function runScan(sha: string) {
    setScanning(sha);
    try {
      const res = await scanC({ data: { owner: repo.owner, repo: repo.name, sha } });
      toast.success("Commit scan complete");
      navigate({ to: "/scan/$id", params: { id: res.scan_id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(null);
    }
  }

  if (commitsQ.isLoading) return <TabLoading />;
  if (commitsQ.isError) return <TabError err={commitsQ.error as Error} />;
  if ((commitsQ.data ?? []).length === 0) return <EmptyRow>No commits.</EmptyRow>;

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
      {commitsQ.data!.map((c) => (
        <li key={c.sha} className="flex items-center gap-3 px-4 py-3">
          <GitCommit className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm">{c.message}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              <code className="font-mono">{c.short}</code> · {c.author} ·{" "}
              {formatDistanceToNow(new Date(c.date), { addSuffix: true })}
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={scanning === c.sha}
            onClick={() => runScan(c.sha)}
            className="gap-1.5"
          >
            {scanning === c.sha ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
            Scan diff
          </Button>
        </li>
      ))}
    </ul>
  );
}

/* --------------------------- Stats --------------------------- */

function StatsTab({ repo }: { repo: Repo }) {
  const stats = useServerFn(getRepoStats);
  const statsQ = useQuery({
    queryKey: ["gh", "stats", repo.full_name],
    queryFn: () => stats({ data: { owner: repo.owner, repo: repo.name } }),
  });

  if (statsQ.isLoading) return <TabLoading />;
  if (statsQ.isError) return <TabError err={statsQ.error as Error} />;
  const s = statsQ.data!;
  const total = Object.values(s.languages).reduce((a, b) => a + b, 0) || 1;
  const langs = Object.entries(s.languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Stars" value={s.stars} icon={Star} />
        <Stat label="Forks" value={s.forks} icon={GitFork} />
        <Stat label="Open issues" value={s.open_issues} icon={AlertCircle} />
        <Stat label="Watchers" value={s.watchers} icon={BarChart3} />
      </div>

      <div className="rounded-md border border-border bg-surface p-4">
        <h3 className="mb-3 text-sm font-medium">Languages</h3>
        {langs.length === 0 ? (
          <p className="text-xs text-muted-foreground">No language data.</p>
        ) : (
          <div className="space-y-2">
            {langs.map(([name, bytes]) => {
              const pct = (bytes / total) * 100;
              return (
                <div key={name}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-mono">{name}</span>
                    <span className="text-muted-foreground">{pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <dl className="grid gap-3 rounded-md border border-border bg-surface p-4 text-sm sm:grid-cols-2">
        <Row label="Default branch" value={<code className="font-mono text-xs">{s.default_branch}</code>} />
        <Row label="Primary language" value={s.language ?? "—"} />
        <Row label="Size" value={`${(s.size_kb / 1024).toFixed(1)} MB`} />
        <Row label="License" value={s.license ?? "—"} />
        <Row
          label="Last pushed"
          value={formatDistanceToNow(new Date(s.pushed_at), { addSuffix: true })}
        />
        <Row label="Visibility" value={s.private ? "Private" : "Public"} />
      </dl>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 font-mono text-2xl">{value.toLocaleString()}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/* --------------------------- Helpers --------------------------- */

function TabLoading() {
  return (
    <div className="grid place-items-center rounded-md border border-border bg-surface p-10">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function TabError({ err }: { err: Error }) {
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 p-6 text-sm">
      <AlertCircle className="mb-2 h-5 w-5 text-destructive" />
      Request failed.
      <div className="mt-1 text-xs text-muted-foreground">{err.message}</div>
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-surface p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

