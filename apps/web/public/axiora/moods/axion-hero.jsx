// AxionMascot.jsx
// Drop-in replacement for the current SVG circle emoji
// Usage: <AxionMascot mood="happy" size={96} />
// mood: "happy" | "neutral" | "sad" | "angry" | "tired"

import React from "react";

const moods = {
  happy: {
    // eyes: arched happy squint
    leftEye: <path d="M30 40 Q36 34 42 40" stroke="#1B2A4A" strokeWidth="3.5" fill="none" strokeLinecap="round"/>,
    rightEye: <path d="M54 40 Q60 34 66 40" stroke="#1B2A4A" strokeWidth="3.5" fill="none" strokeLinecap="round"/>,
    // brows up
    leftBrow: <path d="M27 33 Q36 28 44 32" stroke="#F5C842" strokeWidth="3" fill="none" strokeLinecap="round"/>,
    rightBrow: <path d="M52 32 Q60 28 69 33" stroke="#F5C842" strokeWidth="3" fill="none" strokeLinecap="round"/>,
    // big smile
    mouth: <>
      <path d="M33 52 Q48 66 63 52" fill="#1B2A4A" stroke="#1B2A4A" strokeWidth="2" strokeLinecap="round"/>
      <path d="M35 53 Q48 64 61 53" fill="white"/>
      <ellipse cx="48" cy="60" rx="8" ry="5" fill="#E8709A" fillOpacity="0.75"/>
    </>,
    // cheeks
    extra: <>
      <ellipse cx="27" cy="48" rx="7" ry="5" fill="#F5C842" fillOpacity="0.2"/>
      <ellipse cx="69" cy="48" rx="7" ry="5" fill="#F5C842" fillOpacity="0.2"/>
    </>,
    glowColor: "#4DD9C0",
    glowOpacity: 0.25,
    crownTilt: 0,
    bodyAnim: "axion-float",
  },
  neutral: {
    leftEye: <><ellipse cx="36" cy="40" rx="6" ry="7" fill="white"/><ellipse cx="37" cy="41" rx="3.5" ry="4" fill="#1B2A4A"/><ellipse cx="38.5" cy="39" rx="1.5" ry="1.5" fill="white"/></>,
    rightEye: <><ellipse cx="60" cy="40" rx="6" ry="7" fill="white"/><ellipse cx="61" cy="41" rx="3.5" ry="4" fill="#1B2A4A"/><ellipse cx="62.5" cy="39" rx="1.5" ry="1.5" fill="white"/></>,
    leftBrow: <path d="M29 32 Q36 29 43 32" stroke="#F5C842" strokeWidth="3" fill="none" strokeLinecap="round"/>,
    rightBrow: <path d="M53 32 Q60 29 67 32" stroke="#F5C842" strokeWidth="3" fill="none" strokeLinecap="round"/>,
    mouth: <path d="M38 54 Q48 57 58 54" fill="none" stroke="#1B2A4A" strokeWidth="3.5" strokeLinecap="round"/>,
    extra: null,
    glowColor: "#4DD9C0",
    glowOpacity: 0.14,
    crownTilt: 0,
    bodyAnim: "axion-breathe",
  },
  sad: {
    leftEye: <><ellipse cx="36" cy="41" rx="6" ry="7.5" fill="white"/><ellipse cx="88" cy="192" rx="28" ry="12" fill="#8ECFEE" fillOpacity="0.4" transform="scale(0.43) translate(-68,-128)"/><ellipse cx="37" cy="42" rx="3.5" ry="4.5" fill="#1B2A4A"/><ellipse cx="38.5" cy="39" rx="1.5" ry="1.5" fill="white"/></>,
    rightEye: <><ellipse cx="60" cy="41" rx="6" ry="7.5" fill="white"/><ellipse cx="61" cy="42" rx="3.5" ry="4.5" fill="#1B2A4A"/><ellipse cx="62.5" cy="39" rx="1.5" ry="1.5" fill="white"/></>,
    leftBrow: <path d="M29 34 Q33 29 43 33" stroke="#F5C842" strokeWidth="3" fill="none" strokeLinecap="round"/>,
    rightBrow: <path d="M53 33 Q63 29 67 34" stroke="#F5C842" strokeWidth="3" fill="none" strokeLinecap="round"/>,
    mouth: <path d="M36 57 Q48 48 60 57" fill="none" stroke="#1B2A4A" strokeWidth="3.5" strokeLinecap="round"/>,
    extra: <>
      {/* tears */}
      <ellipse cx="28" cy="49" rx="3" ry="3" fill="#8ECFEE" fillOpacity="0.85" className="axion-tear-l"/>
      <path d="M28 52 Q26 58 28 62 Q30 58 28 52" fill="#8ECFEE" fillOpacity="0.85" className="axion-tear-l"/>
      <ellipse cx="68" cy="49" rx="3" ry="3" fill="#8ECFEE" fillOpacity="0.85" className="axion-tear-r"/>
      <path d="M68 52 Q66 58 68 62 Q70 58 68 52" fill="#8ECFEE" fillOpacity="0.85" className="axion-tear-r"/>
    </>,
    glowColor: "#4DD9C0",
    glowOpacity: 0.07,
    crownTilt: -5,
    bodyAnim: "axion-droop",
  },
  angry: {
    leftEye: <><ellipse cx="36" cy="40" rx="6" ry="6" fill="white"/><ellipse cx="37" cy="40" rx="3" ry="4" fill="#1B2A4A"/><ellipse cx="38.5" cy="38" rx="1.2" ry="1.2" fill="white"/></>,
    rightEye: <><ellipse cx="60" cy="40" rx="6" ry="6" fill="white"/><ellipse cx="61" cy="40" rx="3" ry="4" fill="#1B2A4A"/><ellipse cx="62.5" cy="38" rx="1.2" ry="1.2" fill="white"/></>,
    // steep diagonal brows
    leftBrow: <path d="M27 36 L42 42" stroke="#F5C842" strokeWidth="4" strokeLinecap="round"/>,
    rightBrow: <path d="M54 42 L69 36" stroke="#F5C842" strokeWidth="4" strokeLinecap="round"/>,
    mouth: <>
      <path d="M34 58 Q48 47 62 58" fill="#1B2A4A" stroke="#1B2A4A" strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M37 57 Q48 49 59 57" fill="white"/>
      <line x1="43" y1="50" x2="43" y2="57" stroke="#1B2A4A" strokeWidth="1.5"/>
      <line x1="48" y1="49" x2="48" y2="57" stroke="#1B2A4A" strokeWidth="1.5"/>
      <line x1="53" y1="50" x2="53" y2="57" stroke="#1B2A4A" strokeWidth="1.5"/>
    </>,
    extra: null,
    glowColor: "#FF6B4A",
    glowOpacity: 0.22,
    crownTilt: 0,
    bodyAnim: "axion-shake",
  },
  tired: {
    // heavy drooping lids
    leftEye: <><ellipse cx="36" cy="42" rx="6" ry="7" fill="white"/><ellipse cx="37" cy="43" rx="3" ry="4" fill="#1B2A4A"/><ellipse cx="38.5" cy="40" rx="1.2" ry="1.2" fill="white"/><path d="M29 38 Q36 32 43 38 L43 44 Q36 39 29 44 Z" fill="#2D4A7A"/><path d="M29 41 Q36 35 43 41" fill="none" stroke="#1B2A4A" strokeWidth="2" strokeLinecap="round"/></>,
    rightEye: <><ellipse cx="60" cy="42" rx="6" ry="7" fill="white"/><ellipse cx="61" cy="43" rx="3" ry="4" fill="#1B2A4A"/><ellipse cx="62.5" cy="40" rx="1.2" ry="1.2" fill="white"/><path d="M53 38 Q60 32 67 38 L67 44 Q60 39 53 44 Z" fill="#2D4A7A"/><path d="M53 41 Q60 35 67 41" fill="none" stroke="#1B2A4A" strokeWidth="2" strokeLinecap="round"/></>,
    leftBrow: <path d="M29 33 Q36 31 43 34" stroke="#F5C842" strokeWidth="3" fill="none" strokeLinecap="round" strokeOpacity="0.7"/>,
    rightBrow: <path d="M53 34 Q60 31 67 33" stroke="#F5C842" strokeWidth="3" fill="none" strokeLinecap="round" strokeOpacity="0.7"/>,
    mouth: <>
      <ellipse cx="48" cy="58" rx="10" ry="7" fill="#1B2A4A" stroke="#1B2A4A" strokeWidth="2.5"/>
      <ellipse cx="48" cy="55" rx="10" ry="5" fill="#2D4A7A"/>
      <ellipse cx="48" cy="58" rx="8" ry="6" fill="#0D1A2E"/>
      <ellipse cx="48" cy="62" rx="5" ry="3.5" fill="#D4607A" fillOpacity="0.75"/>
    </>,
    extra: null,
    glowColor: "#4DD9C0",
    glowOpacity: 0.06,
    crownTilt: -8,
    bodyAnim: "axion-sway",
  },
};

