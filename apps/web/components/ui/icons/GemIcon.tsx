import type { SVGProps } from "react";

export function GemIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden {...props}>
      <path d="M6 9.5 9 5h6l3 4.5L12 19 6 9.5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9 5 12 9.5 15 5M6 9.5h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

