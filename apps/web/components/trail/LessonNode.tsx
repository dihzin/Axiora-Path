"use client";

import type { TrailNodeType } from "@/lib/trail-types";
import { cn } from "@/lib/utils";

type LessonNodeProps = {
  type: TrailNodeType;
  title: string;
  subtitle?: string;
  onClick?: () => void;
  index?: number;
  variant?: "list" | "path";
};

const POP_DELAY_CLASS = ["[animation-delay:0ms]", "[animation-delay:80ms]", "[animation-delay:160ms]", "[animation-delay:240ms]", "[animation-delay:320ms]"] as const;

const NODE_STYLES: Record<
  TrailNodeType,
  { topColor: string; bottomColor: string; icon: React.ReactNode; iconClass?: string; pulse: boolean; size: string; ring?: string; badge: string }
> = {
  completed: {
    topColor: "#7BCB4A",
    bottomColor: "#5AA132",
    icon: (
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M5.5 12.5l4.1 4.1L18.5 7.7" stroke="#FFFFFF" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    iconClass: "translate-y-[1px]",
    pulse: false,
    size: "h-16 w-16",
    badge: "Concluída",
  },
  active: {
    topColor: "#7BCB4A",
    bottomColor: "#5AA132",
    ring: "ring-4 ring-[#FF8A63]/20 ring-offset-2 ring-offset-transparent",
    icon: (
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 3.2l2.5 5.2 5.7.8-4.1 3.9 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4.1-3.9 5.7-.8L12 3.2z" fill="#FFFFFF" />
      </svg>
    ),
    iconClass: "translate-y-[1px]",
    pulse: true,
    size: "h-20 w-20",
    badge: "Atual",
  },
  current: {
    topColor: "#7BCB4A",
    bottomColor: "#5AA132",
    ring: "ring-4 ring-[#FF8A63]/20 ring-offset-2 ring-offset-transparent",
    icon: (
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 3.2l2.5 5.2 5.7.8-4.1 3.9 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4.1-3.9 5.7-.8L12 3.2z" fill="#FFFFFF" />
      </svg>
    ),
    iconClass: "translate-y-[1px]",
    pulse: true,
    size: "h-20 w-20",
    badge: "Atual",
  },
  locked: {
    topColor: "#B9C3D1",
    bottomColor: "#9EA9BA",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="6" y="11" width="12" height="8.5" rx="2" stroke="#7F8B9D" strokeWidth="2.2" />
        <path d="M8.8 11V8.6a3.2 3.2 0 1 1 6.4 0V11" stroke="#7F8B9D" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    iconClass: "translate-y-[1px]",
    pulse: false,
    size: "h-16 w-16",
    badge: "Bloqueada",
  },
  future: {
    topColor: "#9DD9FF",
    bottomColor: "#6FB8F4",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="4.2" stroke="#F3FBFF" strokeWidth="2.2" />
        <path d="M12 3.7v2.2M12 18.1v2.2M3.7 12h2.2M18.1 12h2.2" stroke="#F3FBFF" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    ),
    iconClass: "translate-y-[1px]",
    pulse: false,
    size: "h-16 w-16",
    badge: "Em breve",
  },
  bonus: {
    topColor: "#9DD9FF",
    bottomColor: "#6FB8F4",
    icon: (
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="4.2" stroke="#F3FBFF" strokeWidth="2.2" />
        <path d="M12 3.7v2.2M12 18.1v2.2M3.7 12h2.2M18.1 12h2.2" stroke="#F3FBFF" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    ),
    iconClass: "translate-y-[1px]",
    pulse: false,
    size: "h-16 w-16",
    badge: "Bônus",
  },
};

