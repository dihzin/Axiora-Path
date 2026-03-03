import type { SVGProps } from "react";

export function LevelUpIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden {...props}>
      <path d="M12 18V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7.5 10.5 12 6l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 19h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
