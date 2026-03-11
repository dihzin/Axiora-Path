import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";
import { axioraMotionClasses } from "@/theme/motion";

const buttonVariants = cva(
  `axiora-chunky-btn axiora-hover-magic relative inline-flex items-center justify-center gap-1.5 text-sm font-black tracking-[0.01em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC48C] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:pointer-events-none disabled:opacity-50 ${axioraMotionClasses.transition} ${axioraMotionClasses.hoverScale} ${axioraMotionClasses.clickScale}`,
  {
    variants: {
      variant: {
        default:
          "axiora-chunky-btn--default",
        secondary:
          "axiora-chunky-btn--secondary",
        destructive:
          "axiora-chunky-btn--destructive",
        outline:
          "axiora-chunky-btn--outline",
      },
      size: {
        default: "min-h-11 rounded-[18px] px-5 py-2.5",
        sm: "min-h-10 rounded-[16px] px-4 py-2 text-xs",
        lg: "min-h-12 rounded-[20px] px-7 py-3 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, ...props }, ref) => {
    const mergedClassName = cn(buttonVariants({ variant, size, className }));
    if (asChild) {
      const child = React.Children.only(children);
      if (React.isValidElement(child)) {
        const childElement = child as React.ReactElement<{ className?: string }>;
        const childClassName = childElement.props.className;
        return React.cloneElement(childElement, {
          ...(props as object),
          className: cn(mergedClassName, childClassName),
        });
      }
    }
    return (
      <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

