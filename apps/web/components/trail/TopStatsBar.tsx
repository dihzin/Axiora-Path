"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Battery, BellDot, HelpCircle, LogOut, Settings, Trophy, UserRound, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { FlameIcon } from "@/components/ui/icons/FlameIcon";
import { GemIcon } from "@/components/ui/icons/GemIcon";
import { StarIcon } from "@/components/ui/icons/StarIcon";

// ── Value-change pulse ─────────────────────────────────────────────────────────
// Returns true for ~550ms whenever `value` changes, enabling a brief brightness
// flash on the number — game feel without being distracting.

function useChangePulse(value: string | number, duration = 550): boolean {
  const [pulsing, setPulsing] = useState(false);
  const prevRef = useRef<string | number>(value);
  useEffect(() => {
    if (prevRef.current === value) return;
    prevRef.current = value;
    setPulsing(true);
    const t = setTimeout(() => setPulsing(false), duration);
    return () => clearTimeout(t);
  }, [value, duration]);
  return pulsing;
}

// ── Types ──────────────────────────────────────────────────────────────────────

type TopStatsBarProps = {
  streak: number;
  gems: number;
  xp: number;
  xpTotal?: number;
  energyCurrent?: number; // -1 = não carregado/indisponível
  energyMax?: number;
  notificationCount?: number;
  isLoading?: boolean;
  variant?: "compact" | "global";
  className?: string;
  action?: ReactNode;
};

// ── Main component ─────────────────────────────────────────────────────────────

