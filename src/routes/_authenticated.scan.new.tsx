import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { runScan } from "@/lib/scan.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Upload, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/scan/new")({
  head: () => ({ meta: [{ title: "New scan — AI Code Guardian" }] }),
  component: NewScan,
});

const LANGUAGES = [
  "python",
  "javascript",
  "typescript",
  "java",
  "go",
  "rust",
  "c",
  "cpp",
  "php",
];

function NewScan() {
  const navigate = useNavigate();
  const scan = useServerFn(runScan);
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState("python");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500_000) {
      toast.error("File too large (max 500KB).");
      return;
    }
    const text = await file.text();
    setCode(text);
    if (!title) setTitle(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase();
    const map: Record<string, string> = {
      py: "python",
      js: "javascript",
      jsx: "javascript",
      ts: "typescript",
      tsx: "typescript",
      java: "java",
      go: "go",
      rs: "rust",
      c: "c",
      cpp: "cpp",
      cc: "cpp",
      h: "c",
      php: "php",
    };
    if (ext && map[ext]) setLanguage(map[ext]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) {
      toast.error("Paste or upload some code first.");
      return;
    }
    setLoading(true);
    try {
      const res = await scan({
        data: {
          title: title || "Untitled scan",
          language,
          source_code: code,
        },
      });
      toast.success("Scan complete");
      navigate({ to: "/scan/$id", params: { id: res.scan_id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">New scan</h1>
        <p className="text-sm text-muted-foreground">
          Paste code or upload a file. Analysis usually takes 10–30 seconds.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="e.g. auth.py"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Language</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <Label htmlFor="code">Source code</Label>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <Upload className="h-3.5 w-3.5" />
              Upload file
              <input type="file" className="hidden" onChange={onFile} accept=".py,.js,.jsx,.ts,.tsx,.java,.go,.rs,.c,.cpp,.cc,.h,.php,.txt" />
            </label>
          </div>
          <Textarea
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Paste your code here…"
            className="min-h-[360px] font-mono text-xs"
            spellCheck={false}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {code.length.toLocaleString()} chars · max 60,000
          </p>
        </div>

        <Button type="submit" size="lg" disabled={loading} className="w-full gap-2">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing…
            </>
          ) : (
            <>
              <ShieldCheck className="h-4 w-4" />
              Run scan
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
