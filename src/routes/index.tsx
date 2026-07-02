import { createFileRoute, Link } from "@tanstack/react-router";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  Bug,
  Zap,
  FileCode2,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  GitBranch,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

const LANGS = ["Python", "JavaScript", "TypeScript", "Java", "Go", "Rust", "C", "C++", "PHP"];

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Brand />
          <nav className="flex items-center gap-2">
            <Link to="/auth">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link to="/auth">
              <Button size="sm">Get started</Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="absolute inset-0 bg-grid opacity-40" />
        <div
          className="absolute inset-0"
          style={{ background: "var(--gradient-hero)" }}
        />
        <div className="relative mx-auto max-w-6xl px-4 py-24 text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" />
            Powered by frontier AI models
          </div>
          <h1 className="mx-auto max-w-3xl text-balance text-5xl font-bold tracking-tight sm:text-6xl">
            Ship code the <span className="text-gradient">attackers can't break</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Paste any file. AI Code Guardian finds security vulnerabilities, bugs, and quality
            issues — with plain-English explanations and one-click fixes.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/auth">
              <Button size="lg" className="gap-2">
                Scan your code <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <a
              href="#features"
              className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-surface px-5 text-sm font-medium hover:bg-surface-2"
            >
              How it works
            </a>
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-2">
            {LANGS.map((l) => (
              <span
                key={l}
                className="rounded-md border border-border bg-surface/60 px-2.5 py-1 text-xs text-muted-foreground"
              >
                {l}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section id="features" className="mx-auto max-w-6xl px-4 py-20">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: ShieldCheck,
              title: "Security scanner",
              desc: "OWASP Top 10, injection flaws, hardcoded secrets, weak crypto, path traversal, CSRF and more with CVSS scoring.",
            },
            {
              icon: Bug,
              title: "Bug & logic detection",
              desc: "Null risks, race conditions, resource leaks, dead code, unused vars, missing error handling.",
            },
            {
              icon: Zap,
              title: "Performance analysis",
              desc: "Spot nested loops, O(n²) hotspots, expensive ops in loops. Get complexity estimates.",
            },
            {
              icon: FileCode2,
              title: "AI fix generator",
              desc: "Each issue includes a corrected snippet and an explanation of why the fix is safer.",
            },
            {
              icon: CheckCircle2,
              title: "Quality scoring",
              desc: "Overall, security, quality, performance and maintainability scores out of 100.",
            },
            {
              icon: GitBranch,
              title: "Scan history",
              desc: "Every scan is stored. Review, revisit, and track your code quality over time.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-lg border border-border bg-surface p-5 transition-colors hover:border-primary/40"
            >
              <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-md bg-surface-2 text-primary">
                <f.icon className="h-4 w-4" />
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} AI Code Guardian</span>
          <span>Built with Lovable Cloud + Lovable AI</span>
        </div>
      </footer>
    </div>
  );
}
