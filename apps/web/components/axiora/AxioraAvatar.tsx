import Image from "next/image";

import { cn } from "@/lib/utils";
import type { Mood } from "@/lib/types/mood";

type Props = {
  mood: Mood;
  size?: number;
  clickable?: boolean;
  onClick?: () => void;
  className?: string;
};

const MOOD_LABELS: Record<Mood, string> = {
  happy: "Feliz",
  neutral: "Neutro",
  sad: "Triste",
  angry: "Bravo",
  tired: "Cansado",
};

export function AxioraAvatar({ mood, size = 48, clickable = false, onClick, className }: Props) {
  const sharedClassName = cn(
    "inline-flex items-center justify-center rounded-full text-foreground transition-all duration-150 ease-out",
    clickable && "cursor-pointer hover:scale-105 active:scale-[0.98]",
    className,
  );

  const image = (
    <Image
      src={`/axiora/moods/${mood}.svg`}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className="select-none"
      unoptimized
      draggable={false}
    />
  );

  if (clickable) {
    return (
      <button
        type="button"
        role="img"
        aria-label={`Humor ${MOOD_LABELS[mood]}`}
        className={sharedClassName}
        style={{ width: size, height: size }}
        onClick={onClick}
      >
        {image}
      </button>
    );
  }

  return (
    <span role="img" aria-label={`Humor ${MOOD_LABELS[mood]}`} className={sharedClassName} style={{ width: size, height: size }}>
      {image}
    </span>
  );
}
