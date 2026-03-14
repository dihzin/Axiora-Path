import type { ReactNode } from "react";

type GameSkillSectionProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

export function GameSkillSection({ title, subtitle, children }: GameSkillSectionProps) {
  return (
    <section className="space-y-3">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-[#E8F3FF]">{title}</h2>
          <p className="text-xs font-semibold text-[#AFC5DE]">{subtitle}</p>
        </div>
      </header>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">{children}</div>
    </section>
  );
}
