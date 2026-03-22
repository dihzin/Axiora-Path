"use client";

import Link from "next/link";
import { Bell, Settings, ShieldQuestion, Trophy, UserRound } from "lucide-react";

import { ChildBottomNav } from "@/components/child-bottom-nav";
import { ChildDesktopShell } from "@/components/child-desktop-shell";

const ICON_MAP = {
  notifications: Bell,
  help: ShieldQuestion,
  profile: UserRound,
  achievements: Trophy,
  settings: Settings,
} as const;

type PlaceholderKey = keyof typeof ICON_MAP;

export function ChildPlaceholderScreen({
  title,
  description,
  kind,
}: {
  title: string;
  description: string;
  kind: PlaceholderKey;
}) {
  const Icon = ICON_MAP[kind];
  return (
    <ChildDesktopShell activeNav="axion" menuSkin="trail">
      <main className="mx-auto flex min-h-screen w-full max-w-[980px] items-center justify-center px-4 pb-24 pt-6">
        <section className="w-full max-w-[560px] rounded-3xl border border-[#BFD3EE] bg-[linear-gradient(180deg,#EFF6FF_0%,#F8FBFF_100%)] p-6 text-center shadow-[0_14px_30px_rgba(32,88,140,0.14)]">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#315E9F] shadow-[0_8px_20px_rgba(32,88,140,0.12)]">
            <Icon className="h-5 w-5" />
          </div>
          <h1 className="text-[20px] font-extrabold text-[#1B365D]">{title}</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-[#4D6280]">{description}</p>
          <div className="mt-5 flex items-center justify-center gap-2">
            <Link href="/child" className="axiora-chunky-btn axiora-control-btn px-4 py-2 text-xs font-extrabold text-[#2A456D]">
              Voltar ao início
            </Link>
            <Link href="/child/aprender" className="axiora-chunky-btn px-4 py-2 text-xs font-extrabold text-white">
              Ir para aprender
            </Link>
          </div>
        </section>
      </main>
      <ChildBottomNav />
    </ChildDesktopShell>
  );
}

