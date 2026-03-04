import { useId, type SVGProps } from "react";

export function StreakFlameIcon(props: SVGProps<SVGSVGElement>) {
  const id = useId();
  const shellId = `${id}-shell`;
  const coreId = `${id}-core`;
  const emberId = `${id}-ember`;

  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden {...props}>
      <defs>
        <linearGradient id={shellId} x1="12" y1="2.5" x2="12" y2="20.5" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFE28A" />
          <stop offset="48%" stopColor="#FF9A3D" />
          <stop offset="100%" stopColor="#F35A2A" />
        </linearGradient>
        <linearGradient id={coreId} x1="12" y1="8.2" x2="12" y2="18" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF6BF" />
          <stop offset="100%" stopColor="#FFC65C" />
        </linearGradient>
        <radialGradient id={emberId} cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor="#FFD26C" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#FF8B3D" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="12" cy="16.4" rx="5.4" ry="4.9" fill={`url(#${emberId})`} />
      <path
        d="M12 3.2c1.1 2 4.2 4 4.2 7.7 0 3.1-1.8 5.6-4.2 8.8-2.4-3.2-4.2-5.7-4.2-8.8 0-3.7 3.1-5.7 4.2-7.7z"
        fill={`url(#${shellId})`}
      />
      <path
        d="M12 8.6c.7 1.2 2 2.3 2 4.3 0 1.8-1 3.3-2 4.8-1-1.5-2-3-2-4.8 0-2 1.3-3.1 2-4.3z"
        fill={`url(#${coreId})`}
      />
      <path
        d="M12 3.2c1.1 2 4.2 4 4.2 7.7 0 3.1-1.8 5.6-4.2 8.8-2.4-3.2-4.2-5.7-4.2-8.8 0-3.7 3.1-5.7 4.2-7.7z"
        stroke="rgba(255,255,255,0.25)"
        strokeWidth="0.6"
      />
    </svg>
  );
}
