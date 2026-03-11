"use client";

import { useEffect, useMemo, useState } from "react";
import type { MissionProgress, MissionsCurrentResponse } from "@/lib/api/client";
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
  void claimingMissionId;
  void onClaimMission;
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
    <section className={cn("relative overflow-hidden rounded-[28px] border border-[#E5D5C0]/12 bg-[linear-gradient(160deg,rgba(24,49,43,0.84)_0%,rgba(31,58,52,0.82)_52%,rgba(20,39,35,0.9)_100%)] shadow-[0_16px_40px_rgba(7,20,17,0.24),inset_0_1px_0_rgba(255,255,255,0.08)]", compact ? "p-3.5" : "p-4", className)}>
      <div className="pointer-events-none absolute inset-0 rounded-[28px] bg-gradient-to-b from-white/5 via-white/[0.03] to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(70%_90%_at_50%_0%,rgba(255,176,122,0.12),transparent_65%)]" />
      <div className="relative z-10 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">Desafios do dia</p>
          <h3 className={cn("mt-1 font-semibold leading-tight text-white", compact ? "text-[15px]" : "text-[18px]")}>{compact ? "Desafio em foco" : "Pequenas conquistas para hoje"}</h3>
        </div>
        <span className="rounded-full border border-[#F1C56B]/18 bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-slate-200">
          {dailyMissions.length} ativos
        </span>
      </div>

      <div className="relative z-10 mt-4">
        {dailyMissions.length > 0 ? (
          compact ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <NavButton
                    direction="left"
                    disabled={!canNavigate}
                    onClick={() => setActiveIndex((prev) => (prev - 1 + dailyMissions.length) % dailyMissions.length)}
                  />
                  <NavButton
                    direction="right"
                    disabled={!canNavigate}
                    onClick={() => setActiveIndex((prev) => (prev + 1) % dailyMissions.length)}
                  />
                </div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/58">
                  {activeIndex + 1} de {dailyMissions.length}
                </p>
                <div className="flex items-center gap-1.5">
                  {dailyMissions.map((mission, index) => (
                    <button
                      key={mission.missionId}
                      type="button"
                      onClick={() => setActiveIndex(index)}
                      className={cn(
                        "h-2.5 rounded-full transition-all duration-200",
                        index === activeIndex ? "w-5 bg-[#FF9A48] shadow-[0_0_10px_rgba(255,154,72,0.42)]" : "w-2.5 bg-white/20 hover:bg-white/35",
                      )}
                      aria-label={`Mostrar desafio ${index + 1}`}
                      aria-pressed={index === activeIndex}
                    />
                  ))}
                </div>
              </div>
              {activeMission ? <MissionTile mission={activeMission} index={activeIndex} compact /> : null}
            </div>
          ) : (
            <div className={cn("grid sm:grid-cols-2 xl:grid-cols-1", compact ? "gap-2.5" : "gap-3")}>
              {dailyMissions.map((mission, index) => (
                <MissionTile key={mission.missionId} mission={mission} index={index} compact={compact} />
              ))}
            </div>
          )
        ) : (
          <p className="rounded-[22px] border border-white/12 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white/90">
            {missionsLoading ? "Carregando missões..." : "Sem missões disponíveis no momento."}
          </p>
        )}
      </div>
    </section>
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
        "axiora-chunky-btn axiora-chunky-chip axiora-chunky-btn--compact inline-flex h-8 w-8 items-center justify-center px-0 text-[14px] text-[#17322F]",
        disabled ? "cursor-default opacity-40" : "axiora-chunky-chip--active text-white",
      )}
      aria-label={direction === "left" ? "Desafio anterior" : "Próximo desafio"}
    >
      {direction === "left" ? "‹" : "›"}
    </button>
  );
}

function MissionTile({ mission, index, compact }: { mission: MissionProgress; index: number; compact: boolean }) {
  const safeTotal = Math.max(1, mission.targetValue);
  const safeValue = Math.max(0, mission.currentValue);
  const done = mission.completed || safeValue >= safeTotal;
  const percent = Math.min(100, Math.round((safeValue / safeTotal) * 100));
  const accents = [
    "from-[#F1C56B]/18 to-[#FF9A48]/10 border-[#F1C56B]/18",
    "from-emerald-300/18 to-lime-300/10 border-emerald-300/18",
    "from-amber-300/18 to-orange-300/10 border-amber-300/18",
  ] as const;
  const accentClass = accents[index % accents.length];

  return (
    <div className={cn("rounded-[22px] border bg-[linear-gradient(150deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]", compact ? "px-3 py-2.5" : "px-3.5 py-3", accentClass)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("font-semibold leading-tight text-white", compact ? "text-[13px]" : "text-[14px]")}>{mission.title}</p>
          <p className="mt-1 text-[11px] text-slate-300">{done ? "Conquista pronta para celebrar" : "Continue para acender esta estrela"}</p>
        </div>
        <p className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${done ? "border-emerald-300/45 bg-emerald-400/15 text-emerald-100" : "border-[#F1C56B]/40 bg-[#FF9A48]/15 text-[#FFE7D1]"}`}>
          {safeValue}/{safeTotal}
        </p>
      </div>
      <div className={cn("w-full overflow-hidden rounded-full border border-white/12 bg-white/10", compact ? "mt-2.5 h-1.5" : "mt-3 h-2")}>
        <div
          className={`h-full rounded-full transition-all duration-300 ${done ? "bg-gradient-to-r from-emerald-300 to-emerald-500" : "bg-gradient-to-r from-[#F1C56B] via-[#FF9A48] to-[#D96C2A]"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-300">
        <span>{percent}% completo</span>
        <span>{done ? "Pronto" : "Em progresso"}</span>
      </div>
    </div>
  );
}

