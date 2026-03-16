import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Criar conta",
};

export default function SignupLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style precedence="high">{`
        /* ── Mascot / decorative animations ── */
        @keyframes axion-float {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-7px); }
        }
        @keyframes axion-glow {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.5; }
        }
        @keyframes axion-crown-bob {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-3px); }
        }
        @keyframes axion-blink {
          0%, 90%, 100% { transform: scaleY(1); }
          95%            { transform: scaleY(0.06); }
        }
        .axion-float  { animation: axion-float 3s ease-in-out infinite; transform-origin: center; }
        .axion-glow   { animation: axion-glow 3s ease-in-out infinite; }
        .axion-crown  { animation: axion-crown-bob 2.5s ease-in-out infinite; transform-origin: 48px 14px; }
        .axion-blink  { animation: axion-blink 4s ease-in-out infinite; transform-origin: center; }

        /* ── Entrance animations — opacity-only, no translateY to prevent jump ── */
        @keyframes axiora-signup-rise {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .axiora-signup-hero  { opacity: 0; animation: axiora-signup-rise 720ms cubic-bezier(0.22,1,0.36,1) forwards; }
        .axiora-signup-panel { opacity: 0; animation: axiora-signup-rise 860ms cubic-bezier(0.22,1,0.36,1) 80ms forwards; }

        /* ── Card / chip interactions ── */
        .axiora-signup-info-card {
          transition: transform 220ms cubic-bezier(0.22,1,0.36,1),
                      box-shadow 220ms cubic-bezier(0.22,1,0.36,1),
                      border-color 220ms ease;
        }
        .axiora-signup-info-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 28px 58px rgba(6,17,28,0.28);
        }
        .axiora-signup-chip {
          transition: transform 180ms ease, box-shadow 180ms ease, background-color 180ms ease;
        }
        .axiora-signup-chip:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 16px rgba(6,17,28,0.12);
        }

        @media (prefers-reduced-motion: reduce) {
          .axion-float, .axion-glow, .axion-crown, .axion-blink,
          .axiora-signup-hero, .axiora-signup-panel { animation: none; }
          .axiora-signup-hero, .axiora-signup-panel { opacity: 1; }
          .axiora-signup-info-card, .axiora-signup-chip { transition: none; }
          .axiora-signup-info-card:hover, .axiora-signup-chip:hover { transform: none; }
        }
      `}</style>
      {children}
    </>
  );
}
