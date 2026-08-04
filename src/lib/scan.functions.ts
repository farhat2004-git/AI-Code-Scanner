import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
const CATEGORIES = [
  "security",
  "bug",
  "performance",
  "quality",
  "style",
  "maintainability",
] as const;

const num = z.number().nullish();

const AnalysisSchema = z.object({
  summary: z.string().nullish(),
  overall_score: num,
  security_score: num,
  quality_score: num,
  performance_score: num,
  maintainability_score: num,
  issues: z
    .array(
      z.object({
        title: z.string(),
        category: z.string().nullish(),
        severity: z.string().nullish(),
        description: z.string().nullish(),
        why_dangerous: z.string().nullish(),
        line_start: num,
        line_end: num,
        cvss: num,
        fix_explanation: z.string().nullish(),
        fixed_code: z.string().nullish(),
        code_snippet: z.string().nullish(),
      }),
    )
    .nullish(),
});

type RawIssue = NonNullable<z.infer<typeof AnalysisSchema>["issues"]>[number];

function normSeverity(v: string | null | undefined): (typeof SEVERITIES)[number] {
  const s = (v ?? "").toLowerCase();
  return (SEVERITIES as readonly string[]).includes(s)
    ? (s as (typeof SEVERITIES)[number])
    : "info";
}

function normCategory(v: string | null | undefined): (typeof CATEGORIES)[number] {
  const s = (v ?? "").toLowerCase();
  return (CATEGORIES as readonly string[]).includes(s)
    ? (s as (typeof CATEGORIES)[number])
    : "quality";
}

function clampScore(v: number | null | undefined, fallback = 70): number {
  const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

const SYSTEM_PROMPT = `You are AI Code Guardian, an expert security and code-quality reviewer.
You analyze source code and produce a structured report. Rules:
- Detect security vulnerabilities (SQL injection, XSS, command injection, hardcoded secrets, weak crypto, path traversal, SSRF, CSRF, insecure cookies, broken auth, sensitive data exposure, OWASP Top 10).
- Detect bugs, logic errors, null risks, race conditions, resource leaks, dead code, unused vars, bad error handling, missing input validation.
- Detect performance issues (nested loops, O(n^2) hotspots, expensive ops in loops).
- Score 0-100. Be strict but fair. A pristine file scores >90; a file with a critical vuln scores <50.
- Provide fixed_code for as many issues as reasonable. Keep snippets short (< 40 lines).
- Explain in plain English.`;

export const runScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        title: z.string().min(1).max(200),
        language: z.string().min(1).max(40),
        source_code: z.string().min(1).max(60_000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const { data: scan, error: insertErr } = await supabase
      .from("scans")
      .insert({
        user_id: userId,
        title: data.title,
        language: data.language,
        source_code: data.source_code,
        status: "running",
      })
      .select()
      .single();
    if (insertErr || !scan) throw new Error(insertErr?.message ?? "Failed to create scan");

    try {
      const gateway = createLovableAiGatewayProvider(key);
      const numbered = data.source_code
        .split("\n")
        .map((l, i) => `${String(i + 1).padStart(4, " ")}  ${l}`)
        .join("\n");

      const { output: a } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        system: SYSTEM_PROMPT,
        output: Output.object({ schema: AnalysisSchema }),
        prompt: `Language: ${data.language}\n\nCode (line-numbered):\n\`\`\`\n${numbered}\n\`\`\``,
      });

      const issues: RawIssue[] = a.issues ?? [];
      const overall = clampScore(a.overall_score);
      const security = clampScore(a.security_score);
      const quality = clampScore(a.quality_score);
      const perf = clampScore(a.performance_score);
      const maint = clampScore(a.maintainability_score);

      await supabase
        .from("scans")
        .update({
          status: "done",
          summary: a.summary ?? null,
          overall_score: overall,
          security_score: security,
          quality_score: quality,
          performance_score: perf,
          maintainability_score: maint,
          scores: {
            overall,
            security,
            quality,
            performance: perf,
            maintainability: maint,
          },
        })
        .eq("id", scan.id);

      if (issues.length > 0) {
        await supabase.from("scan_issues").insert(
          issues.map((i) => ({
            scan_id: scan.id,
            user_id: userId,
            category: normCategory(i.category),
            severity: normSeverity(i.severity),
            title: i.title,
            description: i.description ?? null,
            why_dangerous: i.why_dangerous ?? null,
            line_start: i.line_start ?? null,
            line_end: i.line_end ?? null,
            cvss: i.cvss ?? null,
            fix_explanation: i.fix_explanation ?? null,
            fixed_code: i.fixed_code ?? null,
            code_snippet: i.code_snippet ?? null,
          })),
        );
      }

      const criticals = issues.filter((i) => normSeverity(i.severity) === "critical").length;
      const highs = issues.filter((i) => normSeverity(i.severity) === "high").length;
      const notifType = criticals > 0 ? "critical" : highs > 0 ? "warning" : "success";
      const parts: string[] = [];
      if (criticals) parts.push(`${criticals} critical`);
      if (highs) parts.push(`${highs} high`);
      const summary = parts.length
        ? `Found ${parts.join(", ")} · score ${overall}/100`
        : `Clean scan · score ${overall}/100`;

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("notifications").insert({
        user_id: userId,
        title: `Scan complete: ${data.title}`,
        body: summary,
        type: notifType,
        link: `/scan/${scan.id}`,
      });


      return { scan_id: scan.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await supabase
        .from("scans")
        .update({ status: "error", error: message })
        .eq("id", scan.id);
      throw new Error(message);
    }
  });
