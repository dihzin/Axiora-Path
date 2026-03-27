import { MarketingBackground } from "@/components/marketing-background";

export default function ToolPageLoading() {
  return (
    <div className="relative isolate min-h-screen text-white">
      <MarketingBackground />
      <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="h-8 w-40 animate-pulse rounded-full bg-white/10" />
        <div className="mt-6 h-14 w-full max-w-3xl animate-pulse rounded-3xl bg-white/10" />
        <div className="mt-4 h-5 w-full max-w-2xl animate-pulse rounded-full bg-white/5" />
        <div className="mt-10 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="h-[520px] animate-pulse rounded-[28px] border border-white/10 bg-white/5" />
          <div className="h-[520px] animate-pulse rounded-[28px] border border-white/10 bg-white/5" />
        </div>
      </div>
    </div>
  );
}
