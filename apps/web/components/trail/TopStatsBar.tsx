"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Battery, BellDot, HelpCircle, LogOut, Settings, Trophy, UserRound, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { FlameIcon } from "@/components/ui/icons/FlameIcon";
import { GemIcon } from "@/components/ui/icons/GemIcon";
import { StarIcon } from "@/components/ui/icons/StarIcon";
import { useChangePulse } from "@/hooks/use-change-pulse";
import { useHoverEffect } from "@/hooks/use-hover-effect";

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
  density?: "regular" | "dense";
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
  density = "regular",
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
  const denseGlobal = variant === "global" && density === "dense";
  const topBarShellClass = "border border-[#A07850]/42 bg-[linear-gradient(145deg,rgba(253,245,230,0.90),rgba(240,222,188,0.82))] backdrop-blur-md shadow-[0_10px_24px_rgba(44,30,18,0.16),inset_0_1px_0_rgba(255,255,255,0.70)]";

  // ── Skeleton state ─────────────────────────────────────────────────────────
  if (isLoading && variant === "global") {
    return (
      <div
        className={cn(
          denseGlobal
            ? "relative z-30 mx-auto flex h-[46px] w-full items-center justify-between gap-2 rounded-[13px] px-2.5"
            : "relative z-30 mx-auto flex h-[52px] w-full items-center justify-between gap-3 rounded-[14px] px-3.5",
          topBarShellClass,
          className,
        )}
        aria-busy="true"
        aria-label="Carregando estatísticas..."
      >
        <div className={cn("flex items-center", denseGlobal ? "gap-1.5" : "gap-2")}>
          <SkeletonPill width={denseGlobal ? 82 : 96} />
          <SkeletonPill width={denseGlobal ? 74 : 82} />
        </div>
        <div className={cn("flex items-center", denseGlobal ? "gap-1" : "gap-1.5")}>
          <SkeletonPill width={denseGlobal ? 76 : 88} />
          <SkeletonPill width={denseGlobal ? 80 : 102} />
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
        <div className={cn("flex h-11 items-center gap-2 rounded-[20px] px-2 py-1.5", topBarShellClass)}>
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
          denseGlobal
            ? "relative z-30 mx-auto flex h-[46px] w-full items-center justify-between gap-2 rounded-[13px] px-2.5"
            : "relative z-30 mx-auto flex h-[52px] w-full items-center justify-between gap-3 rounded-[14px] px-3.5",
          topBarShellClass,
          className,
        )}
      >
        {/* Left: activity stats */}
        <div className={cn("flex min-w-0 items-center", denseGlobal ? "gap-1.5" : "gap-2")}>
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
            className={cn("justify-center", denseGlobal ? "min-w-[82px]" : "min-w-[96px]")}
          />
          <HudPill
            icon={<Zap className="h-4 w-4 text-amber-300" strokeWidth={2.2} />}
            value={`${safeXp}%`}
            label="nível"
            watchValue={safeXp}
            tooltip={`${safeXp}% do nível atual completo`}
            className={cn("justify-center", denseGlobal ? "min-w-[74px]" : "min-w-[82px]")}
          />
        </div>

        {/* Divider */}
        <span aria-hidden className={cn("w-px shrink-0 bg-[#A07850]/24", denseGlobal ? "h-4" : "h-5")} />

        {/* Right: economy + actions */}
        <div className={cn("flex min-w-0 items-center", denseGlobal ? "gap-1" : "gap-1.5")}>
          <HudPill
            icon={<GemIcon className="h-4 w-4 text-fuchsia-300" />}
            value={formatInt(safeGems)}
            watchValue={safeGems}
            tooltip="Saldo disponível de moedas Axion"
            className={cn("justify-center", denseGlobal ? "min-w-[76px]" : "min-w-[88px]")}
          />
          {hasEnergy ? (
            <HudPill
              icon={<Battery className="h-4 w-4 text-cyan-300" strokeWidth={1.8} />}
              value={`${energyCurrent}`}
              label={`/${energyMax}`}
              watchValue={energyCurrent}
              tooltip={`Energia atual: ${energyCurrent} / ${energyMax}`}
              className={cn("justify-center", denseGlobal ? "min-w-[76px]" : "min-w-[88px]")}
            />
          ) : null}
          <HudPill
            icon={<StarIcon className="h-4 w-4 text-yellow-300" />}
            value={formatInt(safeXpTotal)}
            label="xp"
            watchValue={safeXpTotal}
            tooltip="XP total acumulado"
            className={cn("justify-center", denseGlobal ? "min-w-[88px]" : "min-w-[102px]")}
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
      <div className={cn("flex h-11 flex-wrap items-center gap-2 rounded-[20px] px-2 py-1.5", topBarShellClass)}>
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
      className="h-[34px] animate-pulse rounded-full border border-[#A07850]/24 bg-[rgba(160,120,80,0.10)]"
      style={{ width }}
    />
  );
}

