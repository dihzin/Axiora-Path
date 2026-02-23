"use client";

import type { TrailNodeType } from "@axiora/shared";
import { cn } from "@/lib/utils";

type LessonNodeProps = {
  type: TrailNodeType;
  title: string;
  onClick?: () => void;
  index?: number;
};

const POP_DELAY_CLASS = ["[animation-delay:0ms]", "[animation-delay:80ms]", "[animation-delay:160ms]", "[animation-delay:240ms]", "[animation-delay:320ms]"] as const;

const NODE_STYLES: Record<
  TrailNodeType,
  { topColor: string; bottomColor: string; icon: React.ReactNode; iconClass?: string; pulse: boolean; size: string; ring?: string }
> = {
  completed: {
    topColor: "#58CC02",
    bottomColor: "#3A9A00",
    icon: (
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M5.5 12.5l4.1 4.1L18.5 7.7" stroke="#FFFFFF" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    iconClass: "translate-y-[1px]",
    pulse: false,
    size: "h-16 w-16",
  },
  active: {
    topColor: "#58CC02",
    bottomColor: "#3A9A00",
    ring: "ring-4 ring-[#58CC02]/25 ring-offset-2 ring-offset-transparent",
    icon: (
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 3.2l2.5 5.2 5.7.8-4.1 3.9 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4.1-3.9 5.7-.8L12 3.2z" fill="#FFFFFF" />
      </svg>
    ),
    iconClass: "translate-y-[1px]",
    pulse: true,
    size: "h-20 w-20",
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
  },
  bonus: {
    topColor: "#B9C3D1",
    bottomColor: "#9EA9BA",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M11 2.8h4.6L12.9 10h4.8L9.8 21.2l2.2-7.2H8.1L11 2.8z" fill="#7F8B9D" />
      </svg>
    ),
    iconClass: "translate-y-[1px]",
    pulse: false,
    size: "h-16 w-16",
  },
};

export function LessonNode({ type, title, onClick, index = 0 }: LessonNodeProps) {
  const node = NODE_STYLES[type];
  const clickable = type !== "locked" && type !== "bonus";
  const stateLabel = type === "completed" ? "Concluída" : type === "active" ? "Ativa" : "Bloqueada";
  const delayClass = POP_DELAY_CLASS[index % POP_DELAY_CLASS.length];

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative flex items-center justify-center">
        {node.pulse ? <span className="absolute h-24 w-24 rounded-full bg-[#58CC02]/25 motion-safe:animate-pulse-ring" aria-hidden /> : null}
        <button
          type="button"
          aria-label={`${title} - ${stateLabel}`}
          aria-current={type === "active" ? "step" : undefined}
          data-node-state={type}
          onClick={clickable ? onClick : undefined}
          disabled={!clickable}
          className={cn(
            "relative z-10 rounded-full transition-all duration-120 ease-out motion-safe:animate-pop-in",
            "flex items-center justify-center active:scale-95 motion-reduce:transition-none",
            node.size,
            delayClass,
            clickable ? "motion-safe:hover:scale-[1.04] hover:brightness-105 active:translate-y-1 motion-reduce:hover:scale-100" : "cursor-default",
            node.ring,
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
      {type === "active" ? (
        <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.04em] text-[#20A090] shadow-[0_2px_8px_rgba(0,0,0,0.1)]">
          Começar
        </span>
      ) : null}
    </div>
  );
}