export function TopStatsBar({
  streak,
  gems,
  xp,
  xpTotal = 0,
  energyCurrent = -1,
  energyMax = 10,
  notificationCount = 0,
  isLoading = false,
  variant = "compact",
  className,
  action,
}: TopStatsBarProps) {
  const router = useRouter();
  const safeXp = Math.max(0, Math.min(100, xp));
  const safeGems = Math.max(0, Math.floor(gems));
  const safeXpTotal = Math.max(0, Math.floor(xpTotal));
  const safeStreak = Math.max(0, Math.floor(streak));
  const hasEnergy = energyCurrent >= 0;
  const formatInt = (n: number) => new Intl.NumberFormat("pt-BR").format(n);

  // ── Skeleton state ─────────────────────────────────────────────────────────
  if (isLoading && variant === "global") {
    return (
      <div
        className={cn(
          "relative z-30 mx-auto flex h-[52px] w-full items-center justify-between gap-3 rounded-[14px] border-2 border-[#6D4C41]/70 bg-[linear-gradient(180deg,rgba(42,24,16,0.92),rgba(30,14,8,0.90))] px-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.18),0_0_0_1px_rgba(255,183,3,0.06),inset_0_1px_0_rgba(255,183,3,0.10)]",
          className,
        )}
        aria-busy="true"
        aria-label="Carregando estatísticas..."
      >
        <div className="flex items-center gap-2">
          <SkeletonPill width={96} />
          <SkeletonPill width={82} />
        </div>
        <div className="flex items-center gap-1.5">
          <SkeletonPill width={88} />
          <SkeletonPill width={102} />
          <SkeletonCircle />
          <SkeletonCircle />
          <SkeletonCircle />
        </div>
      </div>
    );
  }

  if (isLoading && variant === "compact") {
    return (
      <div className={cn("relative z-20 mx-auto flex w-full items-center justify-between gap-2", className)} aria-busy="true">
        <div className="flex h-11 items-center gap-2 rounded-[20px] border-2 border-[#6D4C41]/70 bg-[linear-gradient(180deg,rgba(42,24,16,0.88),rgba(30,14,8,0.84))] px-2 py-1.5">
          <SkeletonPill width={72} />
          <SkeletonPill width={72} />
          <SkeletonPill width={64} />
        </div>
      </div>
    );
  }

  if (variant === "global") {
    return (
      <div
        className={cn(
          "relative z-30 mx-auto flex h-[52px] w-full items-center justify-between gap-3 rounded-[14px] border-2 border-[#6D4C41]/70 bg-[linear-gradient(180deg,rgba(42,24,16,0.92),rgba(30,14,8,0.90))] px-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.18),0_0_0_1px_rgba(255,183,3,0.06),inset_0_1px_0_rgba(255,183,3,0.10)]",
          className,
        )}
      >
        {/* Left: activity stats */}
        <div className="flex min-w-0 items-center gap-2">
          <HudPill
            icon={<FlameIcon className="h-4 w-4 text-orange-400" />}
            value={`${safeStreak}`}
            label="dias"
            watchValue={safeStreak}
            tooltip={
              safeStreak > 0
                ? `Você está em uma sequência de ${safeStreak} dia${safeStreak !== 1 ? "s" : ""}`
                : "Nenhuma sequência ativa — estude hoje!"
            }
            className="min-w-[96px] justify-center"
          />
          <HudPill
            icon={<Zap className="h-4 w-4 text-amber-300" strokeWidth={2.2} />}
            value={`${safeXp}%`}
            label="nível"
            watchValue={safeXp}
            tooltip={`${safeXp}% do nível atual completo`}
            className="min-w-[82px] justify-center"
          />
        </div>

        {/* Divider */}
        <span aria-hidden className="h-5 w-px shrink-0 bg-[#8B6642]/30" />

        {/* Right: economy + actions */}
        <div className="flex min-w-0 items-center gap-1.5">
          <HudPill
            icon={<GemIcon className="h-4 w-4 text-fuchsia-300" />}
            value={formatInt(safeGems)}
            watchValue={safeGems}
            tooltip="Saldo disponível de moedas Axion"
            className="min-w-[88px] justify-center"
          />
          {hasEnergy ? (
            <HudPill
              icon={<Battery className="h-4 w-4 text-cyan-300" strokeWidth={1.8} />}
              value={`${energyCurrent}`}
              label={`/${energyMax}`}
              watchValue={energyCurrent}
              tooltip={`Energia atual: ${energyCurrent} / ${energyMax}`}
              className="min-w-[88px] justify-center"
            />
          ) : null}
          <HudPill
            icon={<StarIcon className="h-4 w-4 text-yellow-300" />}
            value={formatInt(safeXpTotal)}
            label="xp"
            watchValue={safeXpTotal}
            tooltip="XP total acumulado"
            className="min-w-[102px] justify-center"
          />

          <ActionPill
            icon={<BellDot className="h-4 w-4" strokeWidth={1.8} />}
            label={
              notificationCount > 0
                ? `Você tem ${notificationCount} aviso${notificationCount !== 1 ? "s" : ""} pendente${notificationCount !== 1 ? "s" : ""}`
                : "Sem novos avisos"
            }
            alert={notificationCount > 0}
            onClick={() => router.push("/child/notifications")}
          />
          <ActionPill
            icon={<HelpCircle className="h-4 w-4" strokeWidth={1.8} />}
            label="Ajuda"
            onClick={() => router.push("/child/help")}
          />
          <ProfileMenuButton router={router} />
        </div>
      </div>
    );
  }

  // ── Compact (mobile) variant ───────────────────────────────────────────────
  return (
    <div className={cn("relative z-20 mx-auto flex w-full items-center justify-between gap-2", className)}>
      <div className="flex h-11 flex-wrap items-center gap-2 rounded-[20px] border-2 border-[#6D4C41]/70 bg-[linear-gradient(180deg,rgba(42,24,16,0.88),rgba(30,14,8,0.84))] px-2 py-1.5 shadow-[0_10px_24px_rgba(0,0,0,0.32),0_0_0_1px_rgba(255,183,3,0.06),inset_0_1px_0_rgba(255,183,3,0.08)]">
        <StatItem
          label="dias"
          value={safeStreak}
          watchValue={safeStreak}
          icon={<FlameIcon className="h-4 w-4 text-orange-400/90" />}
          tooltip={
            safeStreak > 0
              ? `Você está em uma sequência de ${safeStreak} dia${safeStreak !== 1 ? "s" : ""}`
              : "Nenhuma sequência ativa — estude hoje!"
          }
        />
        <StatItem
          label="gemas"
          value={formatInt(safeGems)}
          watchValue={safeGems}
          icon={<GemIcon className="h-4 w-4 text-fuchsia-300/90" />}
          tooltip="Saldo disponível de moedas Axion"
        />
        <StatItem
          label="xp"
          value={`${safeXp}%`}
          watchValue={safeXp}
          icon={<Zap className="h-4 w-4 text-amber-300/90" strokeWidth={2.2} />}
          tooltip={`${safeXp}% do nível atual completo`}
        />
        {hasEnergy ? (
          <StatItem
            label="energia"
            value={`${energyCurrent}/${energyMax}`}
            watchValue={energyCurrent}
            icon={<Battery className="h-4 w-4 text-cyan-300/90" strokeWidth={1.8} />}
            tooltip={`Energia atual: ${energyCurrent} / ${energyMax}`}
          />
        ) : null}
      </div>
      {action}
    </div>
  );
}

// ── Skeleton primitives ───────────────────────────────────────────────────────

function SkeletonPill({ width }: { width: number }) {
  return (
    <div
      aria-hidden
      className="h-[34px] animate-pulse rounded-full bg-[rgba(255,183,3,0.08)]"
      style={{ width }}
    />
  );
}

