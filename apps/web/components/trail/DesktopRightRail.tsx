"use client";

import type { AprenderSubjectOption, LearningInsightsResponse, MissionProgress, MissionsCurrentResponse } from "@/lib/api/client";
import { SubjectSelector } from "@/components/trail/SubjectSelector";

type DesktopRightRailProps = {
  streak: number;
  gems: number;
  xp: number;
  selectedSubjectName: string;
  subjects: AprenderSubjectOption[];
  selectedSubjectId: number | null;
  pathSubjectId?: number | null;
  insights: LearningInsightsResponse | null;
  insightsLoading: boolean;
  missions: MissionsCurrentResponse | null;
  missionsLoading: boolean;
  claimingMissionId: string | null;
  onSelectSubject: (subjectId: number) => void;
  onClaimMission: (missionId: string) => void;
};

export function DesktopRightRail({
  streak,
  gems,
  xp,
  selectedSubjectName,
  subjects,
  selectedSubjectId,
  pathSubjectId,
  insights,
  insightsLoading,
  missions,
  missionsLoading,
  claimingMissionId,
  onSelectSubject,
  onClaimMission,
}: DesktopRightRailProps) {
  const desktopMissions = missions?.missions?.length ? missions.missions.slice(0, 3) : [];

  return (
    <div className="space-y-3">
      <SubjectSelector
        streak={streak}
        gems={gems}
        xp={xp}
        selectedSubjectName={selectedSubjectName}
        subjects={subjects}
        selectedSubjectId={selectedSubjectId}
        pathSubjectId={pathSubjectId}
        className="max-w-none"
        menuClassName="w-[280px]"
        onSelectSubject={onSelectSubject}
      />

      <div className="rounded-2xl border border-[#DFE7F2] bg-white p-3.5 shadow-[0_4px_14px_rgba(0,0,0,0.06)]">
        <p className="text-xs font-black uppercase tracking-[0.08em] text-[#8A9BB4]">Progresso</p>
        <p className="mt-1 text-xl font-black leading-[1.2] text-[#1F3558]">
          {insights ? `${insights.weeklyXpEarned} XP na semana` : insightsLoading ? "Carregando progresso..." : "Você está indo bem!"}
        </p>
        <p className="mt-1 text-[13px] font-semibold leading-5 text-[#5F7393]">
          {insights
            ? `${insights.dueReviewsCount} revisões pendentes`
            : insightsLoading
              ? "Buscando dados mais recentes."
              : "Continue a trilha para manter sua sequência ativa."}
        </p>
      </div>

      <div className="rounded-2xl border border-[#DFE7F2] bg-white p-3.5 shadow-[0_4px_14px_rgba(0,0,0,0.06)]">
        <div className="flex items-center justify-between">
          <p className="text-lg font-black leading-none text-[#1F3558]">Missões do dia</p>
          <span className="text-xs font-black uppercase tracking-[0.06em] text-[#1DA1F2]">Ver todas</span>
        </div>
        {desktopMissions.length > 0 ? (
          <div className="mt-2.5 space-y-2.5">
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
          <p className="mt-3 rounded-xl border border-[#E6ECF5] bg-[#F8FBFF] px-3 py-2 text-sm font-semibold text-[#6A7E9D]">
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
    <div className="space-y-1.5 rounded-xl border border-[#E6ECF5] p-2.5">
      <div className="flex items-center justify-between text-[13px] font-semibold text-[#425776]">
        <span>{mission.title}</span>
        <span className="text-xs font-black text-[#7A8EA9]">
          {safeValue}/{safeTotal}
        </span>
      </div>
      <div className="h-2 rounded-full bg-[#E9EFF8]">
        <div
          className={`h-full rounded-full transition-all duration-300 ${mission.completed ? "bg-[#4DD9AC]" : "bg-[#8CC8FF]"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {claimable ? (
        <button
          type="button"
          onClick={onClaim}
          disabled={claiming}
          className="mt-1 w-full rounded-full border border-[#8EE2C7] bg-[#E8FBF3] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.05em] text-[#178D72] transition-colors hover:bg-[#DDF7EC] disabled:cursor-default disabled:opacity-70"
        >
          {claiming ? "Resgatando..." : "Resgatar"}
        </button>
      ) : mission.rewardGranted ? (
        <p className="mt-1 text-[11px] font-black uppercase tracking-[0.05em] text-[#5E7B9E]">Recompensa recebida</p>
      ) : null}
    </div>
  );
}