function SkeletonCircle() {
  return (
    <div
      aria-hidden
      className="h-[34px] w-[34px] animate-pulse rounded-full border border-[#A07850]/24 bg-[rgba(160,120,80,0.10)]"
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
  const hoverFx = useHoverEffect({
    hoverScale: 1.02,
    tapScale: 0.97,
    glowShadow: "0 0 0 1px rgba(160,120,80,0.24), 0 10px 18px rgba(44,30,18,0.14)",
  });
  return (
    <div
      {...hoverFx.eventHandlers}
      style={hoverFx.style}
      className={cn(
        "group relative inline-flex h-[34px] select-none items-center gap-1.5 rounded-full border border-[#A07850]/36 bg-[linear-gradient(145deg,rgba(253,245,230,0.96),rgba(240,222,188,0.86))] px-3.5 text-[13px] font-bold leading-none",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.68),0_6px_14px_rgba(44,30,18,0.10)]",
        "transition-[border-color,background-color,box-shadow] duration-150",
        "hover:border-[#A07850]/58 hover:bg-[linear-gradient(145deg,rgba(255,248,235,0.98),rgba(245,228,195,0.92))] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.74),0_8px_16px_rgba(44,30,18,0.12)]",
        className,
      )}
    >
      {icon}
      <span
        className={cn(
          "text-[#2C1E16] transition-[filter,transform] duration-300 ease-out",
          pulsing && "brightness-[1.7] scale-[1.08]",
        )}
      >
        {value}
      </span>
      {label ? (
        <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#8F6F4E]">{label}</span>
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
  const hoverFx = useHoverEffect({
    hoverScale: 1.02,
    tapScale: 0.97,
    glowShadow: "0 0 0 1px rgba(160,120,80,0.30), 0 10px 20px rgba(44,30,18,0.16)",
  });
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      {...hoverFx.eventHandlers}
      style={hoverFx.style}
      className="group relative inline-flex h-[34px] w-[34px] select-none items-center justify-center rounded-full border border-[#A07850]/36 bg-[linear-gradient(145deg,rgba(253,245,230,0.96),rgba(240,222,188,0.86))] text-[#7A6149] shadow-[inset_0_1px_0_rgba(255,255,255,0.68),0_6px_14px_rgba(44,30,18,0.08)] transition-[border-color,background-color,box-shadow,transform,color] duration-150 hover:border-[#A07850]/58 hover:bg-[linear-gradient(145deg,rgba(255,248,235,0.98),rgba(245,228,195,0.92))] hover:text-[#2C1E16] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8A44D]/38 focus-visible:ring-offset-1 focus-visible:ring-offset-[#F3E4C8]"
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
  const hoverFx = useHoverEffect({
    hoverScale: 1.02,
    tapScale: 0.97,
    glowShadow: "0 0 0 1px rgba(160,120,80,0.24), 0 10px 18px rgba(44,30,18,0.12)",
  });
  return (
    <div
      {...hoverFx.eventHandlers}
      style={hoverFx.style}
      className="group relative inline-flex cursor-default select-none items-center gap-1.5 rounded-full border border-[#A07850]/36 bg-[linear-gradient(145deg,rgba(253,245,230,0.96),rgba(240,222,188,0.86))] px-3 py-1.5 leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.68),0_6px_14px_rgba(44,30,18,0.08)] transition-[border-color,background-color] duration-150 hover:border-[#A07850]/58 hover:bg-[linear-gradient(145deg,rgba(255,248,235,0.98),rgba(245,228,195,0.92))]"
      aria-label={tooltip ?? label}
    >
      {icon}
      <div className="inline-flex items-baseline gap-1">
        <span
          className={cn(
            "text-[15px] font-bold leading-none text-[#2C1E16] transition-[filter,transform] duration-300 ease-out",
            pulsing && "brightness-[1.7] scale-[1.08]",
          )}
        >
          {value}
        </span>
        <span className="text-[10px] font-semibold uppercase leading-none tracking-[0.08em] text-[#8F6F4E]">
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
        "rounded-[8px] border border-[#A07850]/34 bg-[linear-gradient(145deg,rgba(253,245,230,0.98),rgba(240,222,188,0.95))] px-2.5 py-[7px] text-[11px] font-medium leading-none text-[#2C1E16]",
        "shadow-[0_10px_24px_rgba(44,30,18,0.16),inset_0_1px_0_rgba(255,255,255,0.72)]",
        // Delayed entry (300ms), instant exit
        "opacity-0 delay-0 transition-[opacity] duration-150",
        "group-hover:visible group-hover:opacity-100 group-hover:delay-[300ms]",
        "group-focus-visible:visible group-focus-visible:opacity-100 group-focus-visible:delay-[300ms]",
      )}
    >
      {text}
      <span
        aria-hidden
        className="absolute left-1/2 top-full -translate-x-1/2 border-[5px] border-transparent border-t-[#F0DEBC]"
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
  const hoverFx = useHoverEffect({
    hoverScale: 1.02,
    tapScale: 0.97,
    glowShadow: "0 0 0 1px rgba(160,120,80,0.30), 0 10px 20px rgba(44,30,18,0.16)",
  });

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
        {...hoverFx.eventHandlers}
        style={hoverFx.style}
        className="group relative inline-flex h-[34px] w-[34px] select-none items-center justify-center rounded-full border border-[#A07850]/42 bg-[linear-gradient(145deg,rgba(253,245,230,0.97),rgba(240,222,188,0.90))] text-[#7A6149] shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_6px_14px_rgba(44,30,18,0.10)] transition-[border-color,box-shadow,transform,background-color,color] duration-150 hover:border-[#A07850]/60 hover:bg-[linear-gradient(145deg,rgba(255,248,235,0.99),rgba(245,228,195,0.94))] hover:text-[#2C1E16] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D8A44D]/38 focus-visible:ring-offset-1 focus-visible:ring-offset-[#F3E4C8]"
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
          "border border-[#A07850]/34 bg-[linear-gradient(145deg,rgba(253,245,230,0.98),rgba(240,222,188,0.95))] backdrop-blur-md",
          "shadow-[0_12px_28px_rgba(44,30,18,0.16),inset_0_1px_0_rgba(255,255,255,0.72)]",
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
        <div className="mx-3 my-1 border-t border-[#A07850]/18" />
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
        "focus-visible:outline-none focus-visible:ring-inset focus-visible:ring-2 focus-visible:ring-[#D8A44D]/30",
        danger
          ? "text-red-300/80 hover:bg-red-950/30 hover:text-red-200"
          : "text-[#6F5A47] hover:bg-[rgba(160,120,80,0.10)] hover:text-[#2C1E16]",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
