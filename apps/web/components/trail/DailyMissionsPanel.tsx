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
    <section className="relative overflow-hidden rounded-2xl border border-white/14 bg-[linear-gradient(160deg,rgba(15,23,42,0.86)_0%,rgba(12,25,54,0.82)_55%,rgba(10,19,46,0.92)_100%)] p-4 backdrop-blur-xl shadow-[0_10px_28px_rgba(2,12,35,0.32),inset_0_1px_0_rgba(255,255,255,0.08)] transition-all duration-500 hover:shadow-[0_14px_36px_rgba(2,12,35,0.42)]">
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/5 via-white/[0.03] to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[radial-gradient(70%_90%_at_50%_0%,rgba(56,189,248,0.16),transparent_65%)]" />
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="relative z-10 flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={expanded}
        aria-controls="daily-missions-content"
      >
        <div className="flex min-w-0 flex-col justify-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/75">Missões do dia</p>
          <p className="truncate text-[17px] font-semibold leading-tight tracking-[-0.01em] text-white">Pronto para avançar?</p>
        </div>
        <span
          className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-sky-200/30 bg-sky-100/95 text-[#2F75B7] shadow-[0_0_14px_rgba(56,189,248,0.24)] transition-transform ${
            expanded ? "rotate-180" : "rotate-0"
          }`}
          aria-hidden
        >
          ▼
        </span>
      </button>

      <div
        id="daily-missions-content"
        className={`relative z-10 grid transition-transform transition-shadow transition-opacity duration-[180ms] ease-out ${expanded ? "mt-2 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"}`}
      >
        <div className="overflow-hidden">
          {dailyMissions.length > 0 ? (
            <div className="space-y-1.5 pb-1">
              {dailyMissions.map((mission) => (
                <MissionLine key={mission.missionId} mission={mission} />
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-white/20 bg-[rgba(15,23,42,0.65)] px-3 py-2 text-sm font-semibold text-white">
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
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 shadow-[inset_0_0_0_1px_rgba(125,211,252,0.06)]">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-[13px] font-semibold text-white">{mission.title}</p>
        <p className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${done ? "border-emerald-300/45 bg-emerald-400/15 text-emerald-100" : "border-sky-300/40 bg-sky-400/15 text-sky-100"}`}>
          {safeValue}/{safeTotal}
        </p>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full border border-white/15 bg-white/10">
        <div
          className={`h-full rounded-full transition-all duration-300 ${done ? "bg-gradient-to-r from-emerald-300 to-emerald-500" : "bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-500"}`}
          style={{ width: `${Math.min(100, Math.round((safeValue / safeTotal) * 100))}%` }}
        />
      </div>
    </div>
  );
}

