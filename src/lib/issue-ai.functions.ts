import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const ExplainSchema = z.object({
  why_exists: z.string(),
  beginner_explanation: z.string(),
  security_risk: z.string(),
  real_world_impact: z.string(),
  prevention_tips: z.array(z.string()),
});

const FixSchema = z.object({
  fixed_code: z.string(),
  explanation: z.string(),
  changed_lines: z.array(z.number()),
});

export type ExplainResult = z.infer<typeof ExplainSchema>;
export type FixResult = z.infer<typeof FixSchema>;

async function loadIssue(supabase: ReturnType<typeof requireSupabaseAuth> extends never ? never : any, issueId: string) {
  const { data, error } = await supabase
    .from("scan_issues")
    .select("*, scans(language, source_code)")
    .eq("id", issueId)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Issue not found");
  return data;
}

export const explainIssue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ issue_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<ExplainResult> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const issue = await loadIssue(context.supabase, data.issue_id);
    const gateway = createLovableAiGatewayProvider(key);

    const { output } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system:
        "You are a security educator. Explain vulnerabilities in plain, beginner-friendly language. Be concrete and non-repetitive across fields.",
      output: Output.object({ schema: ExplainSchema }),
      prompt: `Language: ${issue.scans?.language ?? "unknown"}
Issue title: ${issue.title}
Severity: ${issue.severity}
Category: ${issue.category}
Description: ${issue.description ?? ""}
Affected code:
\`\`\`
${issue.code_snippet ?? "(no snippet)"}
\`\`\`

Explain:
- why_exists: root cause in the code
- beginner_explanation: 2-3 sentences a junior dev would understand
- security_risk: what an attacker can do
- real_world_impact: business/user impact with a concrete example
- prevention_tips: 3-5 actionable bullet points`,
    });

    return output;
  });

export const generateFix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ issue_id: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<FixResult & { original: string }> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const issue = await loadIssue(context.supabase, data.issue_id);
    const original = issue.code_snippet ?? "";
    const gateway = createLovableAiGatewayProvider(key);

    const { output } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system:
        "You are a senior secure-coding engineer. Rewrite the given snippet to fix the vulnerability. Preserve behavior and style. Return only the corrected snippet, an explanation, and the 1-indexed line numbers (in the FIXED code) that changed.",
      output: Output.object({ schema: FixSchema }),
      prompt: `Language: ${issue.scans?.language ?? "unknown"}
Issue: ${issue.title}
Severity: ${issue.severity}
Description: ${issue.description ?? ""}

Original snippet:
\`\`\`
${original}
\`\`\``,
    });

    return { ...output, original };
  });
