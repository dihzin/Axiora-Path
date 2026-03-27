import { MarketingBackground } from "@/components/marketing-background";

function LoadingCard() {
  return <div className="h-24 animate-pulse rounded-2xl border border-white/10 bg-white/5" />;
}

export default function ToolsLoading() {
  return (
    <div className="relative isolate min-h-screen text-white">
      <MarketingBackground />
      <div className="relative mx-auto max-w-5xl px-5 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto h-6 w-40 animate-pulse rounded-full bg-white/10" />
          <div className="mx-auto mt-6 h-14 w-full max-w-2xl animate-pulse rounded-3xl bg-white/10" />
          <div className="mx-auto mt-4 h-5 w-full max-w-xl animate-pulse rounded-full bg-white/5" />
          <div className="mx-auto mt-8 h-12 w-72 animate-pulse rounded-2xl bg-[#ee8748]/40" />
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          <LoadingCard />
          <LoadingCard />
          <LoadingCard />
        </div>
      </div>
    </div>
  );
}
