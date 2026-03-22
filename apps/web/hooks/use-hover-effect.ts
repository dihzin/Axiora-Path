import { useMemo, useState, type CSSProperties } from "react";

type UseHoverEffectOptions = {
  hoverScale?: number;
  tapScale?: number;
  glowShadow?: string;
  disabled?: boolean;
};

type UseHoverEffectResult = {
  style: CSSProperties;
  isHovered: boolean;
  isPressed: boolean;
  eventHandlers: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onMouseDown: () => void;
    onMouseUp: () => void;
    onTouchStart: () => void;
    onTouchEnd: () => void;
  };
};

export function useHoverEffect({
  hoverScale = 1.02,
  tapScale = 0.97,
  glowShadow = "0 0 0 1px rgba(251,146,60,0.26), 0 10px 22px rgba(251,146,60,0.18)",
  disabled = false,
}: UseHoverEffectOptions = {}): UseHoverEffectResult {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const scale = disabled ? 1 : isPressed ? tapScale : isHovered ? hoverScale : 1;

  const style = useMemo<CSSProperties>(
    () => ({
      transform: `scale(${scale})`,
      boxShadow: !disabled && isHovered ? glowShadow : undefined,
      transition: "transform 140ms cubic-bezier(0.2,0.8,0.2,1), box-shadow 160ms ease",
      willChange: "transform, box-shadow",
    }),
    [disabled, glowShadow, isHovered, scale],
  );

  return {
    style,
    isHovered,
    isPressed,
    eventHandlers: {
      onMouseEnter: () => {
        if (!disabled) setIsHovered(true);
      },
      onMouseLeave: () => {
        setIsHovered(false);
        setIsPressed(false);
      },
      onMouseDown: () => {
        if (!disabled) setIsPressed(true);
      },
      onMouseUp: () => {
        setIsPressed(false);
      },
      onTouchStart: () => {
        if (!disabled) setIsPressed(true);
      },
      onTouchEnd: () => {
        setIsPressed(false);
      },
    },
  };
}

