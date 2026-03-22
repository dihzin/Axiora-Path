"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Coins, Sparkles } from "lucide-react";

import type { EconomyFloatingEvent } from "@/hooks/use-economy-feedback-events";
import { cn } from "@/lib/utils";

type EconomyHUDProps = {
  balanceLabel: string;
  xpPercent: number;
  coinRainKey: number;
  xpRiseKey: number;
  floatingEvents: EconomyFloatingEvent[];
  className?: string;
};

const COIN_SLOTS = [0, 1, 2, 3, 4];

export function EconomyHUD({
  balanceLabel,
  xpPercent,
  coinRainKey,
  xpRiseKey,
  floatingEvents,
  className,
}: EconomyHUDProps) {
  return (
    <section className={cn("axiora-surface-glass sticky top-[104px] z-20 overflow-hidden p-2.5", className)} aria-label="Economy HUD">
      <div className="grid gap-2.5 sm:grid-cols-2">
        <div className="axiora-surface-soft relative rounded-2xl px-3 py-2">
          <p className="axiora-subtitle text-[11px] font-black uppercase tracking-[0.08em]">Economia</p>
          <p className="axiora-title mt-0.5 text-lg font-extrabold">{balanceLabel}</p>
          <p className="axiora-subtitle text-sm">atualização em tempo real</p>

          <AnimatePresence>
            {COIN_SLOTS.map((slot) => (
              <motion.span
                key={`${coinRainKey}-${slot}`}
                initial={{ opacity: 0, y: -18, x: slot * 8 - 16, scale: 0.8 }}
                animate={{ opacity: [0, 1, 1, 0], y: [0, 8, 22, 34], rotate: [0, 10, -8, 6] }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8, delay: slot * 0.06, ease: "easeOut" }}
                className="pointer-events-none absolute right-4 top-2 text-[#F59E0B]"
              >
                <Coins className="h-3.5 w-3.5" />
              </motion.span>
            ))}
          </AnimatePresence>
        </div>

        <div className="axiora-surface-soft relative rounded-2xl px-3 py-2">
          <p className="axiora-subtitle text-[11px] font-black uppercase tracking-[0.08em]">XP</p>
          <p className="axiora-title mt-0.5 text-lg font-extrabold">{Math.max(0, Math.round(xpPercent))}%</p>
          <p className="axiora-subtitle text-sm">progresso contínuo</p>

          <motion.span
            key={`xp-rise-${xpRiseKey}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: [0, 1, 0], y: [10, -2, -14] }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1 text-xs font-bold text-[#C2410C]"
          >
            <Sparkles className="h-3 w-3" />
            XP subindo
          </motion.span>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-1 flex items-end justify-center">
        <div className="relative h-7 w-full max-w-[320px]">
          <AnimatePresence>
            {floatingEvents.map((event, index) => (
              <motion.p
                key={event.id}
                initial={{ opacity: 0, y: 10, scale: 0.9 }}
                animate={{ opacity: 1, y: -6 - index * 2, scale: 1 }}
                exit={{ opacity: 0, y: -18, scale: 0.92 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className={cn(
                  "absolute left-1/2 -translate-x-1/2 rounded-full border px-2.5 py-0.5 text-xs font-bold shadow-sm",
                  event.kind === "xp"
                    ? "border-[#FDBA74] bg-[#FFF7ED] text-[#C2410C]"
                    : "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
                )}
              >
                {event.label}
              </motion.p>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
