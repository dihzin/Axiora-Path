"use client";

import type { FloatingFeedbackItem } from "./useTugOfWarEngine";

type FloatingFeedbackProps = {
  item: FloatingFeedbackItem;
};

export function FloatingFeedback({ item }: FloatingFeedbackProps) {
  const isP1 = item.player === "p1";

  return (
    <div
      style={{
        position: "absolute",
        left: isP1 ? "20%" : "80%",
        top: "46px",
        transform: "translateX(-50%)",
        pointerEvents: "none",
        color: item.kind === "correct" ? "#065f46" : "#991b1b",
        fontWeight: 900,
        fontSize: "20px",
        textShadow: "0 2px 0 rgba(255,255,255,0.85)",
        animation: "feedback-float 700ms ease forwards",
        zIndex: 12,
      }}
    >
      {item.text}
      <style jsx>{`
        @keyframes feedback-float {
          from {
            opacity: 1;
            transform: translate(-50%, 0);
          }
          to {
            opacity: 0;
            transform: translate(-50%, -24px);
          }
        }
      `}</style>
    </div>
  );
}
