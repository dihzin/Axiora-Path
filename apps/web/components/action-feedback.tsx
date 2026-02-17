"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export type ActionFeedbackState = "idle" | "loading" | "success" | "error";

type ActionFeedbackProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  state?: ActionFeedbackState;
  loadingLabel?: string;
  children: ReactNode;
};

export function ActionFeedback({
  state = "idle",
  loadingLabel,
  children,
  className,
  disabled,
  ...props
}: ActionFeedbackProps) {
  return (
    <button
      {...props}
      aria-busy={state === "loading"}
      disabled={disabled || state === "loading"}
      className={cn(
        "inline-flex items-center justify-center gap-2 transition will-change-transform",
        state === "success" && "action-feedback-success",
        state === "error" && "action-feedback-error",
        className,
      )}
    >
      {state === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {state === "loading" && loadingLabel ? loadingLabel : children}
    </button>
  );
}
