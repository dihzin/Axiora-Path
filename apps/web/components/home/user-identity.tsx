"use client";

import { AvatarEvolution } from "@/components/avatar-evolution";
import { ChildAvatar } from "@/components/child-avatar";

/** Avatar card — rendered in the right column of HeroSection */
type UserIdentityProps = {
  name: string;
  avatarKey: string | null;
  avatarStage: number;
};

export function UserIdentity({ name, avatarKey, avatarStage }: UserIdentityProps) {
  return (
    <div
      title="Ver perfil"
      className="group mx-auto flex w-full max-w-[170px] cursor-pointer flex-col items-center rounded-2xl border border-white/50 bg-white/65 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.90),0_4px_16px_rgba(0,0,0,0.05)] backdrop-blur-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:bg-white/75 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_6px_20px_rgba(0,0,0,0.07)] md:mx-0"
    >
      {avatarKey ? (
        <ChildAvatar name={name || "Criança"} avatarKey={avatarKey} size={56} />
      ) : (
        <AvatarEvolution stage={avatarStage} />
      )}
      <p className="axiora-subtitle mt-1 text-center text-[11px] font-semibold">
        {name || "Perfil infantil"}
      </p>
      <p className="axiora-subtitle mt-0.5 text-[10px] opacity-0 transition-opacity duration-200 group-hover:opacity-40">
        Ver perfil
      </p>
    </div>
  );
}
