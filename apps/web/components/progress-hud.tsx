"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Compass, Sparkles, Star } from "lucide-react";

import { useChangePulse } from "@/hooks/use-change-pulse";
import { cn } from "@/lib/utils";

type ProgressHUDProps = {
  level: number;
  xpPercent: number;
  nextObjective: string;
  recentProgressLabel: string;
  levelUpSignal: number | null;
  className?: string;
};

export function ProgressHUD({
  level,
  xpPercent,
  nextObjective,
  recentProgressLabel,
  levelUpSignal,
  className,
}: ProgressHUDProps) {
  const safePercent = Math.max(0, Math.min(100, Math.round(xpPercent)));
  const xpPulse = useChangePulse(safePercent);
  const [showBurst, setShowBurst] = useState(false);

  useEffect(() => {
    if (levelUpSignal === null) return;
    setShowBurst(true);
    const timeoutId = window.setTimeout(() => setShowBurst(false), 900);
    return () => window.clearTimeout(timeoutId);
  }, [levelUpSignal]);

  return (
    <section
      className={cn(
        "axiora-surface-glass sticky top-3 z-30 p-2.5",
        "transition-[box-shadow,transform] duration-200",
        xpPulse && "shadow-[0_0_0_1px_rgba(251,146,60,0.30),0_16px_34px_rgba(251,146,60,0.20)]",
        className,
      )}
      aria-label="Progress HUD"
    >
      {showBurst ? (
        <motion.div
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none absolute inset-0"
        >
          <motion.span
            initial={{ scale: 0.2, opacity: 0.8 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="absolute left-8 top-6 h-8 w-8 rounded-full border border-[#FDBA74] bg-[#FFEDD5]/70"
          />
          <motion.span
            initial={{ scale: 0.2, opacity: 0.8 }}
            animate={{ scale: 1.8, opacity: 0 }}
            transition={{ duration: 0.85, ease: "easeOut" }}
            className="absolute left-10 top-4 h-5 w-5 rounded-full border border-[#FDBA74] bg-[#FFF7ED]/80"
          />
        </motion.div>
      ) : null}

      <div className="relative z-[1] grid gap-2.5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className="axiora-subtitle inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-[0.08em]">
              <Star className="h-3.5 w-3.5 text-[#FB923C]" />
              XP Global
            </p>
            <p className="axiora-title text-sm font-extrabold">Nível {Math.max(1, Math.floor(level))}</p>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full border border-[#E2E8F0] bg-white/75">
            <motion.div
              className="h-full bg-[linear-gradient(90deg,#FB923C_0%,#FDBA74_52%,#FED7AA_100%)]"
              initial={false}
              animate={{ width: `${safePercent}%` }}
              transition={{ duration: 0.45, ease: "easeOut" }}
            />
          </div>
          <p
            className={cn(
              "axiora-subtitle mt-1 text-sm font-semibold transition-[transform,filter] duration-300",
              xpPulse && "scale-[1.04] brightness-125",
            )}
          >
            {safePercent}% do nível atual
          </p>
        </div>

        <div className="axiora-surface-soft rounded-2xl px-3 py-2">
          <p className="axiora-subtitle inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-[0.08em]">
            <Compass className="h-3.5 w-3.5 text-[#64748B]" />
            Mini Trail
          </p>
          <p className="axiora-title mt-1 text-sm font-bold">{recentProgressLabel}</p>
          <p className="axiora-subtitle mt-0.5 text-sm">{nextObjective}</p>
          <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#C2410C]">
            <Sparkles className="h-3.5 w-3.5" />
            Feedback contínuo ativo
          </p>
        </div>
      </div>
    </section>
  );
}
