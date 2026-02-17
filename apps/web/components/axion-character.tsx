"use client";

type AxionCharacterProps = {
  stage: number;
  moodState: string;
  celebrating?: boolean;
  reducedMotion?: boolean;
};

function normalizeMood(moodState: string): string {
  return moodState.toUpperCase();
}

function eyePathByMood(moodState: string): { left: string; right: string } {
  const mood = normalizeMood(moodState);
  if (mood === "CELEBRATING" || mood === "EXCITED") {
    return { left: "M30 37 q4 3 8 0", right: "M52 37 q4 3 8 0" };
  }
  if (mood === "CONCERNED") {
    return { left: "M30 38 q4 -3 8 0", right: "M52 38 q4 -3 8 0" };
  }
  if (mood === "PROUD") {
    return { left: "M30 37 q4 1 8 0", right: "M52 37 q4 1 8 0" };
  }
  return { left: "M30 37 q4 0 8 0", right: "M52 37 q4 0 8 0" };
}

function glowClassByMood(moodState: string): string {
  const mood = normalizeMood(moodState);
  if (mood === "CELEBRATING") return "axion-glow-celebrating";
  if (mood === "EXCITED") return "axion-glow-excited";
  if (mood === "PROUD") return "axion-glow-proud";
  if (mood === "CONCERNED") return "axion-glow-concerned";
  return "axion-glow-neutral";
}

function scaleClassByStage(stage: number): string {
  if (stage >= 3) return "axion-stage-3";
  if (stage === 2) return "axion-stage-2";
  return "axion-stage-1";
}

export function AxionCharacter({ stage, moodState, celebrating = false, reducedMotion = false }: AxionCharacterProps) {
  const eye = eyePathByMood(moodState);
  return (
    <div
      className={`relative mx-auto ${scaleClassByStage(stage)} ${reducedMotion ? "" : "axion-float"} ${celebrating && !reducedMotion ? "axion-celebrate" : ""}`}
    >
      <div className={`${reducedMotion ? "axion-glow-static" : "axion-glow"} ${glowClassByMood(moodState)} absolute inset-0 rounded-full`} />
      <svg
        aria-label="Axion character"
        className="relative h-44 w-44"
        viewBox="0 0 96 96"
        role="img"
      >
        <circle cx="48" cy="48" r="32" fill="#1E2A38" />
        <circle cx="48" cy="48" r="30" fill="none" stroke="rgba(214, 167, 86, 0.28)" strokeWidth="1.5" />

        {stage >= 2 ? <circle cx="48" cy="18" r="4" fill="rgba(255,255,255,0.8)" /> : null}
        {stage >= 3 ? <circle cx="66" cy="28" r="3" fill="rgba(255,255,255,0.7)" /> : null}

        <path d={eye.left} stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <path d={eye.right} stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" />

        <path d="M35 58 q13 9 26 0" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      </svg>
    </div>
  );
}
