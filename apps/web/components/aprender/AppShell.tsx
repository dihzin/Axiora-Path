"use client";

import { type CSSProperties, type ReactNode, useEffect } from "react";

import { PATH_CSS_VARS } from "@/components/aprender/path-tokens";
import { cn } from "@/lib/utils";

export const APP_SHELL_HEADER_HEIGHT = 72;
export const APP_SHELL_FOOTER_HEIGHT = 72;

type AppShellProps = {
  header: ReactNode;
  footer: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function AppShell({ header, footer, children, className, style }: AppShellProps) {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const appRoot = body.firstElementChild as HTMLElement | null;
    const prevHtmlOverflow = html.style.overflow;
    const prevHtmlOverscroll = html.style.overscrollBehaviorY;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyOverscroll = body.style.overscrollBehaviorY;
    const prevAppRootOverflow = appRoot?.style.overflow;
    const prevAppRootOverflowY = appRoot?.style.overflowY;

    html.style.overflow = "hidden";
    html.style.overscrollBehaviorY = "none";
    body.style.overflow = "hidden";
    body.style.overscrollBehaviorY = "none";
    if (appRoot) {
      appRoot.style.overflow = "hidden";
      appRoot.style.overflowY = "hidden";
    }

    return () => {
      html.style.overflow = prevHtmlOverflow;
      html.style.overscrollBehaviorY = prevHtmlOverscroll;
      body.style.overflow = prevBodyOverflow;
      body.style.overscrollBehaviorY = prevBodyOverscroll;
      if (appRoot) {
        appRoot.style.overflow = prevAppRootOverflow ?? "";
        appRoot.style.overflowY = prevAppRootOverflowY ?? "";
      }
    };
  }, []);

  return (
    <main className="relative mx-auto h-dvh w-full max-w-md overflow-hidden" style={{ ...PATH_CSS_VARS, ...style }}>
      <div
        className={cn(
          "fixed left-1/2 top-0 z-40 h-[72px] w-full max-w-md -translate-x-1/2 transform-gpu border-b border-white/70 bg-[color:var(--path-surface-alt)]/96 backdrop-blur will-change-transform",
        )}
      >
        {header}
      </div>

      <section
        className={cn("overflow-hidden px-3", className)}
        style={{
          marginTop: APP_SHELL_HEADER_HEIGHT,
          height: `calc(100dvh - ${APP_SHELL_HEADER_HEIGHT}px - ${APP_SHELL_FOOTER_HEIGHT}px)`,
        }}
      >
        <div className="h-full overflow-hidden">{children}</div>
      </section>

      <div className="fixed bottom-0 left-1/2 z-40 h-[72px] w-full max-w-md -translate-x-1/2 transform-gpu will-change-transform">{footer}</div>
    </main>
  );
}
