import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Entrar",
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style precedence="high">{`
        /* ── Background override ── */
        html { background-color: #0b1420 !important; }
        body { background-color: transparent !important; }

        /* ── One-page layout ── */
        .axiora-login-fullscreen {
          height: 100vh;
          height: 100dvh;
          min-height: 600px;
          overflow-y: auto;
          overflow-x: hidden;
        }
        .axiora-login-grid {
          min-height: 100vh;
          min-height: 100dvh;
          min-height: max(600px, 100dvh);
        }

        /* ── Entrance animations ── */
        @keyframes axiora-login-rise {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .axiora-login-hero  { opacity: 0; animation: axiora-login-rise 480ms ease forwards; }
        .axiora-login-panel { opacity: 0; animation: axiora-login-rise 560ms ease 100ms forwards; }

        /* ── Mascot / decorative animations ── */
        @keyframes axion-float {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(-7px); }
        }
        @keyframes axion-glow {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.45; }
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

        /* ── Card / chip interactions ── */
        .axiora-login-info-card {
          transition: transform 220ms cubic-bezier(0.22,1,0.36,1),
                      box-shadow 220ms cubic-bezier(0.22,1,0.36,1),
                      border-color 220ms ease;
        }
        .axiora-login-info-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 28px 58px rgba(4,12,8,0.42);
          border-color: rgba(255,255,255,0.18);
        }
        .axiora-login-chip {
          transition: transform 180ms cubic-bezier(0.22,1,0.36,1),
                      box-shadow 180ms cubic-bezier(0.22,1,0.36,1);
        }
        .axiora-login-chip:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 18px rgba(6,17,28,0.14);
        }

        @media (prefers-reduced-motion: reduce) {
          .axiora-login-hero, .axiora-login-panel { opacity: 1; animation: none; }
          .axion-float, .axion-glow, .axion-crown, .axion-blink { animation: none; }
          .axiora-login-info-card, .axiora-login-chip { transition: none; }
          .axiora-login-info-card:hover, .axiora-login-chip:hover { transform: none; }
        }
      `}</style>
      {children}
    </>
  );
}
