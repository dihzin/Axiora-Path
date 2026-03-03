import type { SVGProps } from "react";

export function FlameIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden {...props}>
      <path d="M12 3c2.6 2.4 4.5 5.2 4.5 8.4A4.5 4.5 0 1 1 7.5 11c0-2.6 1.5-5.2 4.5-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 10c1.2 1.1 2 2.3 2 3.6a2 2 0 1 1-4 0c0-1.2.7-2.3 2-3.6z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

