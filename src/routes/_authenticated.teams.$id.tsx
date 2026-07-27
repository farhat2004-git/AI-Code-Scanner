import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScorePill, SeverityBadge } from "@/components/scan-ui";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  FileCode2,
  Loader2,
  Mail,
  Plus,
  Trash2,
  Users,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/teams/$id")({
  head: () => ({
    meta: [
      { title: "Team workspace — AI Code Guardian" },
      {
        name: "description",
        content:
          "Manage team members and roles, invite teammates, assign scans and track issue progress in a shared dashboard.",
      },
      { property: "og:title", content: "Team workspace — AI Code Guardian" },
      {
        property: "og:description",
        content: "Shared scan dashboard with role-based access for your team.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamDetail,
});

type Role = "admin" | "developer" | "viewer";
const ROLES: Role[] = ["admin", "developer", "viewer"];
const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  developer: "Developer",
  viewer: "Viewer",
};

function TeamDetail() {
  const { id } = useParams({ from: "/_authenticated/teams/$id" });
  const { user } = useAuth();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("developer");

  const teamQ = useQuery({
    queryKey: ["team", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const membersQ = useQuery({
    queryKey: ["team-members", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("id, user_id, role, created_at")
        .eq("team_id", id);
      if (error) throw error;
      const ids = (data ?? []).map((m) => m.user_id);
      const profiles = ids.length
        ? (
            await supabase
              .from("profiles")
              .select("id, email, display_name")
              .in("id", ids)
          ).data ?? []
        : [];
      const byId = new Map(profiles.map((p) => [p.id, p]));
      return (data ?? []).map((m) => ({
        ...m,
        email: byId.get(m.user_id)?.email ?? null,
        name: byId.get(m.user_id)?.display_name ?? null,
      }));
    },
  });

  const invitesQ = useQuery({
    queryKey: ["team-invites", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_invites")
        .select("id, email, role, status")
        .eq("team_id", id)
        .eq("status", "pending");
      if (error) throw error;
      return data ?? [];
    },
  });

  const scansQ = useQuery({
    queryKey: ["team-scans", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scans")
        .select("*")
        .eq("team_id", id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const members = membersQ.data ?? [];
  const myRole = members.find((m) => m.user_id === user?.id)?.role as Role | undefined;
  const isAdmin = myRole === "admin";
  const canWrite = myRole === "admin" || myRole === "developer";
  const nameFor = (uid: string | null) => {
    if (!uid) return "Unassigned";
    const m = members.find((x) => x.user_id === uid);
    return m?.name ?? m?.email ?? "Member";
  };

  const inviteM = useMutation({
    mutationFn: async () => {
      const e = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error("Enter a valid email address");
      const { error } = await supabase
        .from("team_invites")
        .insert({ team_id: id, email: e, role: inviteRole, invited_by: user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      setEmail("");
      qc.invalidateQueries({ queryKey: ["team-invites", id] });
      toast.success("Invitation created — they'll see it on their Teams page");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const roleM = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: Role }) => {
      const { error } = await supabase.from("team_members").update({ role }).eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-members", id] });
      toast.success("Role updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeM = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from("team_members").delete().eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-members", id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelInviteM = useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase.from("team_invites").delete().eq("id", inviteId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-invites", id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const assignM = useMutation({
    mutationFn: async ({ scanId, uid }: { scanId: string; uid: string | null }) => {
      const { error } = await supabase
        .from("scans")
        .update({ assigned_to: uid })
        .eq("id", scanId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-scans", id] });
      toast.success("Assignment updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (teamQ.isLoading) {
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!teamQ.data) return <div className="text-sm text-muted-foreground">Team not found.</div>;

  const scans = scansQ.data ?? [];
  const done = scans.filter((s) => s.status === "done");
  const avg = done.length
    ? Math.round(done.reduce((a, s) => a + (s.overall_score ?? 0), 0) / done.length)
    : null;

  return (
    <div className="space-y-8">
      <Link
        to="/teams"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> All teams
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">{teamQ.data.name}</h1>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {members.length} member{members.length === 1 ? "" : "s"} · you are{" "}
            {myRole ? ROLE_LABEL[myRole] : "—"}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Shared scans" value={scans.length} />
        <Stat label="Completed" value={done.length} />
        <Stat label="Avg. score" value={avg ?? "—"} suffix={avg != null ? "/100" : ""} />
      </div>

      {/* Members */}
      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Members</h2>
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="grid h-8 w-8 place-items-center rounded-md bg-surface-2 text-xs uppercase text-primary">
                {(m.name ?? m.email ?? "?").slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {m.name ?? m.email ?? "Member"}
                  {m.user_id === user?.id && (
                    <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">{m.email}</div>
              </div>
              {isAdmin && m.user_id !== teamQ.data.owner_id ? (
                <select
                  value={m.role}
                  onChange={(e) =>
                    roleM.mutate({ memberId: m.id, role: e.target.value as Role })
                  }
                  className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                  {ROLE_LABEL[m.role as Role] ?? m.role}
                </span>
              )}
              {isAdmin && m.user_id !== teamQ.data.owner_id && (
                <button
                  type="button"
                  onClick={() => removeM.mutate(m.id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remove member"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Invites */}
      {isAdmin && (
        <div className="rounded-md border border-border bg-surface p-4">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <ShieldCheck className="h-4 w-4" /> Invite a member
          </h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
              className="bg-surface-2"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Role)}
              className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            <Button
              className="gap-2"
              disabled={inviteM.isPending}
              onClick={() => inviteM.mutate()}
            >
              {inviteM.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Invite
            </Button>
          </div>

          {(invitesQ.data ?? []).length > 0 && (
            <ul className="mt-3 space-y-1">
              {(invitesQ.data ?? []).map((i) => (
                <li
                  key={i.id}
                  className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs"
                >
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="flex-1 truncate">{i.email}</span>
                  <span className="uppercase text-muted-foreground">
                    {ROLE_LABEL[i.role as Role]}
                  </span>
                  <button
                    type="button"
                    onClick={() => cancelInviteM.mutate(i.id)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Cancel invite"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Shared dashboard */}
      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Shared scans</h2>
        {scansQ.isLoading ? (
          <div className="rounded-md border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : scans.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-surface p-10 text-center text-sm text-muted-foreground">
            No scans shared with this team yet. Open a scan report and share it from there.
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
            {scans.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="grid h-9 w-9 place-items-center rounded-md bg-surface-2 text-primary">
                  <FileCode2 className="h-4 w-4" />
                </div>
                <Link
                  to="/scan/$id"
                  params={{ id: s.id }}
                  className="min-w-0 flex-1 hover:underline"
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{s.title}</span>
                    <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                      {s.language}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })} ·{" "}
                    {nameFor(s.assigned_to)}
                  </div>
                </Link>
                {canWrite && (
                  <select
                    value={s.assigned_to ?? ""}
                    onChange={(e) =>
                      assignM.mutate({ scanId: s.id, uid: e.target.value || null })
                    }
                    className="rounded-md border border-border bg-surface-2 px-2 py-1 text-xs"
                  >
                    <option value="">Unassigned</option>
                    {members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.name ?? m.email ?? "Member"}
                      </option>
                    ))}
                  </select>
                )}
                {s.status === "done" ? (
                  <ScorePill score={s.overall_score ?? 0} />
                ) : s.status === "error" ? (
                  <SeverityBadge severity="high">Error</SeverityBadge>
                ) : (
                  <SeverityBadge severity="info">Running…</SeverityBadge>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number | string;
  suffix?: string;
}) {
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
