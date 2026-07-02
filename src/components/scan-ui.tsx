import type { ReactNode } from "react";

type Severity = "critical" | "high" | "medium" | "low" | "info";

const SEV_STYLES: Record<Severity, string> = {
  critical: "bg-sev-critical/15 text-sev-critical border-sev-critical/30",
  high: "bg-sev-high/15 text-sev-high border-sev-high/30",
  medium: "bg-sev-medium/15 text-sev-medium border-sev-medium/30",
  low: "bg-sev-low/15 text-sev-low border-sev-low/30",
  info: "bg-sev-info/15 text-sev-info border-sev-info/30",
};

export function SeverityBadge({
  severity,
  children,
}: {
  severity: Severity;
  children?: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${SEV_STYLES[severity]}`}
    >
      {children ?? severity}
    </span>
  );
}

export function ScorePill({ score }: { score: number }) {
  const tone =
    score >= 85
      ? "text-success border-success/40 bg-success/10"
      : score >= 65
        ? "text-warning border-warning/40 bg-warning/10"
        : "text-danger border-danger/40 bg-danger/10";
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-1 font-mono text-xs ${tone}`}
    >
      {score}
      <span className="ml-0.5 opacity-60">/100</span>
    </span>
  );
}

export function ScoreBar({ label, value }: { label: string; value: number | null | undefined }) {
  const v = value ?? 0;
  const color =
    v >= 85 ? "var(--color-success)" : v >= 65 ? "var(--color-warning)" : "var(--color-danger)";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono">{value ?? "—"}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${v}%`, background: color }}
        />
      </div>
    </div>
  );
}
