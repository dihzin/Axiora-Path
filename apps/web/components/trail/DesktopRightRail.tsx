"use client";

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
      <div className="relative overflow-hidden rounded-2xl border border-white/14 bg-[linear-gradient(160deg,rgba(15,23,42,0.86)_0%,rgba(12,25,54,0.82)_55%,rgba(10,19,46,0.92)_100%)] p-3.5 shadow-[0_10px_28px_rgba(2,12,35,0.32),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/5 via-white/[0.03] to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[radial-gradient(70%_90%_at_50%_0%,rgba(56,189,248,0.16),transparent_65%)]" />
        <p className="relative z-10 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">Progresso</p>
        <p className="relative z-10 mt-1 text-[20px] font-semibold leading-[1.2] tracking-tight text-white">
          {insights ? `${insights.weeklyXpEarned} XP na semana` : insightsLoading ? "Carregando progresso..." : "Você está indo bem!"}
        </p>
        <p className="relative z-10 mt-1 text-[13px] font-medium leading-5 text-white/75">
          {insights
            ? `${insights.dueReviewsCount} revisões pendentes`
            : insightsLoading
              ? "Buscando dados mais recentes."
              : "Continue a trilha para manter sua sequência ativa."}
        </p>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-white/14 bg-[linear-gradient(160deg,rgba(15,23,42,0.86)_0%,rgba(12,25,54,0.82)_55%,rgba(10,19,46,0.92)_100%)] p-3.5 shadow-[0_10px_28px_rgba(2,12,35,0.32),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/5 via-white/[0.03] to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[radial-gradient(70%_90%_at_50%_0%,rgba(56,189,248,0.16),transparent_65%)]" />
        <div className="relative z-10 flex items-center justify-between">
          <p className="text-[17px] font-semibold leading-none tracking-tight text-white">Missões do dia</p>
          <span className="rounded-full border border-sky-300/30 bg-sky-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-100">Top 3</span>
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
          <p className="relative z-10 mt-3 rounded-xl border border-white/20 bg-[rgba(15,23,42,0.65)] px-3 py-2 text-sm font-semibold text-white">
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
    <div className="space-y-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.06)]">
      <div className="flex items-center justify-between text-[13px] font-semibold text-white/90">
        <span className="truncate">{mission.title}</span>
        <span className="shrink-0 rounded-full border border-sky-300/35 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-100">
          {safeValue}/{safeTotal}
        </span>
      </div>
      <div className="h-1.5 rounded-full border border-white/15 bg-white/10">
        <div
          className={`h-full rounded-full transition-transform transition-shadow transition-opacity duration-[180ms] ${mission.completed ? "bg-gradient-to-r from-emerald-300 to-emerald-500" : "bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {claimable ? (
        <button
          type="button"
          onClick={onClaim}
          disabled={claiming}
          className="mt-1 w-full rounded-full border border-cyan-200/35 bg-[linear-gradient(135deg,rgba(56,189,248,0.92),rgba(37,99,235,0.92))] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white shadow-[0_0_14px_rgba(56,189,248,0.35)] transition hover:brightness-110 disabled:cursor-default disabled:opacity-70"
        >
          {claiming ? "Resgatando..." : "Resgatar"}
        </button>
      ) : mission.rewardGranted ? (
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-100/90">Recompensa recebida</p>
      ) : null}
    </div>
  );
}