export function LessonNode({ type, title, subtitle, onClick, index = 0, variant = "list" }: LessonNodeProps) {
  const node = NODE_STYLES[type];
  const clickable = type === "completed" || type === "active" || type === "current";
  const showActiveGlow = type === "active" || type === "current";
  const stateLabel =
    type === "completed"
      ? "Concluída"
      : type === "active" || type === "current"
        ? "Atual"
        : type === "future"
          ? "Futura"
          : "Bloqueada";
  const delayClass = POP_DELAY_CLASS[index % POP_DELAY_CLASS.length];
  const isPathVariant = variant === "path";

  if (isPathVariant) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="relative flex items-center justify-center">
          {showActiveGlow ? <span className="absolute h-24 w-24 rounded-full bg-[#FFB79F]/35 motion-safe:animate-pulse-ring" aria-hidden /> : null}
          <button
            type="button"
            aria-label={`${title} - ${stateLabel}`}
            aria-current={type === "active" || type === "current" ? "step" : undefined}
            data-node-state={type}
            onClick={clickable ? onClick : undefined}
            disabled={!clickable}
            className={cn(
              "relative z-10 rounded-full transition-transform transition-shadow transition-opacity duration-120 ease-out motion-safe:animate-pop-in",
              "flex items-center justify-center active:scale-95 motion-reduce:transition-none",
              node.size,
              delayClass,
              clickable ? "motion-safe:hover:scale-[1.04] hover:brightness-105 active:translate-y-1 motion-reduce:hover:scale-100" : "cursor-default opacity-90",
              node.ring,
              type === "completed" ? "motion-safe:animate-[lesson-feedback-pop_280ms_ease-out]" : null,
            )}
          >
            <span
              className="absolute inset-0 rounded-full translate-y-[5px] shadow-[0_6px_10px_rgba(0,0,0,0.14)]"
              style={{ backgroundColor: node.bottomColor }}
              aria-hidden
            />
            <span
              className={cn(
                "absolute inset-0 rounded-full",
                "bg-[radial-gradient(circle_at_50%_24%,rgba(255,255,255,0.24),transparent_62%),linear-gradient(to_bottom,transparent_62%,rgba(0,0,0,0.12))]",
              )}
              style={{ backgroundColor: node.topColor }}
              aria-hidden
            />
            <span className={cn("relative z-10 flex items-center justify-center", node.iconClass)}>{node.icon}</span>
          </button>
        </div>
        {type === "active" || type === "current" ? (
          <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.04em] text-[#20A090] shadow-[0_2px_8px_rgba(0,0,0,0.1)]">
            Começar
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex shrink-0 items-center justify-center">
        {showActiveGlow ? <span className="absolute h-24 w-24 rounded-full bg-[#FFB79F]/35 motion-safe:animate-pulse-ring" aria-hidden /> : null}
        <button
          type="button"
          aria-label={`${title} - ${stateLabel}`}
          aria-current={type === "active" || type === "current" ? "step" : undefined}
          data-node-state={type}
          onClick={clickable ? onClick : undefined}
          disabled={!clickable}
          className={cn(
            "relative z-10 rounded-full transition-transform transition-shadow transition-opacity duration-120 ease-out motion-safe:animate-pop-in",
            "flex items-center justify-center active:scale-95 motion-reduce:transition-none",
            node.size,
            delayClass,
            clickable ? "motion-safe:hover:scale-[1.04] hover:brightness-105 active:translate-y-1 motion-reduce:hover:scale-100" : "cursor-default opacity-90",
            node.ring,
            type === "completed" ? "motion-safe:animate-[lesson-feedback-pop_280ms_ease-out]" : null,
          )}
        >
          <span
            className="absolute inset-0 rounded-full translate-y-[5px] shadow-[0_6px_10px_rgba(0,0,0,0.14)]"
            style={{ backgroundColor: node.bottomColor }}
            aria-hidden
          />
          <span
            className={cn(
              "absolute inset-0 rounded-full",
              "bg-[radial-gradient(circle_at_50%_24%,rgba(255,255,255,0.24),transparent_62%),linear-gradient(to_bottom,transparent_62%,rgba(0,0,0,0.12))]",
            )}
            style={{ backgroundColor: node.topColor }}
            aria-hidden
          />
          <span className={cn("relative z-10 flex items-center justify-center", node.iconClass)}>{node.icon}</span>
        </button>
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-[#17365E]">{title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.05em]",
              type === "completed" && "bg-[#EDF7E3] text-[#4E8A2F]",
              type === "active" && "bg-[#FFE9DF] text-[#C85832]",
              type === "current" && "bg-[#FFE9DF] text-[#C85832]",
              type === "future" && "bg-[#E7F5FF] text-[#2D79B0]",
              type === "bonus" && "bg-[#E7F5FF] text-[#2D79B0]",
              type === "locked" && "bg-[#EFF3F8] text-[#6E7F96]",
            )}
          >
            {node.badge}
          </span>
          {subtitle ? <span className="text-[11px] font-semibold text-[#6E7F96]">{subtitle}</span> : null}
        </div>
      </div>
    </div>
  );
}