function SkeletonCircle() {
  return (
    <div
      aria-hidden
      className="h-[34px] w-[34px] animate-pulse rounded-full bg-[rgba(255,183,3,0.08)]"
    />
  );
}

// ── HudPill — stat pill for global/desktop variant ────────────────────────────

function HudPill({
  icon,
  value,
  label,
  tooltip,
  watchValue,
  className,
}: {
  icon: ReactNode;
  value: string;
  label?: string;
  tooltip?: string;
  watchValue?: number | string;
  className?: string;
}) {
  const pulsing = useChangePulse(watchValue ?? value);
  return (
    <div
      className={cn(
        "group relative inline-flex h-[34px] select-none items-center gap-1.5 rounded-full border border-[#8B6642]/50 bg-[rgba(44,24,8,0.80)] px-3.5 text-[13px] font-bold leading-none",
        "shadow-[inset_0_1px_0_rgba(255,183,3,0.10),0_0_8px_rgba(255,183,3,0.06)]",
        "transition-[border-color,background-color,box-shadow] duration-150",
        "hover:border-[#8B6642]/80 hover:bg-[rgba(60,34,12,0.88)] hover:shadow-[inset_0_1px_0_rgba(255,183,3,0.16),0_0_12px_rgba(255,183,3,0.10)]",
        className,
      )}
    >
      {icon}
      <span
        className={cn(
          "text-[#FFF3CC] transition-[filter,transform] duration-300 ease-out",
          pulsing && "brightness-[1.7] scale-[1.08]",
        )}
      >
        {value}
      </span>
      {label ? (
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#C8A882]/80">{label}</span>
      ) : null}
      {tooltip ? <Tooltip text={tooltip} /> : null}
    </div>
  );
}

// ── ActionPill — icon button (bell, help) ─────────────────────────────────────

function ActionPill({
  icon,
  label,
  alert = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  alert?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="group relative inline-flex h-[34px] w-[34px] select-none items-center justify-center rounded-full border border-[#8B6642]/40 bg-[rgba(44,24,8,0.80)] text-[#C8A882] shadow-[inset_0_1px_0_rgba(255,183,3,0.08)] transition-[border-color,background-color,box-shadow,transform,color] duration-150 hover:border-[#8B6642]/65 hover:bg-[rgba(60,34,12,0.88)] hover:text-[#FFF3CC] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB703]/50 focus-visible:ring-offset-1 focus-visible:ring-offset-[#1A0D05]"
    >
      {icon}
      {alert ? (
        <span
          aria-hidden
          className="absolute right-[7px] top-[7px] h-[7px] w-[7px] rounded-full bg-red-500 ring-1 ring-[#2A1810] shadow-[0_0_6px_rgba(239,68,68,0.6)] motion-safe:animate-pulse"
        />
      ) : null}
      <Tooltip text={label} />
    </button>
  );
}

// ── StatItem — stat pill for compact/mobile variant ───────────────────────────

function StatItem({
  icon,
  value,
  label,
  tooltip,
  watchValue,
}: {
  icon: ReactNode;
  value: string | number;
  label: string;
  tooltip?: string;
  watchValue?: number | string;
}) {
  const pulsing = useChangePulse(watchValue ?? value);
  return (
    <div
      className="group relative inline-flex cursor-default select-none items-center gap-1.5 rounded-full border border-[#8B6642]/50 bg-[rgba(44,24,8,0.72)] px-3 py-1.5 leading-none shadow-[inset_0_1px_0_rgba(255,183,3,0.10),0_0_8px_rgba(255,183,3,0.06)] transition-[border-color,background-color] duration-150 hover:border-[#8B6642]/75 hover:bg-[rgba(60,34,12,0.80)]"
      aria-label={tooltip ?? label}
    >
      {icon}
      <div className="inline-flex items-baseline gap-1">
        <span
          className={cn(
            "text-[15px] font-bold leading-none text-[#FFF3CC] transition-[filter,transform] duration-300 ease-out",
            pulsing && "brightness-[1.7] scale-[1.08]",
          )}
        >
          {value}
        </span>
        <span className="text-[10px] font-semibold uppercase leading-none tracking-[0.08em] text-[#C8A882]/80">
          {label}
        </span>
      </div>
      {tooltip ? <Tooltip text={tooltip} /> : null}
    </div>
  );
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
// Appears above the parent on hover with a short entry delay (avoids flicker on
// fast mouse-overs). Exit is immediate for a snappy feel.

function Tooltip({ text }: { text: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none invisible absolute bottom-full left-1/2 z-50 mb-2.5 -translate-x-1/2 whitespace-nowrap",
        "rounded-[8px] bg-[#1A0D05] px-2.5 py-[7px] text-[11px] font-medium leading-none text-[#FFF3CC]",
        "shadow-[0_4px_14px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,183,3,0.08)]",
        // Delayed entry (200ms), instant exit
        "opacity-0 delay-0 transition-[opacity] duration-150",
        "group-hover:visible group-hover:opacity-100 group-hover:delay-[200ms]",
        "group-focus-visible:visible group-focus-visible:opacity-100 group-focus-visible:delay-[200ms]",
      )}
    >
      {text}
      <span
        aria-hidden
        className="absolute left-1/2 top-full -translate-x-1/2 border-[5px] border-transparent border-t-[#1A0D05]"
      />
    </div>
  );
}

