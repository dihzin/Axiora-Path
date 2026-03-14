import { ArrowRight, Sparkles, Trophy } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

type GamesHeroProps = {
  level: number;
  xpTotal: number;
  availableCount: number;
  recordsCount: number;
  onPrimaryAction: () => void;
};

export function GamesHero({ level, xpTotal, availableCount, recordsCount, onPrimaryAction }: GamesHeroProps) {
  return (
    <section className="relative overflow-hidden rounded-[28px] border border-[#BFD9EE]/70 bg-[linear-gradient(130deg,rgba(255,255,255,0.97)_0%,rgba(238,249,255,0.95)_44%,rgba(231,255,249,0.96)_100%)] p-5 shadow-[0_20px_46px_rgba(15,37,65,0.16)] sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(59,201,176,0.26)_0%,rgba(59,201,176,0)_68%)]" />
      <div className="pointer-events-none absolute -left-20 bottom-[-6.2rem] h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(87,149,255,0.2)_0%,rgba(87,149,255,0)_72%)]" />

      <div className="relative z-10">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-[#A9DDF1] bg-[#EFFFFC] px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-[#0D8A7D]">
          <Sparkles className="h-3.5 w-3.5" />
          Hub de prática Axiora
        </p>
        <h1 className="mt-3 text-[1.6rem] font-black leading-tight text-[#15334D] sm:text-[2rem]">Jogos para subir de nível com inteligência</h1>
        <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-[#335577] sm:text-[15px]">
          Cada partida treina raciocínio, foco e decisões financeiras. Jogue rápido, ganhe XP e evolua no seu caminho.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap">
          <div className="rounded-2xl border border-[#CFE4F5] bg-white/90 px-3 py-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6582A2]">Nível</p>
            <p className="text-lg font-black text-[#173A55]">{level}</p>
          </div>
          <div className="rounded-2xl border border-[#CFE4F5] bg-white/90 px-3 py-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6582A2]">XP em jogos</p>
            <p className="text-lg font-black text-[#173A55]">{xpTotal}</p>
          </div>
          <div className="rounded-2xl border border-[#CFE4F5] bg-white/90 px-3 py-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6582A2]">Jogos ativos</p>
            <p className="text-lg font-black text-[#173A55]">{availableCount}</p>
          </div>
          <div className="rounded-2xl border border-[#CFE4F5] bg-white/90 px-3 py-2">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#6582A2]">Recordes</p>
            <p className="inline-flex items-center gap-1 text-lg font-black text-[#173A55]">
              <Trophy className="h-4 w-4 text-[#F2994A]" />
              {recordsCount}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2.5">
          <Button className="min-w-[178px]" onClick={onPrimaryAction}>
            Jogar agora
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button asChild variant="outline" className="min-w-[178px] border-[#BCD3E8] bg-white/92 text-[#264A68] hover:bg-white">
            <Link href="/child/aprender">Ver trilhas de aprendizado</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

