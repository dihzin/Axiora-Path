"use client";

type ProgressBarProps = {
  ropePos: number;
};

export function ProgressBar({ ropePos }: ProgressBarProps) {
  const clamped = Math.min(1, Math.max(0, ropePos));
  const leftPercent = (clamped * 100).toFixed(2);
  const rightPercent = ((1 - clamped) * 100).toFixed(2);

  return (
    <div className="relative h-5 w-full overflow-hidden rounded-full border-[3px] border-[#1f2937] bg-white/90 shadow-[inset_0_2px_5px_rgba(20,34,58,0.14)]">
      <div className="absolute inset-y-0 left-0 bg-[#ef4444]" style={{ width: `${leftPercent}%` }} />
      <div className="absolute inset-y-0 right-0 bg-[#3b82f6]" style={{ width: `${rightPercent}%` }} />
      <div className="absolute left-1/2 top-0 h-full w-[3px] -translate-x-1/2 bg-white" />
      <div
        className="absolute top-1/2 h-7 w-2 -translate-y-1/2 rounded-full border-2 border-white bg-[#111827] shadow-[0_0_0_2px_rgba(17,24,39,0.28)]"
        style={{ left: `calc(${leftPercent}% - 4px)` }}
        aria-hidden
      />
    </div>
  );
}
