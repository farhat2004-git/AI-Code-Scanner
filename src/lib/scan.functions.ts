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

const AnalysisSchema = z.object({
  summary: z.string(),
  overall_score: z.number(),
  security_score: z.number(),
  quality_score: z.number(),
  performance_score: z.number(),
  maintainability_score: z.number(),
  issues: z.array(
    z.object({
      title: z.string(),
      category: z.enum(CATEGORIES),
      severity: z.enum(SEVERITIES),
      description: z.string(),
      why_dangerous: z.string().nullable(),
      line_start: z.number().nullable(),
      line_end: z.number().nullable(),
      cvss: z.number().nullable(),
      fix_explanation: z.string().nullable(),
      fixed_code: z.string().nullable(),
      code_snippet: z.string().nullable(),
    }),
  ),
});

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

      await supabase
        .from("scans")
        .update({
          status: "done",
          summary: a.summary,
          overall_score: Math.round(a.overall_score),
          security_score: Math.round(a.security_score),
          quality_score: Math.round(a.quality_score),
          performance_score: Math.round(a.performance_score),
          maintainability_score: Math.round(a.maintainability_score),
          scores: {
            overall: a.overall_score,
            security: a.security_score,
            quality: a.quality_score,
            performance: a.performance_score,
            maintainability: a.maintainability_score,
          },
        })
        .eq("id", scan.id);

      if (a.issues.length > 0) {
        await supabase.from("scan_issues").insert(
          a.issues.map((i: z.infer<typeof AnalysisSchema>["issues"][number]) => ({
            scan_id: scan.id,
            user_id: userId,
            category: i.category,
            severity: i.severity,
            title: i.title,
            description: i.description,
            why_dangerous: i.why_dangerous,
            line_start: i.line_start,
            line_end: i.line_end,
            cvss: i.cvss,
            fix_explanation: i.fix_explanation,
            fixed_code: i.fixed_code,
            code_snippet: i.code_snippet,
          })),
        );
      }

      const criticals = a.issues.filter((i) => i.severity === "critical").length;
      const highs = a.issues.filter((i) => i.severity === "high").length;
      const notifType = criticals > 0 ? "critical" : highs > 0 ? "warning" : "success";
      const parts: string[] = [];
      if (criticals) parts.push(`${criticals} critical`);
      if (highs) parts.push(`${highs} high`);
      const summary = parts.length
        ? `Found ${parts.join(", ")} · score ${Math.round(a.overall_score)}/100`
        : `Clean scan · score ${Math.round(a.overall_score)}/100`;

      await supabase.from("notifications").insert({
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