// ── ProfileMenuButton ─────────────────────────────────────────────────────────
// Trigger + animated dropdown menu.
// - Closes on outside click, Escape key, or item selection.
// - Returns focus to trigger on Escape.
// - Menu items excluded from tab order when menu is closed (tabIndex -1).
// - Menu animates via opacity + transform + visibility (no JS needed).

function ProfileMenuButton({ router }: { router: ReturnType<typeof useRouter> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Outside click
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Escape key — closes and returns focus to trigger
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const navigate = (path: string) => {
    setOpen(false);
    router.push(path);
  };

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        aria-label="Meu perfil"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className="group relative inline-flex h-[34px] w-[34px] select-none items-center justify-center rounded-full border border-[#FFB703]/45 bg-[linear-gradient(135deg,rgba(92,64,33,0.9),rgba(62,39,19,0.9))] text-[#FFF3CC] shadow-[0_0_12px_rgba(255,183,3,0.18),inset_0_1px_0_rgba(255,255,255,0.10)] transition-[border-color,box-shadow,transform] duration-150 hover:border-[#FFB703]/70 hover:shadow-[0_0_20px_rgba(255,183,3,0.32)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB703]/50 focus-visible:ring-offset-1 focus-visible:ring-offset-[#1A0D05]"
      >
        <UserRound className="h-[18px] w-[18px]" strokeWidth={1.8} />
        {!open ? <Tooltip text="Meu perfil" /> : null}
      </button>

      {/* Dropdown — always in DOM, animated via CSS */}
      <div
        role="menu"
        aria-label="Menu do perfil"
        className={cn(
          "absolute right-0 top-[calc(100%+6px)] z-50 w-[168px] overflow-hidden rounded-[12px]",
          "border border-[#6D4C41]/60 bg-[rgba(26,12,4,0.97)] backdrop-blur-sm",
          "shadow-[0_8px_24px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,183,3,0.06)]",
          "origin-top-right transition-[opacity,transform,visibility] duration-150",
          open
            ? "visible translate-y-0 scale-100 opacity-100"
            : "invisible -translate-y-1 scale-[0.95] opacity-0",
        )}
      >
        <ProfileMenuItem
          icon={<UserRound className="h-3.5 w-3.5" strokeWidth={1.8} />}
          label="Meu Perfil"
          onClick={() => navigate("/child/profile")}
          tabIndex={open ? 0 : -1}
        />
        <ProfileMenuItem
          icon={<Trophy className="h-3.5 w-3.5" strokeWidth={1.8} />}
          label="Conquistas"
          onClick={() => navigate("/child/achievements")}
          tabIndex={open ? 0 : -1}
        />
        <ProfileMenuItem
          icon={<Settings className="h-3.5 w-3.5" strokeWidth={1.8} />}
          label="Configurações"
          onClick={() => navigate("/child/settings")}
          tabIndex={open ? 0 : -1}
        />
        <div className="mx-3 my-1 border-t border-[#6D4C41]/40" />
        <ProfileMenuItem
          icon={<LogOut className="h-3.5 w-3.5" strokeWidth={1.8} />}
          label="Sair"
          onClick={() => navigate("/logout")}
          tabIndex={open ? 0 : -1}
          danger
        />
      </div>
    </div>
  );
}

// ── ProfileMenuItem ───────────────────────────────────────────────────────────

function ProfileMenuItem({
  icon,
  label,
  onClick,
  tabIndex = 0,
  danger = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  tabIndex?: number;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={tabIndex}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-semibold",
        "transition-colors duration-100",
        "focus-visible:outline-none focus-visible:ring-inset focus-visible:ring-2 focus-visible:ring-[#FFB703]/40",
        danger
          ? "text-red-400/80 hover:bg-red-950/40 hover:text-red-400"
          : "text-[#C8A882] hover:bg-[rgba(255,183,3,0.08)] hover:text-[#FFF3CC]",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
