import { createFileRoute, Outlet, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Loader2, LogOut, LayoutDashboard, Plus, Github } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

function AuthLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Brand />
            <nav className="hidden items-center gap-1 text-sm text-muted-foreground sm:flex">
              <Link
                to="/dashboard"
                className="rounded-md px-3 py-1.5 hover:bg-surface hover:text-foreground [&.active]:bg-surface [&.active]:text-foreground"
                activeProps={{ className: "active" }}
              >
                <LayoutDashboard className="mr-1 inline h-3.5 w-3.5" />
                Dashboard
              </Link>
              <Link
                to="/scan/new"
                className="rounded-md px-3 py-1.5 hover:bg-surface hover:text-foreground [&.active]:bg-surface [&.active]:text-foreground"
                activeProps={{ className: "active" }}
              >
                <Plus className="mr-1 inline h-3.5 w-3.5" />
                New scan
              </Link>
              <Link
                to="/github"
                className="rounded-md px-3 py-1.5 hover:bg-surface hover:text-foreground [&.active]:bg-surface [&.active]:text-foreground"
                activeProps={{ className: "active" }}
              >
                <Github className="mr-1 inline h-3.5 w-3.5" />
                GitHub
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">{user.email}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/auth" });
              }}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
