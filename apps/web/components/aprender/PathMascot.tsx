"use client";

import Image from "next/image";

type PathMascotProps = {
  message: string;
  visible: boolean;
  onDismiss: () => void;
  x: number;
  y: number;
};

export function PathMascot({ message, visible, onDismiss, x, y }: PathMascotProps) {
  return (
    <button
      type="button"
      onClick={onDismiss}
      aria-label="Axion"
      style={{ left: `${x}px`, top: `${y}px` }}
      className={`absolute z-30 inline-flex items-center gap-1.5 rounded-full border border-[#C9D4E6] bg-[color:var(--path-surface)] px-1.5 py-1 shadow-[var(--path-shadow-1)] transition-all duration-150 ${
        visible ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0"
      }`}
    >
      <Image src="/icons/axion.svg" alt="" aria-hidden width={28} height={28} className="h-7 w-7 rounded-full" />
      <span className="rounded-full bg-[color:var(--path-surface-alt)] px-2 py-0.5 text-[11px] font-black text-[color:var(--path-ink)]">{message}</span>
    </button>
  );
}
