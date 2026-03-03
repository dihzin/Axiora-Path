import type { SVGProps } from "react";

export function StreakFlameIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden {...props}>
      <path
        d="M12 3c2.7 2.5 4.7 5.4 4.7 8.7A4.7 4.7 0 1 1 7.3 11c0-2.7 1.6-5.4 4.7-8z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 10.2c1.3 1.2 2.1 2.5 2.1 3.8a2.1 2.1 0 1 1-4.2 0c0-1.3.8-2.5 2.1-3.8z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
