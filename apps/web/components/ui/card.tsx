import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const cardVariants = cva(
  "rounded-3xl border text-card-foreground",
  {
    variants: {
      variant: {
        default: "border-border bg-card shadow-[0_2px_0_rgba(207,217,243,0.95),0_14px_26px_rgba(38,74,126,0.12)]",
        subtle: "border-border/70 bg-white/92 shadow-[0_1px_0_rgba(207,217,243,0.75),0_10px_18px_rgba(38,74,126,0.08)]",
        flat: "border-border/65 bg-white shadow-none",
        emphasis: "border-secondary/30 bg-[linear-gradient(180deg,#ffffff_0%,#f3fbff_100%)] shadow-[0_2px_0_rgba(184,200,239,0.7),0_14px_28px_rgba(34,63,107,0.12)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

type CardProps = React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof cardVariants>;

function Card({ className, variant, ...props }: CardProps) {
  return (
    <div
      className={cn(
        cardVariants({ variant }),
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1.5 p-5", className)} {...props} />;
}

function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("section-title font-extrabold leading-tight tracking-tight", className)} {...props} />;
}

function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}

export { Card, CardContent, CardDescription, CardHeader, CardTitle };
