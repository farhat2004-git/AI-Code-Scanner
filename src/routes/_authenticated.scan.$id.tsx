import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SeverityBadge, ScorePill, ScoreBar } from "@/components/scan-ui";
import { Loader2, ArrowLeft, FileCode2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { Button } from "@/components/ui/button";

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
              <IssueCard key={i.id} issue={i} />
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

function IssueCard({ issue }: { issue: Issue }) {
  const [open, setOpen] = useState(false);
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
      </button>
      {open && (
        <div className="space-y-3 border-t border-border px-4 py-4 text-sm">
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
          {issue.fixed_code && (
            <CodeBlock label="Suggested fix" code={issue.fixed_code} tone="success" />
          )}
          {issue.fix_explanation && (
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