const css = `
  @keyframes axion-float {
    0%,100% { transform: translateY(0px); }
    50% { transform: translateY(-5px); }
  }
  @keyframes axion-breathe {
    0%,100% { transform: scaleY(1) translateY(0); }
    50% { transform: scaleY(1.015) translateY(-1px); }
  }
  @keyframes axion-shake {
    0%,100% { transform: rotate(0deg) translateX(0); }
    20% { transform: rotate(-3deg) translateX(-2px); }
    40% { transform: rotate(3deg) translateX(2px); }
    60% { transform: rotate(-2deg) translateX(-1px); }
    80% { transform: rotate(2deg) translateX(1px); }
  }
  @keyframes axion-droop {
    0%,100% { transform: translateY(0) rotate(0deg); }
    50% { transform: translateY(2px) rotate(-2deg); }
  }
  @keyframes axion-sway {
    0%,100% { transform: rotate(0deg); }
    33% { transform: rotate(3deg); }
    66% { transform: rotate(-2deg); }
  }
  @keyframes axion-blink {
    0%,92%,100% { transform: scaleY(1); }
    96% { transform: scaleY(0.08); }
  }
  @keyframes axion-glow-pulse {
    0%,100% { opacity: 1; }
    50% { opacity: 0.55; }
  }
  @keyframes axion-crown-bob {
    0%,100% { transform: translateY(0); }
    50% { transform: translateY(-2px); }
  }
  @keyframes axion-tear-fall {
    0% { opacity: 0; transform: translateY(-4px); }
    20% { opacity: 1; }
    100% { opacity: 0; transform: translateY(10px); }
  }
  .axion-body-anim { transform-origin: center center; }
  .axion-blink-group { transform-origin: center 40px; animation: axion-blink 4s ease-in-out infinite; }
  .axion-glow { animation: axion-glow-pulse 3s ease-in-out infinite; }
  .axion-crown { animation: axion-crown-bob 2.5s ease-in-out infinite; transform-origin: 48px 12px; }
  .axion-tear-l { animation: axion-tear-fall 2.2s ease-in 0.3s infinite; }
  .axion-tear-r { animation: axion-tear-fall 2.2s ease-in 0.8s infinite; }
`;

