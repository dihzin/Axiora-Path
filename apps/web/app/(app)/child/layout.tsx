import type { ReactNode } from "react";

export default function ChildLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style precedence="high">{`
        html { background-color: #040a18 !important; }
      `}</style>
      {children}
    </>
  );
}
