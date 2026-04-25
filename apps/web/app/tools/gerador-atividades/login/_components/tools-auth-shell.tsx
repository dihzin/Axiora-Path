"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { AxioraHeaderLogo } from "@/components/brand/axiora-header-logo";
import { MarketingBackground } from "@/components/marketing-background";

type ToolsAuthShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

export function ToolsAuthShell({ title, subtitle, children }: ToolsAuthShellProps) {
  return (
    <div className="relative isolate">
      <MarketingBackground priority />

      <main className="relative min-h-screen text-white">
        <nav className="sticky top-0 z-30 border-b border-[rgba(238,135,72,0.14)] bg-[linear-gradient(180deg,rgba(8,20,31,0.72)_0%,rgba(9,24,36,0.62)_100%)] shadow-[0_10px_30px_rgba(4,12,20,0.16)] backdrop-blur-xl">
          <div className="mx-auto flex max-w-5xl items-center px-5 py-3.5">
            <Link href="/tools" className="flex shrink-0 items-center">
              <AxioraHeaderLogo className="w-[168px] sm:w-[196px]" priority />
            </Link>
          </div>
        </nav>

        <div className="mx-auto flex min-h-[calc(100vh-72px)] w-full max-w-5xl items-center justify-center px-5 py-8">
          <section className="w-full max-w-[760px]">
            <header className="mx-auto mb-6 max-w-[52ch] text-center">
              <h1 className="text-[24px] font-black leading-tight tracking-[-0.02em] text-white sm:text-[32px]">{title}</h1>
              <p className="mt-3 text-sm leading-6 text-white/75 sm:text-[15px]">{subtitle}</p>
            </header>
            {children}
          </section>
        </div>
      </main>
    </div>
  );
}

