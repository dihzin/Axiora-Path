import { AxionMascot } from "@/components/axion-mascot";
import { Check } from "lucide-react";
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

const MOOD_TONES: Record<Mood, string> = {
  happy: "border-[#79DCA9] bg-[#E8FFF2]",
  neutral: "border-[#BFD3EB] bg-[#F3F8FF]",
  sad: "border-[#BFC5D9] bg-[#F4F6FC]",
  angry: "border-[#F4B8A8] bg-[#FFF2EE]",
  tired: "border-[#D7C4E8] bg-[#F8F1FF]",
};

export function MoodSelector({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
      {MOODS.map((mood) => {
        const selected = value === mood;
        return (
          <button
            key={mood}
            type="button"
            aria-label={`Selecionar humor ${MOOD_LABELS[mood]}`}
            className={cn(
              "relative min-w-0 rounded-2xl border bg-white px-1.5 py-1.5 transition-all duration-150 ease-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
              "hover:scale-[1.03] active:scale-[0.98]",
              selected ? "scale-[1.03] border-primary ring-2 ring-primary/35" : "border-border",
              selected && MOOD_TONES[mood],
            )}
            onClick={() => onChange(mood)}
          >
            {selected ? (
              <span className="absolute right-1 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-secondary text-white">
                <Check className="h-3 w-3" />
              </span>
            ) : null}
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white sm:h-10 sm:w-10">
              <AxionMascot mood={mood} size={32} animated showGlow={false} />
            </span>
            <span className="mt-1 block text-center text-[10px] font-semibold leading-tight text-foreground/85">{MOOD_LABELS[mood]}</span>
          </button>
        );
      })}
    </div>
  );
}
