import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SeverityBadge } from "@/components/scan-ui";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — AI Code Guardian" },
      {
        name: "description",
        content:
          "Track scan volume, severity distribution, security score trend, and language-level statistics for your code.",
      },
    ],
  }),
  component: Analytics,
});

const SEV_ORDER = ["critical", "high", "medium", "low", "info"] as const;
const SEV_COLORS: Record<string, string> = {
  critical: "#f43f5e",
  high: "#fb923c",
  medium: "#facc15",
  low: "#38bdf8",
  info: "#94a3b8",
};

function Analytics() {
  const scansQ = useQuery({
    queryKey: ["analytics-scans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scans")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const issuesQ = useQuery({
    queryKey: ["analytics-issues"],
    queryFn: async () => {
      const { data, error } = await supabase.from("scan_issues").select("*");
      if (error) throw error;
      return data;
    },
  });

  if (scansQ.isLoading || issuesQ.isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const scans = scansQ.data ?? [];
  const issues = issuesQ.data ?? [];

  // Severity counts
  const sevCounts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const i of issues) sevCounts[i.severity] = (sevCounts[i.severity] ?? 0) + 1;

  const sevData = SEV_ORDER.map((s) => ({ name: s, value: sevCounts[s] ?? 0 }));

  // Most common vulnerabilities (by title)
  const titleCounts = new Map<string, number>();
  for (const i of issues) titleCounts.set(i.title, (titleCounts.get(i.title) ?? 0) + 1);
  const topVulns = Array.from(titleCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name: name.length > 40 ? name.slice(0, 37) + "…" : name, value }));

  // Score trend
  const doneScans = scans.filter((s) => s.status === "done" && s.overall_score != null);
  const trend = doneScans.map((s) => ({
    date: new Date(s.created_at).toLocaleDateString(),
    score: s.overall_score ?? 0,
    security: s.security_score ?? 0,
  }));

  // Activity by date
  const byDate = new Map<string, number>();
  for (const s of scans) {
    const d = new Date(s.created_at).toLocaleDateString();
    byDate.set(d, (byDate.get(d) ?? 0) + 1);
  }
  const activity = Array.from(byDate.entries()).map(([date, count]) => ({ date, count }));

  // Language stats
  const langCounts = new Map<string, number>();
  for (const s of scans) langCounts.set(s.language, (langCounts.get(s.language) ?? 0) + 1);
  const langData = Array.from(langCounts.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Overview of your scan activity, issues, and code health over time.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Total scans" value={scans.length} />
        <Stat label="Critical" value={sevCounts.critical} tone="critical" />
        <Stat label="High" value={sevCounts.high} tone="high" />
        <Stat label="Medium" value={sevCounts.medium} tone="medium" />
        <Stat label="Low" value={sevCounts.low} tone="low" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Security score trend">
          {trend.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trend}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis domain={[0, 100]} stroke="var(--color-muted-foreground)" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="score" stroke="#38bdf8" strokeWidth={2} dot={false} />
                <Line
                  type="monotone"
                  dataKey="security"
                  stroke="#f43f5e"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Vulnerability distribution">
          {issues.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={sevData.filter((d) => d.value > 0)}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={90}
                  label={(e) => `${e.name}: ${e.value}`}
                >
                  {sevData.map((d) => (
                    <Cell key={d.name} fill={SEV_COLORS[d.name]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Most common vulnerabilities">
          {topVulns.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topVulns} layout="vertical" margin={{ left: 12 }}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="var(--color-muted-foreground)"
                  fontSize={10}
                  width={140}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="value" fill="#a78bfa" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card title="Scan activity">
          {activity.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={activity}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="var(--color-muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <Card title="Language-wise statistics">
        {langData.length === 0 ? (
          <Empty />
        ) : (
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Language</th>
                  <th className="px-4 py-2 text-right font-medium">Scans</th>
                  <th className="px-4 py-2 text-right font-medium">Avg. score</th>
                  <th className="px-4 py-2 text-right font-medium">Issues</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {langData.map((l) => {
                  const langScans = scans.filter(
                    (s) => s.language === l.name && s.status === "done",
                  );
                  const avg = langScans.length
                    ? Math.round(
                        langScans.reduce((a, s) => a + (s.overall_score ?? 0), 0) /
                          langScans.length,
                      )
                    : null;
                  const langIssues = issues.filter((i) =>
                    scans.find((s) => s.id === i.scan_id && s.language === l.name),
                  ).length;
                  return (
                    <tr key={l.name}>
                      <td className="px-4 py-2 font-mono">{l.name}</td>
                      <td className="px-4 py-2 text-right font-mono">{l.value}</td>
                      <td className="px-4 py-2 text-right font-mono">{avg ?? "—"}</td>
                      <td className="px-4 py-2 text-right font-mono">{langIssues}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "critical" | "high" | "medium" | "low";
}) {
  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{label}</div>
        {tone && <SeverityBadge severity={tone} />}
      </div>
      <div className="mt-1 font-mono text-2xl">{value}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <h3 className="mb-3 text-sm font-medium text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function Empty() {
  return (
    <div className="grid h-[260px] place-items-center text-sm text-muted-foreground">
      No data yet.
    </div>
  );
}
