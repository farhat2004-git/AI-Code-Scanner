import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Users, Plus, Mail, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/teams/")({
  head: () => ({
    meta: [
      { title: "Teams — AI Code Guardian" },
      {
        name: "description",
        content:
          "Create teams, invite members with admin, developer or viewer roles, and review shared code scans together.",
      },
      { property: "og:title", content: "Teams — AI Code Guardian" },
      {
        property: "og:description",
        content: "Collaborate on code security scans with role-based team access.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TeamsPage,
});

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  developer: "Developer",
  viewer: "Viewer",
};

function TeamsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState("");

  const teamsQ = useQuery({
    queryKey: ["my-teams"],
    queryFn: async () => {
      const { data: memberships, error } = await supabase
        .from("team_members")
        .select("role, team_id, teams(id, name, owner_id, created_at)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (memberships ?? []).filter((m) => m.teams);
    },
  });

  const invitesQ = useQuery({
    queryKey: ["my-invites"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_invites")
        .select("id, team_id, role, status, teams(name)")
        .eq("status", "pending");
      if (error) throw error;
      return data ?? [];
    },
  });

  const createM = useMutation({
    mutationFn: async () => {
      const teamName = name.trim();
      if (!teamName) throw new Error("Team name is required");
      const { data: team, error } = await supabase
        .from("teams")
        .insert({ name: teamName, owner_id: user!.id })
        .select("id")
        .single();
      if (error) throw error;
      const { error: mErr } = await supabase
        .from("team_members")
        .insert({ team_id: team.id, user_id: user!.id, role: "admin" });
      if (mErr) throw mErr;
      return team.id;
    },
    onSuccess: () => {
      setName("");
      qc.invalidateQueries({ queryKey: ["my-teams"] });
      toast.success("Team created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const acceptM = useMutation({
    mutationFn: async (invite: { id: string; team_id: string; role: string }) => {
      const { error } = await supabase.from("team_members").insert({
        team_id: invite.team_id,
        user_id: user!.id,
        role: invite.role as "admin" | "developer" | "viewer",
      });
      if (error) throw error;
      await supabase.from("team_invites").update({ status: "accepted" }).eq("id", invite.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-teams"] });
      qc.invalidateQueries({ queryKey: ["my-invites"] });
      toast.success("Invitation accepted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const declineM = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("team_invites")
        .update({ status: "declined" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-invites"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const teams = teamsQ.data ?? [];
  const invites = invitesQ.data ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Teams</h1>
        <p className="text-sm text-muted-foreground">
          Share scans, assign work and review findings together.
        </p>
      </div>

      {invites.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Pending invitations</h2>
          {invites.map((i) => (
            <div
              key={i.id}
              className="flex flex-wrap items-center gap-3 rounded-md border border-primary/40 bg-primary/5 px-4 py-3"
            >
              <Mail className="h-4 w-4 text-primary" />
              <span className="flex-1 text-sm">
                <span className="font-medium">
                  {(i.teams as { name: string } | null)?.name ?? "A team"}
                </span>{" "}
                invited you as {ROLE_LABEL[i.role] ?? i.role}
              </span>
              <Button
                size="sm"
                disabled={acceptM.isPending}
                onClick={() => acceptM.mutate({ id: i.id, team_id: i.team_id, role: i.role })}
              >
                Accept
              </Button>
              <Button size="sm" variant="ghost" onClick={() => declineM.mutate(i.id)}>
                Decline
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-md border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Create a team</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Platform Security"
            className="bg-surface-2"
          />
          <Button className="gap-2" disabled={createM.isPending} onClick={() => createM.mutate()}>
            {createM.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Create team
          </Button>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Your teams</h2>
        {teamsQ.isLoading ? (
          <div className="rounded-md border border-border bg-surface p-8 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : teams.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-surface p-10 text-center">
            <Users className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              You're not part of any team yet.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
            {teams.map((m) => {
              const team = m.teams as { id: string; name: string };
              return (
                <li key={team.id}>
                  <Link
                    to="/teams/$id"
                    params={{ id: team.id }}
                    className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-2"
                  >
                    <div className="grid h-9 w-9 place-items-center rounded-md bg-surface-2 text-primary">
                      <Users className="h-4 w-4" />
                    </div>
                    <span className="flex-1 truncate font-medium">{team.name}</span>
                    <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                      {ROLE_LABEL[m.role] ?? m.role}
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
