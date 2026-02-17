"use client";

type AvatarEvolutionProps = {
  stage: number;
};

export function AvatarEvolution({ stage }: AvatarEvolutionProps) {
  const safeStage = Math.max(1, Math.min(3, stage));

  return (
    <div className={`mx-auto w-fit rounded-xl border border-border bg-card p-3 ${safeStage >= 3 ? "avatar-stage-3" : ""}`}>
      <svg viewBox="0 0 120 120" className="h-24 w-24" role="img" aria-label={`Avatar stage ${safeStage}`}>
        <circle cx="60" cy="60" r="42" fill="#2F5D50" />
        <circle cx="60" cy="48" r="18" fill="#D6A756" />
        <rect x="42" y="66" width="36" height="24" rx="12" fill="#1E2A38" />

        {safeStage >= 2 ? (
          <>
            <circle cx="48" cy="46" r="4" fill="#1f2937" />
            <circle cx="72" cy="46" r="4" fill="#1f2937" />
            <path d="M48 33 L60 25 L72 33" stroke="#D6A756" strokeWidth="4" fill="none" strokeLinecap="round" />
          </>
        ) : null}

        {safeStage >= 3 ? (
          <>
            <circle cx="60" cy="60" r="44" fill="none" stroke="#D6A756" strokeWidth="3" strokeDasharray="4 3" />
            <circle cx="33" cy="60" r="2" fill="#D6A756" />
            <circle cx="87" cy="60" r="2" fill="#D6A756" />
            <circle cx="60" cy="28" r="2" fill="#D6A756" />
          </>
        ) : null}
      </svg>
      <p className="mt-2 text-center text-sm font-medium text-muted-foreground">Avatar Stage {safeStage}</p>
    </div>
  );
}
