import { AxionMascot } from "@/components/axion-mascot";
import type { Mood } from "@/lib/types/mood";
import { cn } from "@/lib/utils";

type Props = {
  value?: Mood;
  onChange: (mood: Mood) => void;
};

const MOODS: Mood[] = ["happy", "neutral", "sad", "angry", "tired"];

const MOOD_LABELS: Record<Mood, string> = {
  happy: "Feliz",
  neutral: "Neutro",
  sad: "Triste",
  angry: "Bravo",
  tired: "Cansado",
};

export function MoodSelector({ value, onChange }: Props) {
  return (
    <div className="hide-scrollbar flex items-center gap-2 overflow-x-auto pb-1">
      {MOODS.map((mood) => {
        const selected = value === mood;
        return (
          <button
            key={mood}
            type="button"
            aria-label={`Selecionar humor ${MOOD_LABELS[mood]}`}
            className={cn(
              "rounded-2xl bg-white p-1.5 transition-all duration-150 ease-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
              "hover:scale-[1.03] active:scale-[0.98]",
              selected && "scale-105 ring-2 ring-primary",
            )}
            onClick={() => onChange(mood)}
          >
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white">
              <AxionMascot mood={mood} size={36} animated showGlow={false} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