export default function AxionMascot({ mood = "happy", size = 96, style = {}, className = "" }) {
  const m = moods[mood] || moods.happy;
  const animDuration = mood === "angry" ? "0.4s" : mood === "happy" ? "3s" : mood === "tired" ? "5s" : "4s";

  return (
    <>
      <style>{css}</style>
      <svg
        viewBox="0 0 96 96"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={`Axion ${mood}`}
        style={{ overflow: "visible", ...style }}
        className={className}
      >
        {/* GLOW */}
        <g className="axion-glow">
          <ellipse cx="48" cy="58" rx="38" ry="40" fill={m.glowColor} fillOpacity={m.glowOpacity}/>
          <ellipse cx="48" cy="60" rx="30" ry="32" fill="none" stroke={m.glowColor} strokeWidth="1.5" strokeOpacity={m.glowOpacity * 1.5}/>
        </g>

        {/* Whole body wrapper with mood animation */}
        <g
          className="axion-body-anim"
          style={{ animation: `${m.bodyAnim} ${animDuration} ease-in-out infinite` }}
        >
          {/* SHADOW */}
          <ellipse cx="48" cy="90" rx="22" ry="5" fill="#0D1A2E" fillOpacity="0.3"/>

          {/* CAPE */}
          <path d="M22 62 Q14 76 17 85 Q28 78 34 68" fill="#0F1C30"/>
          <path d="M74 62 Q82 76 79 85 Q68 78 62 68" fill="#0F1C30"/>
          <path d="M23 58 Q48 66 73 58 L71 66 Q48 74 25 66 Z" fill="#1B2A4A" stroke={m.glowColor} strokeWidth="1.5" strokeOpacity="0.75"/>
          <path d="M23 58 Q48 66 73 58" fill="none" stroke={m.glowColor} strokeWidth="2" strokeLinecap="round" strokeOpacity="0.9"/>

          {/* BODY */}
          <ellipse cx="48" cy="62" rx="28" ry="30" fill="#1B2A4A" stroke="#243F6A" strokeWidth="1.5"/>
          {/* chest gleam */}
          <ellipse cx="42" cy="52" rx="9" ry="5" fill={m.glowColor} fillOpacity="0.1" transform="rotate(-12 42 52)"/>
          {/* chest diamond emblem */}
          <path d="M48 54 L52 60 L48 66 L44 60 Z" fill="#F5C842" fillOpacity="0.85" stroke="#C8990A" strokeWidth="1"/>
          <path d="M48 56 L51 60 L48 64 L45 60 Z" fill="#FFE07A" fillOpacity="0.5"/>

          {/* FACE circle */}
          <ellipse cx="48" cy="44" rx="26" ry="28" fill="#2D4A7A" stroke="#1B2A4A" strokeWidth="1.5"/>
          {/* face light sheen */}
          <ellipse cx="40" cy="34" rx="10" ry="6" fill="white" fillOpacity="0.05"/>

          {/* EYE whites base (behind blink group) */}
          <ellipse cx="36" cy="40" rx="8" ry="9" fill="#0D1A2E"/>
          <ellipse cx="60" cy="40" rx="8" ry="9" fill="#0D1A2E"/>

          {/* BLINK GROUP - blinking animation applied here */}
          <g className="axion-blink-group">
            {/* LEFT EYE */}
            <g>{m.leftEye}</g>
            {/* RIGHT EYE */}
            <g>{m.rightEye}</g>
          </g>

          {/* BROWS (outside blink so they don't blink) */}
          <g>{m.leftBrow}</g>
          <g>{m.rightBrow}</g>

          {/* MOUTH */}
          <g>{m.mouth}</g>

          {/* EXTRA (cheeks, tears, etc) */}
          {m.extra && <g>{m.extra}</g>}

          {/* EARS */}
          <ellipse cx="22" cy="44" rx="4" ry="5.5" fill="#2D4A7A" stroke="#1B2A4A" strokeWidth="1"/>
          <ellipse cx="74" cy="44" rx="4" ry="5.5" fill="#2D4A7A" stroke="#1B2A4A" strokeWidth="1"/>

          {/* CROWN */}
          <g
            className="axion-crown"
            transform={`rotate(${m.crownTilt} 48 16)`}
          >
            {/* base band */}
            <rect x="30" y="18" width="36" height="8" rx="4" fill="#F5C842" stroke="#C8990A" strokeWidth="1"/>
            {/* points */}
            <path d="M33 18 L33 9 L39 15 L48 6 L57 15 L63 9 L63 18 Z" fill="#F5C842" stroke="#C8990A" strokeWidth="1" strokeLinejoin="round"/>
            {/* jewels */}
            <ellipse cx="48" cy="13" rx="3.5" ry="3.5" fill="#4DD9C0" stroke="#2AB09A" strokeWidth="0.75"/>
            <ellipse cx="36" cy="17" rx="2.5" ry="2.5" fill="#E8709A" stroke="#B84A78" strokeWidth="0.75"/>
            <ellipse cx="60" cy="17" rx="2.5" ry="2.5" fill="#E8709A" stroke="#B84A78" strokeWidth="0.75"/>
            {/* shimmer */}
            <path d="M43 11 L45 9 L44.5 12" fill="none" stroke="white" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.75"/>
          </g>
        </g>
      </svg>
    </>
  );
}
