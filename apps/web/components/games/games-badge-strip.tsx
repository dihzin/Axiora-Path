import { Award, Lock } from "lucide-react";

import type { GameMetagameBadge } from "@/lib/api/client";

type GamesBadgeStripProps = {
  badges: GameMetagameBadge[];
};

export function GamesBadgeStrip({ badges }: GamesBadgeStripProps) {
  if (badges.length === 0) return null;
  return (
    <section className="space-y-2">
      <header className="flex items-center gap-2">
        <Award className="h-4 w-4 text-[#F7BE53]" />
        <p className="text-sm font-bold text-[#E9F3FF]">Selos de prática</p>
      </header>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        {badges.slice(0, 5).map((badge) => (
          <article
            key={badge.id}
            className={`rounded-2xl border p-3 ${
              badge.unlocked
                ? "border-[#7DE8C6]/35 bg-[linear-gradient(140deg,rgba(14,64,75,0.8)_0%,rgba(12,53,64,0.72)_100%)]"
                : "border-white/14 bg-[linear-gradient(140deg,rgba(16,38,58,0.84)_0%,rgba(12,30,47,0.82)_100%)]"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className={`text-sm font-black ${badge.unlocked ? "text-[#E9FFF8]" : "text-[#D9E8F7]"}`}>{badge.title}</p>
                <p className={`mt-1 text-xs ${badge.unlocked ? "text-[#A7DCCF]" : "text-[#AFC5DE]"}`}>{badge.description}</p>
              </div>
              {badge.unlocked ? (
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl border border-[#7DE8C6]/40 bg-[#123F50]/85 text-[#95FFDF]">
                  <Award className="h-3.5 w-3.5" />
                </span>
              ) : (
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-xl border border-white/16 bg-[#102D46]/85 text-[#9BB7D3]">
                  <Lock className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
            <p className={`mt-2 text-[11px] font-semibold ${badge.unlocked ? "text-[#9FE7D4]" : "text-[#9CB7D4]"}`}>
              {badge.progress}/{badge.target}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

