"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

type PrimaryActionProps = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
};

export function PrimaryAction({ label, onClick, disabled = false, compact = false, className }: PrimaryActionProps) {
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      animate={
        disabled
          ? undefined
          : {
              boxShadow: [
                "0 0 0 1px rgba(251,146,60,0.26), 0 10px 22px rgba(251,146,60,0.22)",
                "0 0 0 1px rgba(251,146,60,0.34), 0 14px 30px rgba(251,146,60,0.30)",
                "0 0 0 1px rgba(251,146,60,0.26), 0 10px 22px rgba(251,146,60,0.22)",
              ],
            }
      }
      transition={disabled ? undefined : { duration: 1.8, ease: "easeInOut", repeat: Infinity }}
      className={cn(
        "axiora-chunky-btn axiora-control-btn--orange inline-flex w-full items-center justify-center gap-2 font-extrabold text-white sm:w-auto",
        compact ? "min-h-10 px-4 py-2 text-sm" : "min-h-12 px-6 py-3 text-base",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      <Sparkles className="h-4 w-4" />
      {label}
    </motion.button>
  );
}
