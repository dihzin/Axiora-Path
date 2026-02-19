"use client";

import type { ReactNode } from "react";

import type { Mood } from "@/lib/types/mood";
import { cn } from "@/lib/utils";

type AxionMascotProps = {
  mood?: Mood;
  size?: number;
  className?: string;
  animated?: boolean;
  showGlow?: boolean;
};

type MoodConfig = {
  leftEye: ReactNode;
  rightEye: ReactNode;
  leftBrow: ReactNode;
  rightBrow: ReactNode;
  mouth: ReactNode;
  extra: ReactNode | null;
  glowColor: string;
  glowOpacity: number;
  crownTilt: number;
  bodyAnim: string;
  animDuration: string;
};

const MOOD_LABEL: Record<Mood, string> = {
  happy: "Feliz",
  neutral: "Neutro",
  sad: "Triste",
  angry: "Bravo",
  tired: "Cansado",
};

const MOOD_CONFIG: Record<Mood, MoodConfig> = {
  happy: {
    leftEye: <path d="M30 40 Q36 34 42 40" stroke="#1B2A4A" strokeWidth="3.5" fill="none" strokeLinecap="round" />,
    rightEye: <path d="M54 40 Q60 34 66 40" stroke="#1B2A4A" strokeWidth="3.5" fill="none" strokeLinecap="round" />,
    leftBrow: <path d="M27 33 Q36 28 44 32" stroke="#F5C842" strokeWidth="3" fill="none" strokeLinecap="round" />,
    rightBrow: <path d="M52 32 Q60 28 69 33" stroke="#F5C842" strokeWidth="3" fill="none" strokeLinecap="round" />,
    mouth: (
      <>
        <path d="M33 52 Q48 66 63 52" fill="#1B2A4A" stroke="#1B2A4A" strokeWidth="2" strokeLinecap="round" />
        <path d="M35 53 Q48 64 61 53" fill="white" />
        <ellipse cx="48" cy="60" rx="8" ry="5" fill="#E8709A" fillOpacity="0.75" />
      </>
    ),
    extra: (
      <>
        <ellipse cx="27" cy="48" rx="7" ry="5" fill="#F5C842" fillOpacity="0.2" />
        <ellipse cx="69" cy="48" rx="7" ry="5" fill="#F5C842" fillOpacity="0.2" />
      </>
    ),
    glowColor: "#4DD9C0",
    glowOpacity: 0.25,
    crownTilt: 0,
    bodyAnim: "axion-hero-float",
    animDuration: "3s",
  },
  neutral: {
    leftEye: (
      <>
        <ellipse cx="36" cy="40" rx="6" ry="7" fill="white" />
        <ellipse cx="37" cy="41" rx="3.5" ry="4" fill="#1B2A4A" />
        <ellipse cx="38.5" cy="39" rx="1.5" ry="1.5" fill="white" />
      </>
    ),
    rightEye: (
      <>
        <ellipse cx="60" cy="40" rx="6" ry="7" fill="white" />
        <ellipse cx="61" cy="41" rx="3.5" ry="4" fill="#1B2A4A" />
        <ellipse cx="62.5" cy="39" rx="1.5" ry="1.5" fill="white" />
      </>
    ),
    leftBrow: <path d="M29 32 Q36 29 43 32" stroke="#F5C842" strokeWidth="3" fill="none" strokeLinecap="round" />,
    rightBrow: <path d="M53 32 Q60 29 67 32" stroke="#F5C842" strokeWidth="3" fill="none" strokeLinecap="round" />,
    mouth: <path d="M38 54 Q48 57 58 54" fill="none" stroke="#1B2A4A" strokeWidth="3.5" strokeLinecap="round" />,
    extra: null,
    glowColor: "#4DD9C0",
    glowOpacity: 0.14,
    crownTilt: 0,
    bodyAnim: "axion-hero-breathe",
    animDuration: "4s",
  },
  sad: {
    leftEye: (
      <>
        <ellipse cx="36" cy="41" rx="6" ry="7.5" fill="white" />
        <ellipse cx="37" cy="42" rx="3.5" ry="4.5" fill="#1B2A4A" />
        <ellipse cx="38.5" cy="39" rx="1.5" ry="1.5" fill="white" />
      </>
    ),
    rightEye: (
      <>
        <ellipse cx="60" cy="41" rx="6" ry="7.5" fill="white" />
        <ellipse cx="61" cy="42" rx="3.5" ry="4.5" fill="#1B2A4A" />
        <ellipse cx="62.5" cy="39" rx="1.5" ry="1.5" fill="white" />
      </>
    ),
    leftBrow: <path d="M29 34 Q33 29 43 33" stroke="#F5C842" strokeWidth="3" fill="none" strokeLinecap="round" />,
    rightBrow: <path d="M53 33 Q63 29 67 34" stroke="#F5C842" strokeWidth="3" fill="none" strokeLinecap="round" />,
    mouth: <path d="M36 57 Q48 48 60 57" fill="none" stroke="#1B2A4A" strokeWidth="3.5" strokeLinecap="round" />,
    extra: (
      <>
        <ellipse cx="28" cy="49" rx="3" ry="3" fill="#8ECFEE" fillOpacity="0.85" className="axion-hero-tear-l" />
        <path d="M28 52 Q26 58 28 62 Q30 58 28 52" fill="#8ECFEE" fillOpacity="0.85" className="axion-hero-tear-l" />
        <ellipse cx="68" cy="49" rx="3" ry="3" fill="#8ECFEE" fillOpacity="0.85" className="axion-hero-tear-r" />
        <path d="M68 52 Q66 58 68 62 Q70 58 68 52" fill="#8ECFEE" fillOpacity="0.85" className="axion-hero-tear-r" />
      </>
    ),
    glowColor: "#4DD9C0",
    glowOpacity: 0.07,
    crownTilt: -5,
    bodyAnim: "axion-hero-droop",
    animDuration: "4s",
  },
  angry: {
    leftEye: (
      <>
        <ellipse cx="36" cy="40" rx="6" ry="6" fill="white" />
        <ellipse cx="37" cy="40" rx="3" ry="4" fill="#1B2A4A" />
        <ellipse cx="38.5" cy="38" rx="1.2" ry="1.2" fill="white" />
      </>
    ),
    rightEye: (
      <>
        <ellipse cx="60" cy="40" rx="6" ry="6" fill="white" />
        <ellipse cx="61" cy="40" rx="3" ry="4" fill="#1B2A4A" />
        <ellipse cx="62.5" cy="38" rx="1.2" ry="1.2" fill="white" />
      </>
    ),
    leftBrow: <path d="M27 36 L42 42" stroke="#F5C842" strokeWidth="4" strokeLinecap="round" />,
    rightBrow: <path d="M54 42 L69 36" stroke="#F5C842" strokeWidth="4" strokeLinecap="round" />,
    mouth: (
      <>
        <path d="M34 58 Q48 47 62 58" fill="#1B2A4A" stroke="#1B2A4A" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M37 57 Q48 49 59 57" fill="white" />
        <line x1="43" y1="50" x2="43" y2="57" stroke="#1B2A4A" strokeWidth="1.5" />
        <line x1="48" y1="49" x2="48" y2="57" stroke="#1B2A4A" strokeWidth="1.5" />
        <line x1="53" y1="50" x2="53" y2="57" stroke="#1B2A4A" strokeWidth="1.5" />
      </>
    ),
    extra: null,
    glowColor: "#FF6B4A",
    glowOpacity: 0.22,
    crownTilt: 0,
    bodyAnim: "axion-hero-shake",
    animDuration: "0.4s",
  },
  tired: {
    leftEye: (
      <>
        <ellipse cx="36" cy="42" rx="6" ry="7" fill="white" />
        <ellipse cx="37" cy="43" rx="3" ry="4" fill="#1B2A4A" />
        <ellipse cx="38.5" cy="40" rx="1.2" ry="1.2" fill="white" />
        <path d="M29 38 Q36 32 43 38 L43 44 Q36 39 29 44 Z" fill="#2D4A7A" />
        <path d="M29 41 Q36 35 43 41" fill="none" stroke="#1B2A4A" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
    rightEye: (
      <>
        <ellipse cx="60" cy="42" rx="6" ry="7" fill="white" />
        <ellipse cx="61" cy="43" rx="3" ry="4" fill="#1B2A4A" />
        <ellipse cx="62.5" cy="40" rx="1.2" ry="1.2" fill="white" />
        <path d="M53 38 Q60 32 67 38 L67 44 Q60 39 53 44 Z" fill="#2D4A7A" />
        <path d="M53 41 Q60 35 67 41" fill="none" stroke="#1B2A4A" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
    leftBrow: <path d="M29 33 Q36 31 43 34" stroke="#F5C842" strokeWidth="3" fill="none" strokeLinecap="round" strokeOpacity="0.7" />,
    rightBrow: <path d="M53 34 Q60 31 67 33" stroke="#F5C842" strokeWidth="3" fill="none" strokeLinecap="round" strokeOpacity="0.7" />,
    mouth: (
      <>
        <ellipse cx="48" cy="58" rx="10" ry="7" fill="#1B2A4A" stroke="#1B2A4A" strokeWidth="2.5" />
        <ellipse cx="48" cy="55" rx="10" ry="5" fill="#2D4A7A" />
        <ellipse cx="48" cy="58" rx="8" ry="6" fill="#0D1A2E" />
        <ellipse cx="48" cy="62" rx="5" ry="3.5" fill="#D4607A" fillOpacity="0.75" />
      </>
    ),
    extra: null,
    glowColor: "#4DD9C0",
    glowOpacity: 0.06,
    crownTilt: -8,
    bodyAnim: "axion-hero-sway",
    animDuration: "5s",
  },
};

export function AxionMascot({ mood = "happy", size = 96, className, animated = true, showGlow = true }: AxionMascotProps) {
  const config = MOOD_CONFIG[mood];
  const shouldRenderGlow = showGlow && size >= 56;

  return (
    <span
      role="img"
      aria-label={`Axion ${MOOD_LABEL[mood]}`}
      className={cn("relative inline-flex select-none items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 96 96" width={size} height={size} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="h-full w-full">
        {shouldRenderGlow ? (
          <g className={animated ? "axion-hero-glow" : ""}>
            <ellipse cx="48" cy="58" rx="38" ry="40" fill={config.glowColor} fillOpacity={config.glowOpacity} />
            <ellipse cx="48" cy="60" rx="30" ry="32" fill="none" stroke={config.glowColor} strokeWidth="1.5" strokeOpacity={config.glowOpacity * 1.5} />
          </g>
        ) : null}

        <g
          className="axion-hero-body"
          style={animated ? { animation: `${config.bodyAnim} ${config.animDuration} ease-in-out infinite` } : undefined}
        >
          <ellipse cx="48" cy="90" rx="22" ry="5" fill="#0D1A2E" fillOpacity="0.3" />

          <path d="M22 62 Q14 76 17 85 Q28 78 34 68" fill="#0F1C30" />
          <path d="M74 62 Q82 76 79 85 Q68 78 62 68" fill="#0F1C30" />
          <path d="M23 58 Q48 66 73 58 L71 66 Q48 74 25 66 Z" fill="#1B2A4A" stroke={config.glowColor} strokeWidth="1.5" strokeOpacity="0.75" />
          <path d="M23 58 Q48 66 73 58" fill="none" stroke={config.glowColor} strokeWidth="2" strokeLinecap="round" strokeOpacity="0.9" />

          <ellipse cx="48" cy="62" rx="28" ry="30" fill="#1B2A4A" stroke="#243F6A" strokeWidth="1.5" />
          <ellipse cx="42" cy="52" rx="9" ry="5" fill={config.glowColor} fillOpacity="0.1" transform="rotate(-12 42 52)" />
          <path d="M48 54 L52 60 L48 66 L44 60 Z" fill="#F5C842" fillOpacity="0.85" stroke="#C8990A" strokeWidth="1" />
          <path d="M48 56 L51 60 L48 64 L45 60 Z" fill="#FFE07A" fillOpacity="0.5" />

          <ellipse cx="48" cy="44" rx="26" ry="28" fill="#2D4A7A" stroke="#1B2A4A" strokeWidth="1.5" />
          <ellipse cx="40" cy="34" rx="10" ry="6" fill="white" fillOpacity="0.05" />

          <ellipse cx="36" cy="40" rx="8" ry="9" fill="#0D1A2E" />
          <ellipse cx="60" cy="40" rx="8" ry="9" fill="#0D1A2E" />

          <g className={animated ? "axion-hero-blink" : ""}>
            <g>{config.leftEye}</g>
            <g>{config.rightEye}</g>
          </g>

          <g>{config.leftBrow}</g>
          <g>{config.rightBrow}</g>
          <g>{config.mouth}</g>
          {config.extra ? <g>{config.extra}</g> : null}

          <ellipse cx="22" cy="44" rx="4" ry="5.5" fill="#2D4A7A" stroke="#1B2A4A" strokeWidth="1" />
          <ellipse cx="74" cy="44" rx="4" ry="5.5" fill="#2D4A7A" stroke="#1B2A4A" strokeWidth="1" />

          <g className={animated ? "axion-hero-crown" : ""} transform={`rotate(${config.crownTilt} 48 16)`}>
            <rect x="30" y="18" width="36" height="8" rx="4" fill="#F5C842" stroke="#C8990A" strokeWidth="1" />
            <path d="M33 18 L33 9 L39 15 L48 6 L57 15 L63 9 L63 18 Z" fill="#F5C842" stroke="#C8990A" strokeWidth="1" strokeLinejoin="round" />
            <ellipse cx="48" cy="13" rx="3.5" ry="3.5" fill="#4DD9C0" stroke="#2AB09A" strokeWidth="0.75" />
            <ellipse cx="36" cy="17" rx="2.5" ry="2.5" fill="#E8709A" stroke="#B84A78" strokeWidth="0.75" />
            <ellipse cx="60" cy="17" rx="2.5" ry="2.5" fill="#E8709A" stroke="#B84A78" strokeWidth="0.75" />
            <path d="M43 11 L45 9 L44.5 12" fill="none" stroke="white" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.75" />
          </g>
        </g>
      </svg>
    </span>
  );
}
