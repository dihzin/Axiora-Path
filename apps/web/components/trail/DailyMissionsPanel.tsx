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
  void claimingMissionId;
  void onClaimMission;
  const [expanded, setExpanded] = useState(true);
  const dailyMissions = useMemo(() => missions?.missions ?? [], [missions]);

  return (
    <section className="rounded-2xl border border-[rgba(255,255,255,0.3)] bg-[rgba(255,255,255,0.88)] px-5 py-1 backdrop-blur-[3px] shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={expanded}
        aria-controls="daily-missions-content"
      >
        <div className="flex min-w-0 flex-col justify-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#536F91]">Missões do dia</p>
          <p className="truncate text-[18px] font-black leading-none tracking-[-0.01em] text-[#1B3E67]">Pronto para avançar?</p>
        </div>
        <span
          className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#D2DCEB] bg-[#F5F8FC] text-[#2F75B7] transition-transform ${
            expanded ? "rotate-180" : "rotate-0"
          }`}
          aria-hidden
        >
          ▼
        </span>
      </button>

      <div
        id="daily-missions-content"
        className={`grid transition-transform transition-shadow transition-opacity duration-[180ms] ease-out ${expanded ? "mt-1.5 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"}`}
      >
        <div className="overflow-hidden">
          {dailyMissions.length > 0 ? (
            <div className="divide-y divide-[rgba(0,0,0,0.05)] pb-1">
              {dailyMissions.map((mission) => (
                <MissionLine key={mission.missionId} mission={mission} />
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-[#D1DFEE] bg-[#F9FCFF] px-3 py-1.5 text-sm font-semibold text-[#4E6F95]">
              {missionsLoading ? "Carregando missões..." : "Sem missões disponíveis no momento."}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function MissionLine({ mission }: { mission: MissionProgress }) {
  const safeTotal = Math.max(1, mission.targetValue);
  const safeValue = Math.max(0, mission.currentValue);
  const done = mission.completed || safeValue >= safeTotal;

  return (
    <div className="flex items-center justify-between gap-3 px-1 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[13px] font-semibold text-[#23486F]/90">{mission.title}</p>
      </div>
      <p className={`text-[12px] font-bold ${done ? "text-[#2B9A7D]" : "text-[#587BA2]"}`}>
        {safeValue}/{safeTotal}
      </p>
    </div>
  );
}

