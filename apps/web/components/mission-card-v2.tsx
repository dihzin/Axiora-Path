"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Coins, Lock, Sparkles, Trophy } from "lucide-react";

import { cn } from "@/lib/utils";

export type MissionLoopState = "locked" | "active" | "completed" | "reward";

type MissionCardV2Props = {
  state: MissionLoopState;
  title: string;
  subtitle?: string;
  progress: number;
  xpReward: number;
  coinReward: number;
  rarityLabel?: string;
  disabled?: boolean;
  loading?: boolean;
  soundEnabled?: boolean;
  className?: string;
  onAction?: (state: MissionLoopState) => void;
  onPlayRewardSound?: () => void;
};

function getCtaLabel(state: MissionLoopState, progress: number): string {
  if (state === "locked") return "Missão bloqueada";
  if (state === "active") return progress > 0 ? "Continuar" : "Começar missão";
  if (state === "completed") return "Resgatar recompensa";
  return "Recompensa resgatada";
}

function getStateLabel(state: MissionLoopState): string {
  if (state === "locked") return "Locked";
  if (state === "active") return "Ativa";
  if (state === "completed") return "Concluída";
  return "Recompensa";
}

export function MissionCardV2({
  state,
  title,
  subtitle,
  progress,
  xpReward,
  coinReward,
  rarityLabel,
  disabled = false,
  loading = false,
  soundEnabled = true,
  className,
  onAction,
  onPlayRewardSound,
}: MissionCardV2Props) {
  const clampedProgress = Math.max(0, Math.min(100, Math.round(progress)));
  const ctaLabel = getCtaLabel(state, clampedProgress);
  const canClick = !disabled && !loading && state !== "locked" && state !== "reward";
  const activeGlow = state === "active";
  const rewardState = state === "reward";

  const handleAction = () => {
    if (!canClick) return;
    if (state === "completed" && soundEnabled) {
      onPlayRewardSound?.();
    }
    onAction?.(state);
  };

  return (
    <motion.article
      layout
      initial={false}
      animate={{
        scale: state === "reward" ? 1.01 : 1,
      }}
      transition={{ type: "spring", stiffness: 220, damping: 22 }}
      className={cn(
        "relative overflow-hidden rounded-[22px] border border-[#F7C58A] bg-[linear-gradient(160deg,#FFF7ED_0%,#FFFFFF_58%,#FFF1E2_100%)] p-3.5 shadow-[0_18px_34px_rgba(251,146,60,0.16)]",
        className,
      )}
    >
      <AnimatePresence>
        {activeGlow ? (
          <motion.div
            key="mission-glow"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.35, 0.62, 0.35] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_15%,rgba(251,146,60,0.42),rgba(251,146,60,0)_58%)]"
          />
        ) : null}
      </AnimatePresence>

      <div className="relative z-[1] space-y-3.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.08em] text-[#C2410C]">Missão Central</p>
            <h3 className="mt-0.5 text-[19px] font-extrabold leading-tight text-[#0F172A]">{title}</h3>
            {subtitle ? <p className="mt-1 text-[13px] text-[#64748B]">{subtitle}</p> : null}
          </div>
          <div className="flex items-center gap-1.5">
            {rarityLabel ? (
              <span className="rounded-full border border-[#FDBA74] bg-[#FFF7ED] px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-[#C2410C]">
                {rarityLabel}
              </span>
            ) : null}
            <span className="rounded-full border border-[#FDBA74] bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-[#C2410C]">
              {getStateLabel(state)}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-[#F0E4D2] bg-white/80 px-3 py-2">
          <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.08em] text-[#64748B]">
            <span>Progresso</span>
            <span>{clampedProgress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#F1F5F9]">
            <motion.div
              initial={false}
              animate={{ width: `${clampedProgress}%` }}
              transition={{ type: "spring", stiffness: 130, damping: 24 }}
              className={cn(
                "h-full rounded-full",
                rewardState
                  ? "bg-[linear-gradient(90deg,#22C55E_0%,#86EFAC_100%)]"
                  : "bg-[linear-gradient(90deg,#FB923C_0%,#FDBA74_100%)]",
              )}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <motion.div
            initial={false}
            animate={rewardState ? { scale: [1, 1.08, 1], y: [0, -2, 0] } : { scale: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="flex items-center gap-1.5 rounded-xl border border-[#F0E4D2] bg-white/80 px-3 py-1.5 text-[13px] font-bold text-[#0F172A]"
          >
            <Sparkles className="h-3.5 w-3.5 text-[#FB923C]" />
            +{xpReward} XP
          </motion.div>
          <motion.div
            initial={false}
            animate={rewardState ? { scale: [1, 1.08, 1], y: [0, -2, 0] } : { scale: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.08 }}
            className="flex items-center gap-1.5 rounded-xl border border-[#F0E4D2] bg-white/80 px-3 py-1.5 text-[13px] font-bold text-[#0F172A]"
          >
            <Coins className="h-3.5 w-3.5 text-[#FB923C]" />
            +{coinReward} moedas
          </motion.div>
        </div>

        <motion.button
          type="button"
          whileTap={canClick ? { scale: 0.98 } : undefined}
          whileHover={canClick ? { y: -1 } : undefined}
          onClick={handleAction}
          disabled={!canClick}
          className={cn(
            "axiora-chunky-btn w-full px-4 py-2 text-[15px] font-extrabold transition",
            canClick
              ? "axiora-control-btn--orange text-white"
              : "cursor-not-allowed border-[#CBD5E1] bg-[#E2E8F0] text-[#94A3B8] shadow-none",
          )}
        >
          {loading ? "Processando..." : ctaLabel}
        </motion.button>

        <AnimatePresence>
          {rewardState ? (
            <motion.div
              key="reward-confirmation"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.24 }}
              className="inline-flex items-center gap-1 rounded-xl border border-[#BBF7D0] bg-[#ECFDF5] px-2.5 py-1 text-xs font-semibold text-[#166534]"
            >
              <Trophy className="h-3.5 w-3.5" />
              Recompensa confirmada
            </motion.div>
          ) : state === "locked" ? (
            <motion.div
              key="locked-feedback"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2 }}
              className="inline-flex items-center gap-1 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1 text-xs font-semibold text-[#64748B]"
            >
              <Lock className="h-3.5 w-3.5" />
              Ative tarefas para desbloquear
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.article>
  );
}
