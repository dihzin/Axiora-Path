"use client";

import { useEffect, useState } from "react";

import { Character, HAND_OFFSET } from "./Character";
import { FloatingFeedback } from "./FloatingFeedback";
import { Rope } from "./Rope";
import { SpeedBadge } from "./SpeedBadge";
import type { CharacterAnimState, FloatingFeedbackItem, RoundResult, TugOfWarEvent } from "./useTugOfWarEngine";

type GameSceneProps = {
  redX: number;
  blueX: number;
  ropePos: number;
  p1Anim: CharacterAnimState;
  p2Anim: CharacterAnimState;
  p1Streak: number;
  p2Streak: number;
  winThreshold: number;
  lastEvent: TugOfWarEvent;
  lastRoundResult: RoundResult | null;
  feedback: FloatingFeedbackItem[];
};

type SpeedTier = "lightning" | "veryFast" | "good" | "slow";

type DustParticle = {
  id: number;
  side: "red" | "blue";
  offsetX: number;
  driftX: number;
  driftY: number;
  size: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function GameScene({ redX, blueX, ropePos, p1Anim, p2Anim, p1Streak, p2Streak, winThreshold, lastEvent, lastRoundResult, feedback }: GameSceneProps) {
  const [crowdPop, setCrowdPop] = useState(false);
  const [screenShake, setScreenShake] = useState<"correct" | "wrong" | null>(null);
  const [dustParticles, setDustParticles] = useState<DustParticle[]>([]);
  const [speedBadge, setSpeedBadge] = useState<{ winner: "red" | "blue"; tier: SpeedTier } | null>(null);
  const redAnim = p1Anim === "pulling" ? "pull" : p1Anim;
  const blueAnim = p2Anim === "pulling" ? "pull" : p2Anim;
  const tension = clamp(Math.abs(ropePos - 0.5) * 2, 0, 1);
  const ropeCenter = clamp((ropePos - 0.5) * 2, -1, 1);
  const sceneWidth = 1200;
  const sceneHeight = 260;
  const characterBottom = 10;
  const characterBaseX = 72;
  const characterWidth = 130;
  const characterHeight = (characterWidth * 736) / 780;
  const characterTop = sceneHeight - characterBottom - characterHeight;

  const redCharacterLeft = characterBaseX + redX;
  const blueCharacterLeft = sceneWidth - characterBaseX - characterWidth + blueX;

  const redHand = {
    x: redCharacterLeft + HAND_OFFSET.red.x,
    y: characterTop + HAND_OFFSET.red.y,
  };

  const blueHand = {
    x: blueCharacterLeft + HAND_OFFSET.blue.x,
    y: characterTop + HAND_OFFSET.blue.y,
  };

  const spawnDust = (side: "red" | "blue", durationMs = 200) => {
    const burst = Array.from({ length: 10 }).map((_, idx) => ({
      id: Date.now() + idx + Math.random(),
      side,
      offsetX: Math.random() * 28 - 14,
      driftX: Math.random() * 36 - 18,
      driftY: -12 - Math.random() * 16,
      size: 4 + Math.random() * 5,
    }));
    setDustParticles((prev) => [...prev, ...burst]);
    window.setTimeout(() => {
      setDustParticles((prev) => prev.filter((item) => !burst.some((added) => added.id === item.id)));
    }, durationMs);
  };

  useEffect(() => {
    if (lastEvent === "idle") {
      return;
    }

    const isCorrect = lastEvent === "p1_correct" || lastEvent === "p2_correct";
    const isWrong = lastEvent === "p1_wrong" || lastEvent === "p2_wrong";
    const isP1 = lastEvent === "p1_correct" || lastEvent === "p1_wrong";

    if (isCorrect) {
      setCrowdPop(true);
      setScreenShake("correct");
      spawnDust(isP1 ? "red" : "blue", 200);
    }
    if (isWrong) {
      setScreenShake("wrong");
    }

    const crowdTimer = window.setTimeout(() => setCrowdPop(false), 140);
    const shakeTimer = window.setTimeout(() => setScreenShake(null), isCorrect ? 200 : 120);
    return () => {
      window.clearTimeout(crowdTimer);
      window.clearTimeout(shakeTimer);
    };
  }, [lastEvent]);

  useEffect(() => {
    if (!lastRoundResult) return;

    const tier: SpeedTier =
      lastRoundResult.reactionTime < 400
        ? "lightning"
        : lastRoundResult.reactionTime < 800
          ? "veryFast"
          : lastRoundResult.reactionTime < 1400
            ? "good"
            : "slow";

    setSpeedBadge({ winner: lastRoundResult.winner, tier });
    const timer = window.setTimeout(() => setSpeedBadge(null), 1200);
    return () => window.clearTimeout(timer);
  }, [lastRoundResult]);

  return (
    <div
      className={`relative h-[260px] w-full overflow-hidden rounded-[24px] border-[3px] border-[#1f2937] shadow-[0_14px_28px_rgba(20,34,58,0.18)] ${screenShake ? "tow-screen-shake" : ""}`}
      style={{ ["--tow-shake-amp" as string]: screenShake === "wrong" ? "6px" : "4px" }}
    >
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1200 260" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="skyGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#76d2ff" />
            <stop offset="58%" stopColor="#bdefff" />
            <stop offset="100%" stopColor="#e8fcff" />
          </linearGradient>
          <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff3b0" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#fff3b0" stopOpacity="0" />
          </radialGradient>
          <filter id="mountainBlur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.2" />
          </filter>
          <filter id="cloudSoft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="0.6" />
          </filter>
          <linearGradient id="mountainBack" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#88a9bb" />
            <stop offset="100%" stopColor="#6e8ea6" />
          </linearGradient>
          <linearGradient id="mountainFront" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6f91ab" />
            <stop offset="100%" stopColor="#597b95" />
          </linearGradient>
          <linearGradient id="grassGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7fe27b" />
            <stop offset="100%" stopColor="#35b165" />
          </linearGradient>
          <pattern id="grassTexture" width="16" height="10" patternUnits="userSpaceOnUse">
            <path d="M2 10 L4 4 M8 10 L9 3 M13 10 L14 5" stroke="#23914e" strokeOpacity="0.35" strokeWidth="1.2" strokeLinecap="round" />
          </pattern>
        </defs>

        <rect width="1200" height="260" fill="url(#skyGradient)" />
        <circle cx="1048" cy="58" r="42" fill="#ffe37f" opacity="0.92" />
        <circle cx="1048" cy="58" r="96" fill="url(#sunGlow)" />

        <g filter="url(#cloudSoft)" opacity="0.95" fill="#f6fdff">
          <g transform="translate(90 56)">
            <ellipse cx="0" cy="0" rx="50" ry="17" />
            <ellipse cx="42" cy="-4" rx="34" ry="13" />
          </g>
          <g transform="translate(780 44)">
            <ellipse cx="0" cy="0" rx="58" ry="20" />
            <ellipse cx="50" cy="-4" rx="36" ry="14" />
          </g>
          <g transform="translate(980 96)">
            <ellipse cx="0" cy="0" rx="34" ry="12" />
            <ellipse cx="28" cy="-3" rx="24" ry="10" />
          </g>
        </g>

        <g filter="url(#mountainBlur)">
          <path
            d="M0 166 C90 138 180 132 280 148 C380 163 460 124 560 126 C670 128 730 170 830 163 C940 156 1040 124 1200 138 L1200 212 L0 212 Z"
            fill="url(#mountainBack)"
            opacity="0.72"
          />
        </g>
        <path
          d="M0 178 C80 154 160 150 246 164 C340 180 420 150 514 146 C620 142 694 176 796 178 C900 180 1010 150 1200 160 L1200 214 L0 214 Z"
          fill="url(#mountainFront)"
          opacity="0.94"
        />

        <g opacity="0.85" transform={`translate(0 ${crowdPop ? -1 : 0}) scale(${crowdPop ? 1.03 : 1})`} style={{ transformOrigin: "600px 186px" }}>
          {Array.from({ length: 26 }).map((_, idx) => {
            const x = 28 + idx * 45;
            const height = 12 + ((idx * 11) % 20);
            return <rect key={idx} x={x} y={190 - height} width="22" height={height} rx="6" fill="#d95763" />;
          })}
        </g>

        <rect y="208" width="1200" height="52" fill="url(#grassGradient)" />
        <rect y="208" width="1200" height="52" fill="url(#grassTexture)" opacity="0.55" />
      </svg>

      <div className="pointer-events-none absolute left-[8%] top-[26px] h-4 w-10 animate-[bird-fly_11s_linear_infinite]">
        <span className="tow-bird tow-bird-left" />
        <span className="tow-bird tow-bird-right" />
      </div>
      <div className="pointer-events-none absolute left-[18%] top-[38px] h-4 w-8 animate-[bird-fly_13s_linear_infinite] [animation-delay:-4s]">
        <span className="tow-bird tow-bird-left" />
        <span className="tow-bird tow-bird-right" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-[14px] z-[3] flex justify-between px-2">
        {Array.from({ length: 28 }).map((_, idx) => (
          <span key={idx} className="tow-grass-blade" style={{ animationDelay: `${(idx % 7) * 0.12}s` }} />
        ))}
      </div>

      <div className="pointer-events-none absolute inset-y-0 left-0 w-[14%] bg-[#dc2626]/28" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[14%] bg-[#2563eb]/28" />

      <div className="pointer-events-none absolute inset-y-0 left-[14%] border-l-[3px] border-dashed border-white/80" />
      <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 border-l-[3px] border-dashed border-white/85" />
      <div className="pointer-events-none absolute inset-y-0 right-[14%] border-r-[3px] border-dashed border-white/80" />

      <Character side="red" x={redX} anim={redAnim} tension={tension} />
      <Character side="blue" x={blueX} anim={blueAnim} tension={tension} />

      {speedBadge ? (
        <div
          className="absolute top-[10px] z-20 animate-[speedBadgeIn_220ms_ease-out]"
          style={{ left: speedBadge.winner === "red" ? "18%" : undefined, right: speedBadge.winner === "blue" ? "18%" : undefined }}
        >
          <SpeedBadge tier={speedBadge.tier} />
        </div>
      ) : null}

      <Rope start={redHand} end={blueHand} ropeCenter={ropeCenter} lastEvent={lastEvent} />

      {dustParticles.map((particle) => (
        <span
          key={particle.id}
          className="tow-dust"
          style={{
            left: particle.side === "red" ? `calc(6% + ${redX + 54 + particle.offsetX}px)` : undefined,
            right: particle.side === "blue" ? `calc(6% - ${blueX - 54 - particle.offsetX}px)` : undefined,
            ["--tow-dx" as string]: `${particle.driftX}px`,
            ["--tow-dy" as string]: `${particle.driftY}px`,
            width: `${particle.size}px`,
            height: `${particle.size}px`,
          }}
        />
      ))}

      {feedback.map((item) => (
        <FloatingFeedback key={item.id} item={item} />
      ))}

      {p1Streak >= 3 ? (
        <div className="absolute left-[16%] top-[12px] rounded-full bg-[#f97316] px-3 py-1 text-xs font-black text-white shadow-[0_4px_0_rgba(154,52,18,0.38)] animate-[streak-bounce_420ms_ease]">
          🔥 {p1Streak}x
        </div>
      ) : null}

      {p2Streak >= 3 ? (
        <div className="absolute right-[16%] top-[12px] rounded-full bg-[#0ea5a4] px-3 py-1 text-xs font-black text-white shadow-[0_4px_0_rgba(6,95,92,0.36)] animate-[streak-bounce_420ms_ease]">
          🔥 {p2Streak}x
        </div>
      ) : null}

      <style jsx>{`
        .tow-screen-shake {
          animation: screen-shake 120ms ease;
        }

        .tow-dust {
          position: absolute;
          bottom: 22px;
          border-radius: 999px;
          background: rgba(194, 164, 107, 0.86);
          pointer-events: none;
          animation: dust-burst 200ms ease-out forwards;
          z-index: 7;
        }

        @keyframes screen-shake {
          0% {
            transform: translateX(0);
          }
          25% {
            transform: translateX(calc(var(--tow-shake-amp) * -1));
          }
          50% {
            transform: translateX(var(--tow-shake-amp));
          }
          75% {
            transform: translateX(calc(var(--tow-shake-amp) * -0.6));
          }
          100% {
            transform: translateX(0);
          }
        }

        @keyframes dust-burst {
          0% {
            opacity: 0.9;
            transform: translate3d(0, 0, 0) scale(1);
          }
          100% {
            opacity: 0;
            transform: translate3d(var(--tow-dx), var(--tow-dy), 0) scale(0.2);
          }
        }

        @keyframes streak-bounce {
          0% {
            transform: translateY(8px) scale(0.9);
          }
          60% {
            transform: translateY(-2px) scale(1.06);
          }
          100% {
            transform: translateY(0) scale(1);
          }
        }

        @keyframes speedBadgeIn {
          0% {
            opacity: 0;
            transform: translateY(8px) scale(0.9);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .tow-bird {
          position: absolute;
          top: 6px;
          width: 10px;
          height: 5px;
          border-top: 2px solid rgba(30, 58, 138, 0.6);
          border-radius: 999px 999px 0 0;
        }

        .tow-bird-left {
          left: 0;
          transform: rotate(-10deg);
        }

        .tow-bird-right {
          right: 0;
          transform: rotate(10deg);
        }

        .tow-grass-blade {
          width: 2px;
          height: 14px;
          border-radius: 999px;
          background: rgba(29, 126, 65, 0.55);
          transform-origin: bottom center;
          animation: grass-sway 1.8s ease-in-out infinite;
        }

        @keyframes bird-fly {
          0% {
            transform: translateX(0);
            opacity: 0;
          }
          10% {
            opacity: 0.75;
          }
          90% {
            opacity: 0.75;
          }
          100% {
            transform: translateX(80vw);
            opacity: 0;
          }
        }

        @keyframes grass-sway {
          0% {
            transform: rotate(-6deg) scaleY(1);
          }
          50% {
            transform: rotate(8deg) scaleY(1.03);
          }
          100% {
            transform: rotate(-6deg) scaleY(1);
          }
        }
      `}</style>
    </div>
  );
}
