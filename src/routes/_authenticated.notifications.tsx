import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  AlertTriangle,
  ShieldAlert,
  Info,
  CircleCheck,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — AI Code Guardian" },
      {
        name: "description",
        content:
          "Full history of scan completion alerts and system notifications with read/unread and filtering.",
      },
    ],
  }),
  component: NotificationsPage,
});

function typeIcon(type: string) {
  switch (type) {
    case "critical":
      return <ShieldAlert className="h-4 w-4 text-danger" />;
    case "warning":
      return <AlertTriangle className="h-4 w-4 text-warning" />;
    case "success":
      return <CircleCheck className="h-4 w-4 text-success" />;
    default:
      return <Info className="h-4 w-4 text-muted-foreground" />;
  }
}

type Filter = "all" | "unread" | "read";

function NotificationsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");

  const q = useQuery({
    queryKey: ["notifications-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const all = q.data ?? [];
  const list =
    filter === "unread"
      ? all.filter((n) => !n.read_at)
      : filter === "read"
        ? all.filter((n) => n.read_at)
        : all;

  const unread = all.filter((n) => !n.read_at).length;

  async function markRead(id: string) {
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    qc.invalidateQueries({ queryKey: ["notifications-all"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }
  async function markAllRead() {
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
    qc.invalidateQueries({ queryKey: ["notifications-all"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }
  async function del(id: string) {
    await supabase.from("notifications").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["notifications-all"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }
  async function clearAll() {
    if (!confirm("Delete all notifications?")) return;
    await supabase.from("notifications").delete().not("id", "is", null);
    qc.invalidateQueries({ queryKey: ["notifications-all"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    toast.success("Cleared");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">
            {unread > 0
              ? `${unread} unread of ${all.length} total`
              : `${all.length} notification${all.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unread > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead} className="gap-1.5">
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </Button>
          )}
          {all.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAll} className="gap-1.5">
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>
      </div>

      <div className="inline-flex rounded-md border border-border bg-surface p-0.5 text-xs">
        {(["all", "unread", "read"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded px-3 py-1.5 capitalize transition-colors ${
              filter === f
                ? "bg-surface-2 text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {q.isLoading ? (
        <div className="rounded-md border border-border bg-surface p-10 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      ) : list.length === 0 ? (
        <div className="rounded-md border border-dashed border-border bg-surface p-10 text-center">
          <Bell className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            {filter === "unread"
              ? "No unread notifications."
              : filter === "read"
                ? "No read notifications."
                : "No notifications yet. Run a scan to see one here."}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
          {list.map((n) => {
            const inner = (
              <div className="flex items-start gap-3 px-4 py-3">
                <div className="mt-0.5">{typeIcon(n.type)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm ${!n.read_at ? "font-medium" : ""}`}>
                      {n.title}
                    </span>
                    {!n.read_at && (
                      <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium uppercase text-primary">
                        New
                      </span>
                    )}
                  </div>
                  {n.body && (
                    <div className="mt-0.5 text-xs text-muted-foreground">{n.body}</div>
                  )}
                  <div className="mt-1 text-[10px] uppercase text-muted-foreground">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {!n.read_at && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        markRead(n.id);
                      }}
                      className="rounded p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                      title="Mark as read"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      del(n.id);
                    }}
                    className="rounded p-1.5 text-muted-foreground hover:bg-surface-2 hover:text-danger"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
            return (
              <li key={n.id} className="hover:bg-surface-2">
                {n.link ? (
                  <Link to={n.link} onClick={() => !n.read_at && markRead(n.id)}>
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
