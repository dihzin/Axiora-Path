import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Redefinir senha",
};

export default function ResetPasswordLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style precedence="high">{`
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

        @media (prefers-reduced-motion: reduce) {
          .axion-float, .axion-glow, .axion-crown, .axion-blink { animation: none; }
        }
      `}</style>
      {children}
    </>
  );
}
