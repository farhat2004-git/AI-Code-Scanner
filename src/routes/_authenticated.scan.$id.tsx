import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SeverityBadge, ScorePill, ScoreBar } from "@/components/scan-ui";
import { Loader2, ArrowLeft, FileCode2, Sparkles, Wand2, Download, Copy } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { explainIssue, generateFix, type ExplainResult, type FixResult } from "@/lib/issue-ai.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/scan/$id")({
  head: () => ({ meta: [{ title: "Scan report — AI Code Guardian" }] }),
  component: ScanDetail,
});

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 } as const;

function ScanDetail() {
  const { id } = useParams({ from: "/_authenticated/scan/$id" });

  const scanQ = useQuery({
    queryKey: ["scan", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("scans").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const issuesQ = useQuery({
    queryKey: ["scan-issues", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scan_issues")
        .select("*")
        .eq("scan_id", id);
      if (error) throw error;
      return (data ?? []).sort(
        (a, b) =>
          (SEV_ORDER[a.severity as keyof typeof SEV_ORDER] ?? 9) -
          (SEV_ORDER[b.severity as keyof typeof SEV_ORDER] ?? 9),
      );
    },
  });

  if (scanQ.isLoading) {
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!scanQ.data) return <div>Not found</div>;
  const scan = scanQ.data;
  const issues = issuesQ.data ?? [];

  return (
    <div className="space-y-6">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Back to dashboard
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FileCode2 className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">{scan.title}</h1>
            <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
              {scan.language}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(scan.created_at), { addSuffix: true })} ·{" "}
            {issues.length} issue{issues.length === 1 ? "" : "s"}
          </p>
        </div>
        {scan.status === "done" && scan.overall_score != null && (
          <ScorePill score={scan.overall_score} />
        )}
      </div>

      {scan.status === "error" && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive-foreground">
          Scan failed: {scan.error}
        </div>
      )}

      {scan.summary && (
        <div className="rounded-md border border-border bg-surface p-4">
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">Summary</h2>
          <p className="whitespace-pre-wrap text-sm">{scan.summary}</p>
        </div>
      )}

      {scan.status === "done" && (
        <div className="rounded-md border border-border bg-surface p-4">
          <h2 className="mb-4 text-sm font-medium text-muted-foreground">Scores</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <ScoreBar label="Security" value={scan.security_score} />
            <ScoreBar label="Quality" value={scan.quality_score} />
            <ScoreBar label="Performance" value={scan.performance_score} />
            <ScoreBar label="Maintainability" value={scan.maintainability_score} />
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Issues</h2>
        {issues.length === 0 ? (
          <div className="rounded-md border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
            No issues detected. Nice work.
          </div>
        ) : (
          <div className="space-y-2">
            {issues.map((i) => (
              <IssueCard key={i.id} issue={i as unknown as Issue} language={scan.language} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type Issue = {
  id: string;
  title: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  description: string | null;
  why_dangerous: string | null;
  line_start: number | null;
  line_end: number | null;
  cvss: number | null;
  fix_explanation: string | null;
  fixed_code: string | null;
  code_snippet: string | null;
};

function confidenceFromCvss(cvss: number | null, severity: string): { label: string; tone: string } {
  const c = cvss ?? (severity === "critical" ? 9 : severity === "high" ? 7.5 : severity === "medium" ? 5 : severity === "low" ? 2 : 1);
  if (c >= 8) return { label: "High confidence", tone: "text-sev-high border-sev-high/40 bg-sev-high/10" };
  if (c >= 5) return { label: "Medium confidence", tone: "text-sev-medium border-sev-medium/40 bg-sev-medium/10" };
  return { label: "Low confidence", tone: "text-sev-low border-sev-low/40 bg-sev-low/10" };
}

function IssueCard({ issue, language }: { issue: Issue; language: string }) {
  const [open, setOpen] = useState(false);
  const [explanation, setExplanation] = useState<ExplainResult | null>(null);
  const [fix, setFix] = useState<(FixResult & { original: string }) | null>(null);

  const explainFn = useServerFn(explainIssue);
  const fixFn = useServerFn(generateFix);

  const explainM = useMutation({
    mutationFn: () => explainFn({ data: { issue_id: issue.id } }),
    onSuccess: (r) => setExplanation(r),
    onError: (e: Error) => toast.error(e.message),
  });
  const fixM = useMutation({
    mutationFn: () => fixFn({ data: { issue_id: issue.id } }),
    onSuccess: (r) => setFix(r),
    onError: (e: Error) => toast.error(e.message),
  });

  const conf = confidenceFromCvss(issue.cvss, issue.severity);

  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
      >
        <SeverityBadge severity={issue.severity} />
        <span className="flex-1 truncate font-medium">{issue.title}</span>
        <span className="hidden text-xs text-muted-foreground sm:inline">{issue.category}</span>
        {issue.line_start != null && (
          <span className="font-mono text-xs text-muted-foreground">
            L{issue.line_start}
            {issue.line_end && issue.line_end !== issue.line_start ? `–${issue.line_end}` : ""}
          </span>
        )}
        {issue.cvss != null && (
          <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            CVSS {issue.cvss.toFixed(1)}
          </span>
        )}
        <span className={`hidden rounded border px-1.5 py-0.5 text-[10px] md:inline ${conf.tone}`}>
          {conf.label}
        </span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-border px-4 py-4 text-sm">
          {issue.description && (
            <p className="text-muted-foreground">{issue.description}</p>
          )}
          {issue.why_dangerous && (
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">
                Why it's dangerous
              </div>
              <p>{issue.why_dangerous}</p>
            </div>
          )}
          {issue.code_snippet && (
            <CodeBlock label="Affected code" code={issue.code_snippet} tone="danger" />
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => explainM.mutate()}
              disabled={explainM.isPending}
            >
              {explainM.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              Explain Vulnerability
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => fixM.mutate()}
              disabled={fixM.isPending}
            >
              {fixM.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              Generate Secure Code
            </Button>
          </div>

          {explanation && <ExplanationPanel data={explanation} />}
          {fix && (
            <FixPanel
              original={fix.original || issue.code_snippet || ""}
              fixed={fix.fixed_code}
              explanation={fix.explanation}
              changedLines={fix.changed_lines}
              language={language}
              title={issue.title}
            />
          )}

          {issue.fixed_code && !fix && (
            <CodeBlock label="Suggested fix" code={issue.fixed_code} tone="success" />
          )}
          {issue.fix_explanation && !fix && (
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Why the fix</div>
              <p>{issue.fix_explanation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExplanationPanel({ data }: { data: ExplainResult }) {
  return (
    <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-primary">
        <Sparkles className="h-3.5 w-3.5" /> AI Explanation
      </div>
      <Field label="Why this exists" text={data.why_exists} />
      <Field label="In plain English" text={data.beginner_explanation} />
      <Field label="Security risk" text={data.security_risk} />
      <Field label="Real-world impact" text={data.real_world_impact} />
      <div>
        <div className="mb-1 text-xs font-medium text-muted-foreground">Prevention tips</div>
        <ul className="list-inside list-disc space-y-1">
          {data.prevention_tips.map((t, idx) => (
            <li key={idx}>{t}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Field({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-muted-foreground">{label}</div>
      <p>{text}</p>
    </div>
  );
}

function FixPanel({
  original,
  fixed,
  explanation,
  changedLines,
  language,
  title,
}: {
  original: string;
  fixed: string;
  explanation: string;
  changedLines: number[];
  language: string;
  title: string;
}) {
  const changedSet = new Set(changedLines);
  const downloadFixed = () => {
    const ext = extForLanguage(language);
    const safe = title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40) || "fix";
    const blob = new Blob([fixed], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safe}-fixed.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const copyFixed = async () => {
    await navigator.clipboard.writeText(fixed);
    toast.success("Fixed code copied");
  };

  return (
    <div className="space-y-3 rounded-md border border-success/30 bg-success/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-success">
          <Wand2 className="h-3.5 w-3.5" /> Secure Code Generated
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={copyFixed}>
            <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
          </Button>
          <Button size="sm" variant="outline" onClick={downloadFixed}>
            <Download className="mr-1.5 h-3.5 w-3.5" /> Download
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Before</div>
          <NumberedCode code={original} tone="danger" />
        </div>
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">After</div>
          <NumberedCode code={fixed} tone="success" highlight={changedSet} />
        </div>
      </div>

      {explanation && (
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">What changed</div>
          <p className="text-sm">{explanation}</p>
        </div>
      )}
    </div>
  );
}

function NumberedCode({
  code,
  tone,
  highlight,
}: {
  code: string;
  tone: "danger" | "success";
  highlight?: Set<number>;
}) {
  const border = tone === "danger" ? "border-destructive/30" : "border-success/30";
  const lines = code.split("\n");
  return (
    <pre
      className={`overflow-x-auto rounded-md border ${border} bg-background p-3 font-mono text-xs leading-5`}
    >
      <code>
        {lines.map((l, idx) => {
          const n = idx + 1;
          const changed = highlight?.has(n);
          return (
            <div
              key={idx}
              className={changed ? "-mx-3 bg-success/15 px-3" : undefined}
            >
              <span className="mr-3 inline-block w-6 select-none text-right text-muted-foreground">
                {n}
              </span>
              {l || " "}
            </div>
          );
        })}
      </code>
    </pre>
  );
}

function extForLanguage(lang: string): string {
  const m: Record<string, string> = {
    javascript: "js",
    typescript: "ts",
    tsx: "tsx",
    jsx: "jsx",
    python: "py",
    ruby: "rb",
    go: "go",
    java: "java",
    csharp: "cs",
    cpp: "cpp",
    c: "c",
    rust: "rs",
    php: "php",
    swift: "swift",
    kotlin: "kt",
  };
  return m[lang.toLowerCase()] ?? "txt";
}

function CodeBlock({
  label,
  code,
  tone,
}: {
  label: string;
  code: string;
  tone: "danger" | "success";
}) {
  const border = tone === "danger" ? "border-destructive/30" : "border-success/30";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => navigator.clipboard.writeText(code)}
        >
          Copy
        </Button>
      </div>
      <pre
        className={`overflow-x-auto rounded-md border ${border} bg-background p-3 font-mono text-xs`}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}
