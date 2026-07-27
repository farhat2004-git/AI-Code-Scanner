import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MessageSquare, Send, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export const ISSUE_STATUSES = [
  { value: "open", label: "Open", tone: "text-sev-high border-sev-high/40 bg-sev-high/10" },
  {
    value: "in_progress",
    label: "In progress",
    tone: "text-sev-medium border-sev-medium/40 bg-sev-medium/10",
  },
  { value: "resolved", label: "Resolved", tone: "text-success border-success/40 bg-success/10" },
  {
    value: "wont_fix",
    label: "Won't fix",
    tone: "text-muted-foreground border-border bg-surface-2",
  },
] as const;

export function statusMeta(status: string | null | undefined) {
  return ISSUE_STATUSES.find((s) => s.value === (status ?? "open")) ?? ISSUE_STATUSES[0];
}

export function IssueStatusBadge({ status }: { status: string | null | undefined }) {
  const m = statusMeta(status);
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] ${m.tone}`}>{m.label}</span>
  );
}

export function IssueStatusControl({
  issueId,
  scanId,
  status,
  canWrite,
  userId,
}: {
  issueId: string;
  scanId: string;
  status: string | null | undefined;
  canWrite: boolean;
  userId: string | undefined;
}) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async (next: string) => {
      const { error } = await supabase
        .from("scan_issues")
        .update({ status: next, status_by: userId ?? null, status_at: new Date().toISOString() })
        .eq("id", issueId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scan-issues", scanId] });
      toast.success("Status updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canWrite) return <IssueStatusBadge status={status} />;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {ISSUE_STATUSES.map((s) => {
        const active = (status ?? "open") === s.value;
        return (
          <button
            key={s.value}
            type="button"
            disabled={m.isPending}
            onClick={() => m.mutate(s.value)}
            className={`rounded border px-2 py-0.5 text-[11px] transition-colors ${
              active ? s.tone : "border-border text-muted-foreground hover:bg-surface-2"
            }`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

type CommentRow = {
  id: string;
  body: string;
  user_id: string;
  created_at: string;
};

export function IssueComments({
  issueId,
  scanId,
  userId,
  canComment,
  names,
}: {
  issueId: string;
  scanId: string;
  userId: string | undefined;
  canComment: boolean;
  names: Record<string, string>;
}) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");

  const commentsQ = useQuery({
    queryKey: ["issue-comments", issueId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("issue_comments")
        .select("id, body, user_id, created_at")
        .eq("issue_id", issueId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CommentRow[];
    },
  });

  const addM = useMutation({
    mutationFn: async () => {
      const text = body.trim();
      if (!text) return;
      const { error } = await supabase
        .from("issue_comments")
        .insert({ issue_id: issueId, scan_id: scanId, user_id: userId!, body: text });
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["issue-comments", issueId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delM = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("issue_comments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["issue-comments", issueId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const comments = commentsQ.data ?? [];

  return (
    <div className="rounded-md border border-border bg-surface-2/40 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <MessageSquare className="h-3.5 w-3.5" />
        Comments {comments.length > 0 && <span>({comments.length})</span>}
      </div>

      {commentsQ.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : comments.length === 0 ? (
        <p className="text-xs text-muted-foreground">No comments yet.</p>
      ) : (
        <ul className="space-y-2">
          {comments.map((c) => (
            <li key={c.id} className="rounded-md border border-border bg-surface px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">
                  {names[c.user_id] ?? "Teammate"}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </span>
                </span>
                {c.user_id === userId && (
                  <button
                    type="button"
                    onClick={() => delM.mutate(c.id)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Delete comment"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      {canComment && (
        <div className="mt-3 flex items-end gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment…"
            rows={2}
            className="min-h-[38px] resize-y bg-surface text-sm"
          />
          <Button
            type="button"
            size="sm"
            disabled={!body.trim() || addM.isPending}
            onClick={() => addM.mutate()}
          >
            {addM.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
