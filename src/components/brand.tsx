import { ShieldCheck } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function Brand({ className = "" }: { className?: string }) {
  return (
    <Link to="/" className={`flex items-center gap-2 ${className}`}>
      <div className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br from-primary to-success text-primary-foreground">
        <ShieldCheck className="h-4 w-4" />
      </div>
      <span className="font-semibold tracking-tight">
        AI Code <span className="text-gradient">Guardian</span>
      </span>
    </Link>
  );
}
