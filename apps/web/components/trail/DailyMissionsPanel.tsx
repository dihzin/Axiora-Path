"use client";

import { useMemo, useState } from "react";
import type { MissionProgress, MissionsCurrentResponse } from "@/lib/api/client";

type DailyMissionsPanelProps = {
  missions: MissionsCurrentResponse | null;
  missionsLoading: boolean;
  claimingMissionId: string | null;
  onClaimMission: (missionId: string) => void;
};

export function DailyMissionsPanel({ missions, missionsLoading, claimingMissionId, onClaimMission }: DailyMissionsPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const dailyMissions = useMemo(() => missions?.missions ?? [], [missions]);

  return (
    <section className="rounded-3xl bg-[linear-gradient(145deg,#22B7B2_0%,#2D99E8_100%)] p-[1.5px] shadow-[0_12px_24px_rgba(24,78,140,0.2)]">
      <div className="rounded-[22px] bg-[linear-gradient(180deg,#F9FCFF_0%,#EFF6FF_100%)] p-3.5">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="flex w-full items-center justify-between gap-2 rounded-2xl border border-[#D4E4F8] bg-white px-3 py-2.5 text-left shadow-[0_4px_10px_rgba(41,86,148,0.1)]"
          aria-expanded={expanded}
          aria-controls="daily-missions-content"
        >
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.08em] text-[#6183AA]">Missões do dia</p>
            <p className="text-[22px] font-black leading-none text-[#143E6D]">Pronto para avançar?</p>
          </div>
          <span
            className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#CCE0FA] bg-[#ECF5FF] text-[#2D7FCB] transition-transform ${
              expanded ? "rotate-180" : "rotate-0"
            }`}
            aria-hidden
          >
            ▼
          </span>
        </button>

        <div
          id="daily-missions-content"
          className={`grid transition-transform transition-shadow transition-opacity duration-[180ms] ease-out ${expanded ? "mt-3 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"}`}
        >
          <div className="overflow-hidden">
            {dailyMissions.length > 0 ? (
              <div className="space-y-2.5">
                {dailyMissions.map((mission) => (
                  <MissionItem
                    key={mission.missionId}
                    mission={mission}
                    claiming={claimingMissionId === mission.missionId}
                    onClaim={() => onClaimMission(mission.missionId)}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-2xl border border-[#D6E5F8] bg-white px-3 py-2 text-sm font-semibold text-[#5F7A9D]">
                {missionsLoading ? "Carregando missões..." : "Sem missões disponíveis no momento."}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function MissionItem({ mission, claiming, onClaim }: { mission: MissionProgress; claiming: boolean; onClaim: () => void }) {
  const safeTotal = Math.max(1, mission.targetValue);
  const safeValue = Math.max(0, mission.currentValue);
  const percent = Math.max(0, Math.min(100, Number.isFinite(mission.progressPercent) ? mission.progressPercent : (safeValue / safeTotal) * 100));
  const claimable = mission.completed && !mission.rewardGranted;

  return (
    <div className="rounded-2xl border border-[#D6E5F8] bg-white px-3 py-2.5 shadow-[0_4px_10px_rgba(34,75,131,0.08)]">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[14px] font-bold text-[#2A4F7E]">{mission.title}</p>
        <p className="text-[12px] font-black text-[#5E7EA5]">
          {safeValue}/{safeTotal}
        </p>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full border border-[#D6E5F8] bg-[#EAF1FB]">
        <div className={`h-full rounded-full transition-transform transition-shadow transition-opacity duration-[180ms] ${mission.completed ? "bg-[#34C2AE]" : "bg-[#4CA6F2]"}`} style={{ width: `${percent}%` }} />
      </div>
      {claimable ? (
        <button
          type="button"
          onClick={onClaim}
          disabled={claiming}
          className="mt-2 w-full rounded-full border border-[#8DDDC4] bg-[#E7FAF2] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.05em] text-[#178B71] transition-colors hover:bg-[#DAF4E9] disabled:cursor-default disabled:opacity-70"
        >
          {claiming ? "Resgatando..." : "Resgatar"}
        </button>
      ) : mission.rewardGranted ? (
        <p className="mt-2 text-[11px] font-black uppercase tracking-[0.05em] text-[#5A7A9F]">Recompensa recebida</p>
      ) : null}
    </div>
  );
}


