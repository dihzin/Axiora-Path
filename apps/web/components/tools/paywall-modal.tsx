"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { ApiError, getApiErrorMessage } from "@/lib/api/client";
import { track } from "@/lib/tools/analytics";

type Props = {
  open: boolean;
  onClose: () => void;
  onBuy: (email: string) => Promise<void>;
  requireEmail?: boolean;
  email?: string;
  onEmailChange?: (value: string) => void;
};

function CheckIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="10" fill="rgba(238,135,72,0.15)" />
      <path d="M6 10l3 3 5-5" stroke="#ee8748" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg className="h-3 w-3 fill-[#fbbf24] text-[#fbbf24]" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}

export function PaywallModal({
  open,
  onClose,
  onBuy,
  requireEmail = false,
  email = "",
  onEmailChange,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [portalReady, setPortalReady] = useState(false);
  const [compactLayout, setCompactLayout] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const normalizedEmail = email.trim();

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateLayout = () => {
      setCompactLayout(window.innerHeight < 860);
    };
    updateLayout();
    window.addEventListener("resize", updateLayout);
    return () => window.removeEventListener("resize", updateLayout);
  }, []);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, busy, onClose]);

  useEffect(() => {
    if (open) {
      setError("");
      track("paywall_view");
    }
  }, [open]);

  const handleBuy = async () => {
    if (requireEmail) {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(normalizedEmail)) {
        setError("Informe um e-mail valido para continuar com a compra.");
        return;
      }
    }

    setBusy(true);
    setError("");
    track("paywall_click_buy");
    try {
      await onBuy(normalizedEmail);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(getApiErrorMessage(err, "Nao foi possivel iniciar o checkout. Tente novamente."));
      } else {
        setError("Nao foi possivel iniciar o checkout. Tente novamente.");
      }
    } finally {
      setBusy(false);
    }
  };

  if (!open || !portalReady) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center p-4 sm:p-6"
      style={{ backdropFilter: "blur(12px)", background: "rgba(4,10,18,0.75)" }}
      onClick={() => {
        if (!busy) onClose();
      }}
      aria-label="Fechar"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="paywall-title"
        tabIndex={-1}
        className="relative mx-auto my-auto w-full overflow-hidden rounded-2xl focus:outline-none"
        style={{
          maxWidth: compactLayout ? "360px" : "390px",
          background: "linear-gradient(160deg, rgba(18,28,42,0.98) 0%, rgba(10,18,30,0.99) 100%)",
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 40px 100px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background: "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(238,135,72,0.14) 0%, transparent 70%)",
          }}
        />

        <div
          className="relative z-10 h-[2px] w-full"
          style={{ background: "linear-gradient(90deg, transparent 0%, #fde68a 30%, #ee8748 65%, #db6728 100%)" }}
          aria-hidden="true"
        />

        <button
          onClick={onClose}
          disabled={busy}
          aria-label="Fechar"
          className="absolute right-3 top-3 z-20 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/60 backdrop-blur-sm transition hover:border-white/35 hover:bg-white/20 hover:text-white disabled:opacity-40"
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <div className={`relative z-10 ${compactLayout ? "px-5 pb-5 pt-4" : "px-6 pb-6 pt-5"}`}>
          <div className={`inline-flex items-center gap-1.5 rounded-full border border-[rgba(251,191,36,0.25)] bg-[rgba(251,191,36,0.08)] px-3 py-1 ${compactLayout ? "mb-3" : "mb-4"}`}>
            <StarIcon />
            <StarIcon />
            <StarIcon />
            <StarIcon />
            <StarIcon />
            <span className="ml-1 text-[10px] font-bold uppercase tracking-[0.15em] text-[#fbbf24]">
              Mais escolhido por professores
            </span>
          </div>

          <h2
            id="paywall-title"
            className={`${compactLayout ? "text-[18px]" : "text-[20px]"} font-extrabold leading-snug text-white`}
          >
            Você já usou suas{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "linear-gradient(135deg, #bfdbfe 0%, #60a5fa 55%, #3b82f6 100%)" }}
            >
              3 gerações grátis
            </span>
          </h2>
          <p className={`${compactLayout ? "mt-1 text-[12px]" : "mt-1.5 text-[13px]"} leading-relaxed text-white/50`}>
            Continue criando atividades de matemática em segundos, com PDF pronto para imprimir.
          </p>

          <div
            className={`${compactLayout ? "mt-4" : "mt-5"} overflow-hidden rounded-xl`}
            style={{
              background: "linear-gradient(135deg, rgba(238,135,72,0.12) 0%, rgba(253,230,138,0.06) 100%)",
              border: "1px solid rgba(238,135,72,0.22)",
              boxShadow: "inset 0 1px 0 rgba(255,219,190,0.08)",
            }}
          >
            <div className={compactLayout ? "px-4 pb-3 pt-3" : "px-4 pb-4 pt-4"}>
              <div className="flex flex-col items-center gap-1 text-center">
                <div className="flex items-start gap-1">
                  <span className="mt-2 text-[15px] font-bold text-white/60">R$</span>
                  <span
                    className={`${compactLayout ? "text-[44px]" : "text-[52px]"} font-black leading-none tracking-tighter`}
                    style={{
                      background: "linear-gradient(160deg, #fff 0%, rgba(255,255,255,0.75) 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                    }}
                  >
                    29
                  </span>
                </div>
                <span className={`${compactLayout ? "text-[12px]" : "text-[13px]"} font-semibold text-white/60`}>
                  por 30 gerações
                </span>
              </div>

              <div className={`${compactLayout ? "mt-2.5" : "mt-3"} flex flex-wrap justify-center gap-1.5`}>
                {["Sem assinatura", "Use no seu ritmo"].map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold text-white/60"
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <ul className={`${compactLayout ? "mt-3 space-y-2" : "mt-4 space-y-2.5"}`}>
            {[
              "Economize horas toda semana na preparação de aulas",
              "Gabarito automático em todas as listas",
              "PDF pronto para imprimir ou compartilhar",
            ].map((item) => (
              <li key={item} className={`flex items-center gap-2.5 ${compactLayout ? "text-[11px]" : "text-[12px]"} font-medium text-white/75`}>
                <CheckIcon />
                {item}
              </li>
            ))}
          </ul>

          {error && (
            <div
              className={`${compactLayout ? "mt-3" : "mt-4"} flex items-start gap-2 rounded-lg px-3 py-2.5`}
              style={{ background: "rgba(220,38,38,0.10)", border: "1px solid rgba(220,38,38,0.25)" }}
            >
              <svg className="mt-px h-3.5 w-3.5 shrink-0 text-[#f87171]" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <p className="text-[11px] font-medium text-[#f87171]">{error}</p>
            </div>
          )}

          {requireEmail && (
            <div className={compactLayout ? "mt-3" : "mt-4"}>
              <label htmlFor="paywall-email" className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">
                E-mail para liberar sua compra
              </label>
              <input
                id="paywall-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setError("");
                  onEmailChange?.(event.target.value);
                }}
                placeholder="voce@exemplo.com"
                className={`w-full rounded-xl border border-white/12 bg-white/[0.06] px-3 ${compactLayout ? "py-2.5 text-[13px]" : "py-3 text-[14px]"} font-medium text-white outline-none transition placeholder:text-white/25 focus:border-[#ee8748] focus:bg-white/[0.08] focus:ring-2 focus:ring-[#ee8748]/20`}
              />
              <p className={`${compactLayout ? "mt-1.5 text-[10px]" : "mt-2 text-[11px]"} leading-relaxed text-white/40`}>
                Usamos esse e-mail para vincular a compra e reduzir tentativas de reutilizar o teste grátis.
              </p>
            </div>
          )}

          <div className={`${compactLayout ? "mt-4 space-y-2" : "mt-5 space-y-2.5"}`}>
            <button
              onClick={() => void handleBuy()}
              disabled={busy}
              className={`relative w-full cursor-pointer overflow-hidden rounded-xl px-4 ${compactLayout ? "py-3 text-[13px]" : "py-3.5 text-[14px]"} font-extrabold tracking-[0.01em] text-white transition disabled:cursor-not-allowed disabled:opacity-70 hover:brightness-110 active:translate-y-[1px]`}
              style={{
                background: "linear-gradient(180deg, #ee8748 0%, #db6728 100%)",
                boxShadow: "inset 0 1px 0 rgba(255,219,190,0.25), 0 4px 0 rgba(158,74,30,0.55), 0 12px 28px rgba(93,48,22,0.35)",
              }}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_2.4s_ease-in-out_infinite]"
                style={{
                  background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.18) 50%, transparent 60%)",
                }}
              />
              {busy ? (
                <span className="flex items-center justify-center gap-2">
                  <SpinnerIcon />
                  Abrindo checkout...
                </span>
              ) : (
                "Comprar pacote — R$ 29"
              )}
            </button>

            <button
              onClick={onClose}
              disabled={busy}
              className={`w-full cursor-pointer rounded-xl px-4 ${compactLayout ? "py-2 text-[11px]" : "py-2.5 text-[12px]"} font-semibold text-white/30 transition hover:text-white/55 disabled:opacity-40`}
            >
              Voltar
            </button>
          </div>

          <div className={`${compactLayout ? "mt-3" : "mt-4"} flex items-center justify-center gap-1.5 text-white/25`}>
            <LockIcon />
            <span className={compactLayout ? "text-[9px]" : "text-[10px]"}>
              Pagamento via Stripe · 100% seguro · Sem dados armazenados
            </span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          60%, 100% { transform: translateX(200%); }
        }
      `}</style>
    </div>,
    document.body,
  );
}
