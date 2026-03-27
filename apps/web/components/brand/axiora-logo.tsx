"use client";

import Image from "next/image";

import { cn } from "@/lib/utils";

type AxioraLogoProps = {
  alt?: string;
  className?: string;
  imageClassName?: string;
  priority?: boolean;
  size?: "sm" | "md" | "lg";
  variant?: "framed" | "plain";
};

const SIZE_CLASSES: Record<NonNullable<AxioraLogoProps["size"]>, string> = {
  sm: "w-[110px] sm:w-[130px]",
  md: "w-[150px] sm:w-[190px]",
  lg: "w-[210px] sm:w-[280px]",
};

export function AxioraLogo({
  alt = "Logo da Axiora",
  className,
  imageClassName,
  priority = false,
  size = "md",
  variant = "framed",
}: AxioraLogoProps) {
  return (
    <div
      className={cn(
        "relative",
        variant === "framed" && "overflow-hidden rounded-[1.35rem] border border-white/10 bg-[rgba(12,16,22,0.38)] shadow-[0_18px_38px_rgba(0,0,0,0.24)] backdrop-blur-sm",
        SIZE_CLASSES[size],
        className,
      )}
    >
      <Image
        src="/brand/axiora-logo.png"
        alt={alt}
        width={1536}
        height={1024}
        priority={priority}
        sizes={
          size === "sm"
            ? "(max-width: 640px) 110px, 130px"
            : size === "lg"
              ? "(max-width: 640px) 210px, 280px"
              : "(max-width: 640px) 150px, 190px"
        }
        className={cn("h-auto w-full object-contain", imageClassName)}
      />
    </div>
  );
}
