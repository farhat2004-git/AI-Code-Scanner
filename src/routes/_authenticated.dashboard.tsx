import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, FileCode2, AlertTriangle } from "lucide-react";
import { SeverityBadge, ScorePill } from "@/components/scan-ui";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — AI Code Guardian" }] }),
  component: Dashboard,
});

function Dashboard() {
  const scansQ = useQuery({
    queryKey: ["scans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scans")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const scans = scansQ.data ?? [];
  const done = scans.filter((s) => s.status === "done");
  const avg = done.length
    ? Math.round(done.reduce((a, s) => a + (s.overall_score ?? 0), 0) / done.length)
    : null;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Your recent scans and code health.</p>
        </div>
        <Link to="/scan/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" /> New scan
          </Button>
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total scans" value={scans.length} />
        <StatCard label="Completed" value={done.length} />
        <StatCard label="Avg. score" value={avg ?? "—"} suffix={avg != null ? "/100" : ""} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Recent scans</h2>
        {scansQ.isLoading ? (
          <div className="rounded-md border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : scans.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
            {scans.map((s) => (
              <li key={s.id}>
                <Link
                  to="/scan/$id"
                  params={{ id: s.id }}
                  className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-2"
                >
                  <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-surface-2 text-primary">
                    <FileCode2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{s.title}</span>
                      <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                        {s.language}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                    </div>
                  </div>
                  {s.status === "done" ? (
                    <ScorePill score={s.overall_score ?? 0} />
                  ) : s.status === "error" ? (
                    <SeverityBadge severity="high">Error</SeverityBadge>
                  ) : (
                    <SeverityBadge severity="info">Running…</SeverityBadge>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, suffix }: { label: string; value: number | string; suffix?: string }) {
  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-2xl">
        {value}
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-md border border-dashed border-border bg-surface p-10 text-center">
      <AlertTriangle className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="mt-3 text-sm text-muted-foreground">No scans yet.</p>
      <Link to="/scan/new" className="mt-4 inline-block">
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> Run your first scan
        </Button>
      </Link>
    </div>
  );
}
