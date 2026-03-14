"use client";

import { Medal, Sparkles, Target } from "lucide-react";
import type { LearningInsightsResponse, MissionProgress, MissionsCurrentResponse } from "@/lib/api/client";
type DesktopRightRailProps = {
  insights: LearningInsightsResponse | null;
  insightsLoading: boolean;
  missions: MissionsCurrentResponse | null;
  missionsLoading: boolean;
  claimingMissionId: string | null;
  onClaimMission: (missionId: string) => void;
};

export function DesktopRightRail({
  insights,
  insightsLoading,
  missions,
  missionsLoading,
  claimingMissionId,
  onClaimMission,
}: DesktopRightRailProps) {
  const desktopMissions = missions?.missions?.length ? missions.missions.slice(0, 3) : [];

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-[#E8DCC8]/80 bg-[linear-gradient(160deg,rgba(252,248,239,0.9)_0%,rgba(247,241,231,0.88)_58%,rgba(241,234,222,0.9)_100%)] p-3.5 shadow-[0_10px_22px_rgba(45,35,20,0.16)] backdrop-blur-xl">
        <div className="relative z-10 flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <Target className="h-4 w-4" />
          </span>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#5D6B64]">Progresso</p>
        </div>
        <p className="relative z-10 mt-1 text-[20px] font-semibold leading-[1.2] tracking-tight text-[#1F2A33]">
          {insights ? `${insights.weeklyXpEarned} XP na semana` : insightsLoading ? "Carregando progresso..." : "Você está indo bem!"}
        </p>
        <p className="relative z-10 mt-1 text-[13px] font-medium leading-5 text-[#465867]">
          {insights
            ? `${insights.dueReviewsCount} revisões pendentes`
            : insightsLoading
              ? "Buscando dados mais recentes."
              : "Continue a trilha para manter sua sequência ativa."}
        </p>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-[#E8DCC8]/80 bg-[linear-gradient(160deg,rgba(252,248,239,0.9)_0%,rgba(247,241,231,0.88)_58%,rgba(241,234,222,0.9)_100%)] p-3.5 shadow-[0_10px_22px_rgba(45,35,20,0.16)] backdrop-blur-xl">
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <Medal className="h-4 w-4" />
            </span>
            <p className="text-[17px] font-semibold leading-none tracking-tight text-[#1F2A33]">Missões do dia</p>
          </div>
          <span className="rounded-full border border-amber-300/45 bg-amber-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-800">Top 3</span>
        </div>
        {desktopMissions.length > 0 ? (
          <div className="relative z-10 mt-2.5 space-y-2">
            {desktopMissions.map((mission) => (
              <DesktopMission
                key={mission.missionId}
                mission={mission}
                claiming={claimingMissionId === mission.missionId}
                onClaim={() => onClaimMission(mission.missionId)}
              />
            ))}
          </div>
        ) : (
          <p className="relative z-10 mt-3 rounded-xl border border-[#E2D4BD]/80 bg-white/70 px-3 py-2 text-sm font-semibold text-[#364756]">
            {missionsLoading ? "Carregando missões..." : "Sem missões disponíveis no momento."}
          </p>
        )}
      </div>
    </div>
  );
}

function DesktopMission({ mission, onClaim, claiming = false }: { mission: MissionProgress; onClaim?: () => void; claiming?: boolean }) {
  const safeTotal = Math.max(1, mission.targetValue);
  const safeValue = Math.max(0, mission.currentValue);
  const percent = Math.max(0, Math.min(100, Number.isFinite(mission.progressPercent) ? mission.progressPercent : (safeValue / safeTotal) * 100));
  const claimable = mission.completed && !mission.rewardGranted;
  return (
    <div className="space-y-1.5 rounded-xl border border-[#E2D4BD]/78 bg-white/66 p-2.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.28)]">
      <div className="flex items-center justify-between text-[13px] font-semibold text-[#243649]">
        <span className="truncate">{mission.title}</span>
        <span className="shrink-0 rounded-full border border-amber-300/45 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
          {safeValue}/{safeTotal}
        </span>
      </div>
      <div className="h-1.5 rounded-full border border-[#DCCCB4]/80 bg-[#F3EBDD]">
        <div
          className={`h-full rounded-full transition-transform transition-shadow transition-opacity duration-[180ms] ${mission.completed ? "bg-gradient-to-r from-emerald-300 to-emerald-500" : "bg-gradient-to-r from-[#F1C56B] via-[#FF9A48] to-[#D96C2A]"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-[#5B4C79]">
        <Sparkles className="h-3.5 w-3.5 text-fuchsia-500" />
        <span>{mission.completed ? "Meta concluída hoje" : "Continue para concluir esta meta"}</span>
      </div>
      {claimable ? (
        <button
          type="button"
          onClick={onClaim}
          disabled={claiming}
          className="mt-1 w-full rounded-full border border-[#FFD0A9]/35 bg-[linear-gradient(135deg,rgba(255,122,47,0.98),rgba(255,153,72,0.96))] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white shadow-[0_0_14px_rgba(255,154,72,0.28)] transition hover:brightness-110 disabled:cursor-default disabled:opacity-70"
        >
          {claiming ? "Resgatando..." : "Resgatar"}
        </button>
      ) : mission.rewardGranted ? (
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-100/90">Recompensa recebida</p>
      ) : null}
    </div>
  );
}

