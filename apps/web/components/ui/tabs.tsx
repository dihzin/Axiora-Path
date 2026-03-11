"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

type TabsContextValue = {
  value: string;
  setValue: (value: string) => void;
};

const TabsContext = React.createContext<TabsContextValue | null>(null);

export function Tabs({
  value,
  defaultValue,
  onValueChange,
  className,
  children,
}: {
  value?: string;
  defaultValue: string;
  onValueChange?: (value: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const [internalValue, setInternalValue] = React.useState(defaultValue);
  const currentValue = value ?? internalValue;
  const setValue = (next: string) => {
    onValueChange?.(next);
    if (value === undefined) {
      setInternalValue(next);
    }
  };

  return (
    <TabsContext.Provider value={{ value: currentValue, setValue }}>
      <div className={cn("w-full", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "inline-flex min-h-[58px] w-full items-center justify-start gap-2 rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(27,51,46,0.8),rgba(18,35,31,0.76))] p-2 text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_14px_28px_rgba(7,20,17,0.16)]",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  const context = React.useContext(TabsContext);
  if (!context) {
    throw new Error("TabsTrigger must be used within Tabs");
  }

  const isActive = context.value === value;
  return (
    <button
      type="button"
      className={cn(
        "axiora-chunky-btn axiora-chunky-btn--compact inline-flex min-h-10 items-center justify-center px-4 py-2 text-xs font-black uppercase tracking-[0.06em] transition-transform transition-shadow transition-opacity",
        isActive
          ? "bg-transparent text-[#18312E]"
          : "axiora-chunky-btn--outline border-white/15 text-[#F2E8DC] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-4px_0_rgba(49,64,59,0.9),0_7px_0_rgba(12,22,20,0.24),0_15px_22px_rgba(6,16,14,0.16)]",
        className,
      )}
      onClick={() => context.setValue(value)}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: React.ReactNode;
}) {
  const context = React.useContext(TabsContext);
  if (!context) {
    throw new Error("TabsContent must be used within Tabs");
  }

  if (context.value !== value) {
    return null;
  }
  return <div className={cn("mt-3", className)}>{children}</div>;
}


