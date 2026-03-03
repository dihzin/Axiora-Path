import type { SVGProps } from "react";

export function BrainIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden {...props}>
      <path
        d="M9 5a3 3 0 0 0-3 3v.2A2.8 2.8 0 0 0 4 11a2.8 2.8 0 0 0 2 2.8V14a3 3 0 0 0 3 3h1V5H9zM15 5a3 3 0 0 1 3 3v.2A2.8 2.8 0 0 1 20 11a2.8 2.8 0 0 1-2 2.8V14a3 3 0 0 1-3 3h-1V5h1z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M10 8.5H9m6 0h-1m-4 3h4m-4 3h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

