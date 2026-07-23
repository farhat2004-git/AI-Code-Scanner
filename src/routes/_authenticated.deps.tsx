import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { scanDependencies } from "@/lib/deps-scan.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SeverityBadge } from "@/components/scan-ui";
import { toast } from "sonner";
import { Loader2, Upload, ShieldAlert, Package, KeyRound } from "lucide-react";

export const Route = createFileRoute("/_authenticated/deps")({
  head: () => ({
    meta: [
      { title: "Dependency & Secret Scan — AI Code Guardian" },
      {
        name: "description",
        content:
          "Scan package manifests for vulnerable dependencies and detect exposed secrets, API keys, and credentials.",
      },
    ],
  }),
  component: DepsPage,
});

type ScanResult = Awaited<ReturnType<typeof scanDependencies>>;

function DepsPage() {
  const scan = useServerFn(scanDependencies);
  const [filename, setFilename] = useState("package.json");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500_000) return toast.error("File too large (max 500KB).");
    setFilename(file.name);
    setContent(await file.text());
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return toast.error("Paste a manifest or file first.");
    setLoading(true);
    setResult(null);
    try {
      const r = await scan({ data: { filename, content } });
      setResult(r);
      toast.success(
        `Scan complete · ${r.dep.dependencies.length} advisories · ${r.secrets.length} secrets`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }

  const riskTone =
    result && result.dep.risk_score >= 70
      ? "text-danger border-danger/40 bg-danger/10"
      : result && result.dep.risk_score >= 40
        ? "text-warning border-warning/40 bg-warning/10"
        : "text-success border-success/40 bg-success/10";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dependency & Secret Scan</h1>
        <p className="text-sm text-muted-foreground">
          Paste <code className="rounded bg-surface px-1 text-xs">package.json</code>,{" "}
          <code className="rounded bg-surface px-1 text-xs">requirements.txt</code>,{" "}
          <code className="rounded bg-surface px-1 text-xs">pom.xml</code>,{" "}
          <code className="rounded bg-surface px-1 text-xs">go.mod</code>,{" "}
          <code className="rounded bg-surface px-1 text-xs">Cargo.toml</code>, or any file to
          scan for exposed keys.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div>
            <Label htmlFor="filename">Filename</Label>
            <Input
              id="filename"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="flex items-end">
            <label className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm text-muted-foreground hover:bg-surface-2 hover:text-foreground">
              <Upload className="h-3.5 w-3.5" /> Upload
              <input type="file" className="hidden" onChange={onFile} />
            </label>
          </div>
        </div>
        <div>
          <Label htmlFor="content">File contents</Label>
          <Textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste the manifest or file contents here…"
            className="mt-1 min-h-[280px] font-mono text-xs"
            spellCheck={false}
          />
        </div>
        <Button type="submit" size="lg" disabled={loading} className="w-full gap-2">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Scanning…
            </>
          ) : (
            <>
              <ShieldAlert className="h-4 w-4" /> Scan for vulnerabilities & secrets
            </>
          )}
        </Button>
      </form>

      {result && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-border bg-surface p-4">
              <div className="text-xs text-muted-foreground">Ecosystem</div>
              <div className="mt-1 font-mono text-lg uppercase">{result.ecosystem}</div>
            </div>
            <div className="rounded-md border border-border bg-surface p-4">
              <div className="text-xs text-muted-foreground">Vulnerable dependencies</div>
              <div className="mt-1 font-mono text-2xl">{result.dep.dependencies.length}</div>
            </div>
            <div className="rounded-md border border-border bg-surface p-4">
              <div className="text-xs text-muted-foreground">Dependency risk score</div>
              <div className="mt-1 inline-flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-md border px-2 py-1 font-mono text-lg ${riskTone}`}
                >
                  {Math.round(result.dep.risk_score)}
                  <span className="ml-0.5 text-xs opacity-60">/100</span>
                </span>
              </div>
            </div>
          </div>

          {result.dep.summary && (
            <p className="rounded-md border border-border bg-surface p-4 text-sm text-muted-foreground">
              {result.dep.summary}
            </p>
          )}

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Package className="h-4 w-4" /> Vulnerable dependencies (
              {result.dep.dependencies.length})
            </h2>
            {result.dep.dependencies.length === 0 ? (
              <div className="rounded-md border border-dashed border-border bg-surface p-6 text-center text-sm text-muted-foreground">
                No known vulnerable dependencies detected.
              </div>
            ) : (
              <ul className="space-y-2">
                {result.dep.dependencies.map((d, i) => (
                  <li
                    key={i}
                    className="rounded-md border border-border bg-surface p-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={d.severity} />
                      <span className="font-mono text-sm font-medium">{d.name}</span>
                      {d.version && (
                        <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {d.version}
                        </span>
                      )}
                      {d.cve && (
                        <span className="rounded border border-danger/30 bg-danger/10 px-1.5 py-0.5 font-mono text-[10px] text-danger">
                          {d.cve}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm">{d.issue}</p>
                    <div className="mt-2 rounded border-l-2 border-primary/60 bg-surface-2 p-2 text-xs">
                      <span className="font-medium text-primary">Fix: </span>
                      {d.recommendation}
                      {d.safe_version && (
                        <>
                          {" "}
                          Upgrade to{" "}
                          <code className="font-mono text-success">{d.safe_version}</code>.
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <KeyRound className="h-4 w-4" /> Exposed secrets ({result.secrets.length})
            </h2>
            {result.secrets.length === 0 ? (
              <div className="rounded-md border border-dashed border-border bg-surface p-6 text-center text-sm text-muted-foreground">
                No secrets detected. ✓
              </div>
            ) : (
              <ul className="space-y-2">
                {result.secrets.map((s, i) => (
                  <li key={i} className="rounded-md border border-border bg-surface p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={s.severity} />
                      <span className="text-sm font-medium">{s.kind}</span>
                      <span className="text-xs text-muted-foreground">line {s.line}</span>
                      <code className="ml-auto rounded bg-surface-2 px-2 py-0.5 font-mono text-xs">
                        {s.match}
                      </code>
                    </div>
                    <div className="mt-2 rounded border-l-2 border-warning/60 bg-surface-2 p-2 text-xs">
                      <span className="font-medium text-warning">Remediation: </span>
                      {s.suggestion}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
