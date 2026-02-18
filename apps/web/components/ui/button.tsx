import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-1.5 rounded-2xl border-b-4 text-sm font-extrabold tracking-wide transition-all duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:translate-y-[2px] active:border-b-2",
  {
    variants: {
      variant: {
        default:
          "border-[#e25a31] bg-primary text-primary-foreground shadow-[0_8px_0_rgba(178,69,36,0.38),0_12px_22px_rgba(96,39,21,0.22)] hover:brightness-105",
        secondary:
          "border-[#0b8685] bg-secondary text-secondary-foreground shadow-[0_8px_0_rgba(10,114,113,0.4),0_12px_22px_rgba(10,76,74,0.22)] hover:brightness-105",
        destructive:
          "border-[#cc3030] bg-destructive text-destructive-foreground shadow-[0_8px_0_rgba(174,34,34,0.38),0_12px_22px_rgba(124,23,23,0.24)] hover:brightness-105",
        outline:
          "border-[#b8c8ef] bg-white text-foreground shadow-[0_5px_0_rgba(184,200,239,0.95),0_10px_20px_rgba(34,64,110,0.1)] hover:bg-[#f7fbff]",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-10 px-4 text-xs",
        lg: "h-12 px-7 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
