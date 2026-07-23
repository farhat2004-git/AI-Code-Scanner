import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;

// ---------- Secret detection (regex) ----------
type SecretHit = {
  kind: string;
  severity: (typeof SEVERITIES)[number];
  line: number;
  match: string;
  suggestion: string;
};

const SECRET_RULES: {
  kind: string;
  severity: SecretHit["severity"];
  regex: RegExp;
  suggestion: string;
}[] = [
  {
    kind: "AWS Access Key ID",
    severity: "critical",
    regex: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g,
    suggestion: "Rotate immediately in AWS IAM. Move to env vars or AWS Secrets Manager.",
  },
  {
    kind: "AWS Secret Access Key",
    severity: "critical",
    regex: /aws(.{0,20})?['"][0-9a-zA-Z/+]{40}['"]/gi,
    suggestion: "Rotate the key and load from AWS SDK default credentials chain.",
  },
  {
    kind: "GitHub Personal Access Token",
    severity: "critical",
    regex: /\bghp_[A-Za-z0-9]{36,}\b/g,
    suggestion: "Revoke via GitHub → Settings → Developer settings. Use fine-grained tokens in secrets.",
  },
  {
    kind: "GitHub OAuth Token",
    severity: "critical",
    regex: /\bgho_[A-Za-z0-9]{36,}\b/g,
    suggestion: "Revoke and re-issue via OAuth flow; never commit tokens.",
  },
  {
    kind: "GitHub App Token",
    severity: "critical",
    regex: /\b(ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b/g,
    suggestion: "Revoke immediately and rotate the GitHub App installation.",
  },
  {
    kind: "Google/Firebase API Key",
    severity: "high",
    regex: /\bAIza[0-9A-Za-z_\-]{35}\b/g,
    suggestion: "Restrict the key by referrer/IP in Google Cloud Console, or rotate.",
  },
  {
    kind: "Firebase Cloud Messaging Key",
    severity: "high",
    regex: /\bAAAA[A-Za-z0-9_\-]{7}:[A-Za-z0-9_\-]{140,}\b/g,
    suggestion: "Rotate the FCM server key and store server-side only.",
  },
  {
    kind: "Slack Token",
    severity: "high",
    regex: /\bxox[baprs]-[0-9A-Za-z\-]{10,}\b/g,
    suggestion: "Revoke in Slack admin and reissue with least privilege.",
  },
  {
    kind: "Stripe Secret Key",
    severity: "critical",
    regex: /\bsk_(live|test)_[0-9A-Za-z]{20,}\b/g,
    suggestion: "Roll the key in Stripe Dashboard immediately.",
  },
  {
    kind: "OpenAI API Key",
    severity: "high",
    regex: /\bsk-[A-Za-z0-9_\-]{20,}\b/g,
    suggestion: "Revoke on platform.openai.com and store in env vars.",
  },
  {
    kind: "JWT",
    severity: "medium",
    regex: /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/g,
    suggestion: "If this is a signing secret or session token, rotate and store server-side.",
  },
  {
    kind: "Private Key Block",
    severity: "critical",
    regex: /-----BEGIN (RSA|EC|DSA|OPENSSH|PGP|PRIVATE) [A-Z ]*KEY-----/g,
    suggestion: "Remove from source, rotate the key, add to .gitignore + secret manager.",
  },
  {
    kind: "Database Connection String",
    severity: "critical",
    regex: /\b(postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s"'`<>]{3,}:[^\s"'`<>@]+@[^\s"'`<>]+/gi,
    suggestion: "Rotate the DB password and read the URL from an env var / secret manager.",
  },
  {
    kind: "Generic Password Assignment",
    severity: "medium",
    regex: /(password|passwd|pwd)\s*[:=]\s*['"][^'"\s]{6,}['"]/gi,
    suggestion: "Never hardcode passwords. Load from environment variables or a vault.",
  },
  {
    kind: "Generic API Key Assignment",
    severity: "medium",
    regex: /(api[_-]?key|secret|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/gi,
    suggestion: "Move to environment variables; don't commit to source control.",
  },
];

function scanSecrets(text: string): SecretHit[] {
  const hits: SecretHit[] = [];
  const lines = text.split("\n");
  for (const rule of SECRET_RULES) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // reset lastIndex for global regex
      rule.regex.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = rule.regex.exec(line)) !== null) {
        const raw = m[0];
        hits.push({
          kind: rule.kind,
          severity: rule.severity,
          line: i + 1,
          match: raw.length > 12 ? raw.slice(0, 6) + "…" + raw.slice(-4) : "***",
          suggestion: rule.suggestion,
        });
        if (!rule.regex.global) break;
      }
    }
  }
  return hits;
}

// ---------- Manifest detection ----------
function detectManifest(filename: string, content: string) {
  const n = filename.toLowerCase();
  if (n.endsWith("package.json")) return "npm";
  if (n.endsWith("requirements.txt") || n.endsWith("pipfile") || n.endsWith("pyproject.toml"))
    return "pip";
  if (n.endsWith("pom.xml")) return "maven";
  if (n.endsWith("build.gradle") || n.endsWith("build.gradle.kts")) return "gradle";
  if (n.endsWith("go.mod")) return "go";
  if (n.endsWith("cargo.toml")) return "cargo";
  if (n.endsWith("gemfile")) return "rubygems";
  if (n.endsWith("composer.json")) return "composer";
  // heuristic fallback by content
  if (/"dependencies"\s*:/.test(content)) return "npm";
  if (/^\s*[a-zA-Z0-9_\-]+==/m.test(content)) return "pip";
  if (/<dependency>/.test(content)) return "maven";
  if (/^module\s+/m.test(content)) return "go";
  if (/^\[dependencies\]/m.test(content)) return "cargo";
  return "unknown";
}

// ---------- AI schema ----------
const DepAnalysis = z.object({
  ecosystem: z.string(),
  risk_score: z.number(), // 0-100 (higher = worse)
  summary: z.string(),
  dependencies: z.array(
    z.object({
      name: z.string(),
      version: z.string().nullable(),
      severity: z.enum(SEVERITIES),
      cve: z.string().nullable(),
      issue: z.string(),
      recommendation: z.string(),
      safe_version: z.string().nullable(),
    }),
  ),
});

const SYSTEM = `You are a dependency security auditor. Given a package manifest, list KNOWN vulnerable versions (with CVE if you know it), outdated versions with widely-known security advisories, and abandoned/malicious packages. Be conservative — if you're not confident a version is vulnerable, mark severity "info" and say "no known advisory". risk_score: 0 = pristine, 100 = multiple critical CVEs.`;

export const scanDependencies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        filename: z.string().min(1).max(200),
        content: z.string().min(1).max(60_000),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const ecosystem = detectManifest(data.filename, data.content);
    const secrets = scanSecrets(data.content);

    let dep: z.infer<typeof DepAnalysis> = {
      ecosystem,
      risk_score: 0,
      summary: "No dependency manifest detected.",
      dependencies: [],
    };

    if (ecosystem !== "unknown") {
      const gateway = createLovableAiGatewayProvider(key);
      const { output } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        system: SYSTEM,
        output: Output.object({ schema: DepAnalysis }),
        prompt: `Ecosystem: ${ecosystem}\nFile: ${data.filename}\n\n\`\`\`\n${data.content}\n\`\`\``,
      });
      dep = output;
    }

    return { ecosystem, dep, secrets };
  });

export const scanSecretsOnly = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ content: z.string().min(1).max(200_000) }).parse(data),
  )
  .handler(async ({ data }) => ({ secrets: scanSecrets(data.content) }));
