import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type StatusNoticeTone = "info" | "success" | "warning" | "error";

type StatusNoticeProps = HTMLAttributes<HTMLDivElement> & {
  tone?: StatusNoticeTone;
};

const TONE_STYLES: Record<StatusNoticeTone, string> = {
  info: "border-secondary/35 bg-secondary/10 text-foreground",
  success: "border-primary/35 bg-primary/10 text-foreground",
  warning: "border-accent/40 bg-accent/15 text-foreground",
  error: "border-destructive/35 bg-destructive/10 text-foreground",
};

const TONE_ICON: Record<StatusNoticeTone, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  error: AlertCircle,
};

export function StatusNotice({ tone = "info", className, children, ...props }: StatusNoticeProps) {
  const Icon = TONE_ICON[tone];
  return (
    <div
      className={cn(
        "inline-flex w-full items-start gap-2 rounded-2xl border px-3 py-2 text-sm font-medium",
        TONE_STYLES[tone],
        className,
      )}
      {...props}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
