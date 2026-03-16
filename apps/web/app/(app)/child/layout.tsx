import type { ReactNode } from "react";

export default function ChildLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style precedence="high">{`
        html { background-color: #2d5e2a !important; }
      `}</style>
      {children}
    </>
  );
}
