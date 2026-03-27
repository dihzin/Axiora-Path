import Image from "next/image";

import { cn } from "@/lib/utils";

type AxioraHeaderLogoProps = {
  className?: string;
  priority?: boolean;
};

export function AxioraHeaderLogo({ className, priority = false }: AxioraHeaderLogoProps) {
  return (
    <Image
      src="/brand/axiora-header-logo-clean.png"
      alt="Axiora Educação Digital"
      width={420}
      height={72}
      priority={priority}
      sizes="(max-width: 640px) 184px, 220px"
      className={cn("h-auto w-[184px] sm:w-[220px]", className)}
    />
  );
}
