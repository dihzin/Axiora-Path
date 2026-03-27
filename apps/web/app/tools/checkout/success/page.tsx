"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { getToolsCheckoutStatus } from "@/lib/api/client";
import { useToolsIdentity } from "@/context/tools-identity-context";
import { getOrCreateAnonId } from "@/lib/identity";
import { track } from "@/lib/tools/analytics";
import { MarketingBackground } from "@/components/marketing-background";

type Phase = "loading" | "success" | "pending" | "error";

const GENERATOR_URL = "/tools/gerador-atividades";
const MAX_POLL_ATTEMPTS = 4;
const POLL_DELAY_MS = [2000, 3000, 4000]; // increasing backoff

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CheckoutSuccessPage() {
  const identity = useToolsIdentity();
  const [phase, setPhase] = useState<Phase>("loading");
  const [creditsAvailable, setCreditsAvailable] = useState(0);
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");

    if (!sessionId) {
      setPhase("error");
      track("checkout_failed", { reason: "missing_session_id" });
      return;
    }

    track("return_after_payment");

    async function poll(attempt: number) {
      try {
        const result = await getToolsCheckoutStatus(sessionId!, identity.anonymousId || getOrCreateAnonId());
        const status = result.payment_status;

        if (status === "paid" || status === "completed") {
          setCreditsAvailable(result.paid_generations_available);
          setPhase("success");
          track("checkout_success", { credits_added: result.paid_generations_available });
          // Sync global identity state so badge and paywall reflect new credits
          void identity.refresh();
          return;
        }

        if (attempt < MAX_POLL_ATTEMPTS - 1) {
          setPhase("pending");
          await sleep(POLL_DELAY_MS[attempt] ?? 4000);
          await poll(attempt + 1);
        } else {
          // Exhausted retries — still pending (webhook may be delayed)
          setPhase("pending");
        }
      } catch {
        setPhase("error");
        track("checkout_failed", { reason: "poll_error", attempt });
      }
    }

    void poll(0);
    // identity.refresh is stable (useCallback with [] deps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative isolate flex min-h-dvh flex-col items-center justify-center px-4 py-16">
      {/* Background */}
      <MarketingBackground priority />

      {/* Card */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-[rgba(6,14,22,0.82)] p-8 shadow-2xl backdrop-blur-md text-white text-center">
        {/* Logo */}
        <div className="mb-6 flex justify-center">
          <Link href="/tools" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[linear-gradient(180deg,#ee8748,#db6728)] shadow-[0_2px_0_rgba(158,74,30,0.5)]">
              <span className="text-[0.7rem] font-black text-white">A</span>
            </div>
            <span className="text-sm font-extrabold tracking-tight text-white">
              Axiora <span className="text-[#fcd34d]">Tools</span>
            </span>
          </Link>
        </div>

        {phase === "loading" && <LoadingState />}
        {phase === "success" && <SuccessState credits={creditsAvailable} />}
        {phase === "pending" && <PendingState />}
        {phase === "error" && <ErrorState />}
      </div>
    </div>
  );
}

// ── States ────────────────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex flex-col items-center gap-4">
      <SpinnerIcon className="h-10 w-10 animate-spin text-[#fcd34d]" />
      <p className="text-base font-semibold text-white/80">Confirmando pagamento...</p>
    </div>
  );
}

function SuccessState({ credits }: { credits: number }) {
  return (
    <div className="flex flex-col items-center gap-5">
      {/* Icon */}
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(34,197,94,0.12)] ring-1 ring-[rgba(34,197,94,0.35)]">
        <CheckIcon className="h-8 w-8 text-[#4ade80]" />
      </div>

      {/* Copy */}
      <div className="space-y-1.5">
        <h1 className="text-xl font-extrabold">Pagamento confirmado!</h1>
        <p className="text-sm text-white/65">
          {credits > 0
            ? `${credits} gerações liberadas e prontas para usar.`
            : "Suas gerações foram liberadas e estão prontas para usar."}
        </p>
      </div>

      {/* Credits badge */}
      {credits > 0 && (
        <div className="inline-flex items-center gap-2 rounded-xl border border-[rgba(252,211,77,0.25)] bg-[rgba(252,211,77,0.08)] px-4 py-2.5">
          <span className="text-2xl font-black text-[#fcd34d]">{credits}</span>
          <span className="text-sm font-semibold text-white/70">gerações disponíveis</span>
        </div>
      )}

      {/* CTA */}
      <Link
        href={GENERATOR_URL}
        className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] px-5 py-3 text-sm font-extrabold text-white shadow-[0_4px_0_rgba(158,74,30,0.45),0_8px_16px_rgba(93,48,22,0.22)] transition hover:brightness-110 active:translate-y-0.5 active:shadow-[0_2px_0_rgba(158,74,30,0.45)]"
      >
        Continuar gerando
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
      </Link>
    </div>
  );
}

function PendingState() {
  return (
    <div className="flex flex-col items-center gap-5">
      {/* Icon */}
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(252,211,77,0.10)] ring-1 ring-[rgba(252,211,77,0.25)]">
        <ClockIcon className="h-8 w-8 text-[#fcd34d]" />
      </div>

      {/* Copy */}
      <div className="space-y-1.5">
        <h1 className="text-xl font-extrabold">Aguardando confirmação</h1>
        <p className="text-sm text-white/65">
          O pagamento está sendo processado. Isso pode levar alguns instantes.
        </p>
      </div>

      {/* Actions */}
      <div className="flex w-full flex-col gap-2.5 pt-1">
        <Link
          href={GENERATOR_URL}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] px-5 py-3 text-sm font-extrabold text-white shadow-[0_4px_0_rgba(158,74,30,0.45)] transition hover:brightness-110"
        >
          Ir para o gerador
        </Link>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex w-full items-center justify-center rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white cursor-pointer"
        >
          Verificar novamente
        </button>
      </div>

      <p className="text-xs text-white/35">
        Se o pagamento foi aprovado, seus créditos aparecerão no gerador em breve.
      </p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex flex-col items-center gap-5">
      {/* Icon */}
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(239,68,68,0.10)] ring-1 ring-[rgba(239,68,68,0.25)]">
        <AlertIcon className="h-8 w-8 text-[#f87171]" />
      </div>

      {/* Copy */}
      <div className="space-y-1.5">
        <h1 className="text-xl font-extrabold">Não foi possível confirmar</h1>
        <p className="text-sm text-white/65">
          Não conseguimos verificar seu pagamento. Se foi cobrado, seus créditos serão liberados em breve.
        </p>
      </div>

      {/* Actions */}
      <div className="flex w-full flex-col gap-2.5 pt-1">
        <Link
          href={GENERATOR_URL}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] px-5 py-3 text-sm font-extrabold text-white shadow-[0_4px_0_rgba(158,74,30,0.45)] transition hover:brightness-110"
        >
          Ir para o gerador
        </Link>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex w-full items-center justify-center rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/10 hover:text-white cursor-pointer"
        >
          Tentar novamente
        </button>
      </div>

      <p className="text-xs text-white/35">
        Dúvidas?{" "}
        <a href="mailto:suporte@axiorapath.com" className="underline hover:text-white/60 transition-colors">
          suporte@axiorapath.com
        </a>
      </p>
    </div>
  );
}
