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
      // Breathing glow — suave e quente para light background
      animate={
        disabled
          ? undefined
          : {
              boxShadow: [
                "0 0 0 1px rgba(251,146,60,0.20), 0 6px 18px rgba(251,146,60,0.20)",
                "0 0 0 2px rgba(251,146,60,0.35), 0 10px 26px rgba(251,146,60,0.30)",
                "0 0 0 1px rgba(251,146,60,0.20), 0 6px 18px rgba(251,146,60,0.20)",
              ],
            }
      }
      transition={disabled ? undefined : { duration: 2.2, ease: "easeInOut", repeat: Infinity }}
      // Hover: lift + scale leve
      whileHover={disabled ? undefined : { scale: 1.02, y: -1 }}
      // Press: sink
      whileTap={disabled ? undefined : { scale: 0.97 }}
      className={cn(
        "axiora-chunky-btn axiora-control-btn--orange inline-flex w-full items-center justify-center gap-2 font-extrabold text-white sm:w-auto",
        compact ? "min-h-10 px-4 py-2 text-sm" : "min-h-12 px-6 py-3 text-base",
        "disabled:cursor-not-allowed disabled:opacity-60",
        // Focus ring visível e bonito
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FB923C] focus-visible:ring-offset-2",
        className,
      )}
    >
      <Sparkles className="h-4 w-4" />
      {label}
    </motion.button>
  );
}
