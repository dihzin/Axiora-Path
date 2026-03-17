"use client";

import { useEffect, useMemo, useState } from "react";
import type { MissionProgress, MissionsCurrentResponse } from "@/lib/api/client";
import { ParchmentCard } from "@/components/ui/ParchmentCard";
import { cn } from "@/lib/utils";

type DailyMissionsPanelProps = {
  missions: MissionsCurrentResponse | null;
  missionsLoading: boolean;
  claimingMissionId: string | null;
  onClaimMission: (missionId: string) => void;
  className?: string;
  compact?: boolean;
};

export function DailyMissionsPanel({ missions, missionsLoading, claimingMissionId, onClaimMission, className, compact = false }: DailyMissionsPanelProps) {
  const dailyMissions = useMemo(() => missions?.missions ?? [], [missions]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex((prev) => {
      if (dailyMissions.length === 0) return 0;
      return Math.min(prev, dailyMissions.length - 1);
    });
  }, [dailyMissions.length]);

  const activeMission = dailyMissions[activeIndex] ?? null;
  const canNavigate = dailyMissions.length > 1;

  return (
    <ParchmentCard
      as="section"
      variant="glass"
      className={cn(compact ? "p-3.5" : "p-4", className)}
    >
      <div className="relative z-10">
        {dailyMissions.length > 0 ? (
          compact ? (
            <div className="space-y-3">
              {activeMission ? <MissionTile mission={activeMission} index={activeIndex} compact onClaimMission={onClaimMission} claimingMissionId={claimingMissionId} /> : null}
              {canNavigate && (
                <div className="flex items-center justify-center gap-3">
                  <NavButton
                    direction="left"
                    disabled={!canNavigate}
                    onClick={() => setActiveIndex((prev) => (prev - 1 + dailyMissions.length) % dailyMissions.length)}
                  />
                  <div className="flex items-center gap-0.5" role="tablist" aria-label="Navegar entre desafios">
                    {dailyMissions.map((mission, index) => (
                      <button
                        key={mission.missionId}
                        type="button"
                        role="tab"
                        onClick={() => setActiveIndex(index)}
                        aria-label={`Desafio ${index + 1}`}
                        aria-selected={index === activeIndex}
                        className="inline-flex h-8 w-8 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A07850]/50 focus-visible:ring-offset-1"
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "block rounded-full transition-all duration-200",
                            index === activeIndex
                              ? "h-2.5 w-5 bg-[#A07850] shadow-[0_0_8px_rgba(160,120,80,0.5)]"
                              : "h-2.5 w-2.5 bg-[#A07850]/30 hover:bg-[#A07850]/55",
                          )}
                        />
                      </button>
                    ))}
                  </div>
                  <NavButton
                    direction="right"
                    disabled={!canNavigate}
                    onClick={() => setActiveIndex((prev) => (prev + 1) % dailyMissions.length)}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-3">
              {dailyMissions.map((mission, index) => (
                <MissionTile key={mission.missionId} mission={mission} index={index} compact={compact} onClaimMission={onClaimMission} claimingMissionId={claimingMissionId} />
              ))}
            </div>
          )
        ) : (
          <p className="rounded-[22px] border border-white/12 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white/90">
            {missionsLoading ? "Carregando missões..." : "Sem missões disponíveis no momento."}
          </p>
        )}
      </div>
    </ParchmentCard>
  );
}

function NavButton({
  direction,
  disabled,
  onClick,
}: {
  direction: "left" | "right";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#A07850]/60 bg-[linear-gradient(145deg,#FDF5E6,#E8C98A)] text-[18px] font-black text-[#5C3D1A] shadow-[0_2px_6px_rgba(44,30,18,0.18)] transition-all duration-150",
        disabled ? "cursor-default opacity-30" : "hover:bg-[#E8C98A] active:scale-95",
      )}
      aria-label={direction === "left" ? "Desafio anterior" : "Próximo desafio"}
    >
      {direction === "left" ? "‹" : "›"}
    </button>
  );
}

function MissionTile({
  mission,
  index,
  compact,
  onClaimMission,
  claimingMissionId,
}: {
  mission: MissionProgress;
  index: number;
  compact: boolean;
  onClaimMission: (missionId: string) => void;
  claimingMissionId: string | null;
}) {
  const safeTotal = Math.max(1, mission.targetValue);
  const safeValue = Math.max(0, mission.currentValue);
  const done = mission.completed || safeValue >= safeTotal;
  const claimed = mission.rewardGranted;
  const canClaim = done && !claimed;
  const isClaiming = claimingMissionId === mission.missionId;
  const percent = Math.min(100, Math.round((safeValue / safeTotal) * 100));
  const accents = [
    "from-[#F1C56B]/18 to-[#FF9A48]/10 border-[#F1C56B]/18",
    "from-emerald-300/18 to-lime-300/10 border-emerald-300/18",
    "from-amber-300/18 to-orange-300/10 border-amber-300/18",
  ] as const;
  const accentClass = accents[index % accents.length];

  return (
    <div className={cn("rounded-[16px] border border-[#A07850]/35 bg-[rgba(253,245,230,0.55)]", compact ? "px-3 py-2.5" : "px-3.5 py-3")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("font-bold leading-tight", compact ? "text-[13px]" : "text-[14px]")} style={{ color: "#2C1E16" }}>{mission.title}</p>
          <p className="mt-1 text-[11px] font-medium" style={{ color: "#7A5C3A" }}>
            {claimed ? "Recompensa resgatada ✓" : done ? "Conquista pronta para celebrar!" : "Continue para acender esta estrela"}
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${done ? "border-[#52B788]/50 bg-[rgba(82,183,136,0.15)] text-[#276245]" : "border-[#A07850]/45 bg-[rgba(160,120,80,0.12)] text-[#7A4F10]"}`}>
          {safeValue}/{safeTotal}
        </span>
      </div>
      <div className={cn("w-full overflow-hidden rounded-full border border-[#A07850]/30 bg-[rgba(160,120,80,0.12)]", compact ? "mt-2.5 h-2" : "mt-3 h-2.5")}>
        <div
          className={`h-full rounded-full transition-all duration-300 ${done ? "bg-gradient-to-r from-[#52B788] to-[#276245]" : "bg-gradient-to-r from-[#FFB703] via-[#FB8C00] to-[#D96C2A]"} shadow-[0_0_8px_rgba(255,183,3,0.4)]`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {canClaim && (
        <button
          type="button"
          onClick={() => onClaimMission(mission.missionId)}
          disabled={isClaiming}
          className="mt-2.5 w-full rounded-full border-2 border-[#276245]/60 bg-gradient-to-r from-[#52B788] to-[#276245] px-3 py-1.5 text-[12px] font-bold text-white shadow-[0_0_12px_rgba(82,183,136,0.3)] transition-all hover:shadow-[0_0_20px_rgba(82,183,136,0.5)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isClaiming ? "Resgatando..." : "✦ Resgatar recompensa"}
        </button>
      )}
    </div>
  );
}

