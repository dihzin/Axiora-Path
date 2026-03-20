"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  ApiError,
  createToolsCheckoutSession,
  generateToolsExercises,
  getApiErrorMessage,
  getToolsBillingStatus,
  type ToolsBillingStatusResponse,
  type ToolsGenerateExercisesResponse,
} from "@/lib/api/client";

const SUBJECT_OPTIONS = ["Matematica", "Portugues", "Ciencias", "Historia", "Geografia"];
const DIFFICULTY_OPTIONS = ["Facil", "Medio", "Dificil"];

function getOrCreateToolsSessionToken(): string {
  const key = "axiora_tools_session_token";
  const existing = window.localStorage.getItem(key);
  if (existing && existing.length > 10) return existing;
  const token = (window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replaceAll("-", "");
  window.localStorage.setItem(key, token);
  return token;
}

function extractPaywallData(error: unknown): {
  message: string;
  remaining: number;
  freeLimit: number;
  freeUsed: number;
  paidCreditsRemaining: number;
  upgradeUrl: string;
} {
  if (!(error instanceof ApiError) || typeof error.payload !== "object" || error.payload === null) {
    return {
      message: getApiErrorMessage(error, "Nao foi possivel gerar os exercicios."),
      remaining: 0,
      freeLimit: 0,
      freeUsed: 0,
      paidCreditsRemaining: 0,
      upgradeUrl: "/tools/gerador-atividades?upgrade=credits_30",
    };
  }
  const payload = error.payload as { detail?: unknown; message?: unknown };
  const detail = (payload.detail ?? payload) as Record<string, unknown>;
  return {
    message: typeof detail.message === "string" ? detail.message : "Limite gratuito atingido.",
    remaining: typeof detail.remaining_free_generations === "number" ? detail.remaining_free_generations : 0,
    freeLimit: typeof detail.free_limit === "number" ? detail.free_limit : 0,
    freeUsed: typeof detail.free_used === "number" ? detail.free_used : 0,
    paidCreditsRemaining: typeof detail.paid_credits_remaining === "number" ? detail.paid_credits_remaining : 0,
    upgradeUrl:
      typeof detail.upgrade_url === "string" && detail.upgrade_url.length > 0
        ? detail.upgrade_url
        : "/tools/gerador-atividades?upgrade=credits_30",
  };
}

export function ExerciseGeneratorTool() {
  const [sessionToken, setSessionToken] = useState<string>("");
  const [subject, setSubject] = useState<string>("Matematica");
  const [topic, setTopic] = useState<string>("Fracoes");
  const [age, setAge] = useState<number>(9);
  const [difficulty, setDifficulty] = useState<string>("Medio");
  const [count, setCount] = useState<number>(8);
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<ToolsGenerateExercisesResponse | null>(null);
  const [billingStatus, setBillingStatus] = useState<ToolsBillingStatusResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<boolean>(false);
  const [paywall, setPaywall] = useState<{
    message: string;
    remaining: number;
    freeLimit: number;
    freeUsed: number;
    paidCreditsRemaining: number;
    upgradeUrl: string;
  } | null>(null);

  useEffect(() => {
    const token = getOrCreateToolsSessionToken();
    setSessionToken(token);
    void getToolsBillingStatus(token).then(setBillingStatus).catch(() => null);
  }, []);

  const freeUsageLabel = useMemo(() => {
    if (!result) return null;
    const remaining = result.free_limit - result.free_used;
    if (remaining <= 0) return `Gerações gratuitas esgotadas (${result.free_limit}/${result.free_limit})`;
    return `${remaining} geração${remaining === 1 ? "" : "ões"} gratuita${remaining === 1 ? "" : "s"} restante${remaining === 1 ? "" : "s"}`;
  }, [result]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setPaywall(null);
    try {
      const response = await generateToolsExercises({
        subject,
        topic,
        age,
        difficulty,
        exercise_count: count,
        session_token: sessionToken || undefined,
      });
      setResult(response);
      setBillingStatus({
        free_limit: response.free_limit,
        free_used: response.free_used,
        remaining_free_generations: response.remaining_free_generations,
        paid_credits_remaining: response.paid_credits_remaining,
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 402) {
        setPaywall(extractPaywallData(error));
        if (sessionToken) {
          void getToolsBillingStatus(sessionToken).then(setBillingStatus).catch(() => null);
        }
      } else {
        setErrorMessage(getApiErrorMessage(error, "Erro ao gerar exercicios."));
      }
    } finally {
      setLoading(false);
    }
  }

  function handleDownloadPdf() {
    if (!result?.pdf_html) return;
    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) return;
    popup.document.open();
    popup.document.write(result.pdf_html);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  async function handleUpgradeCheckout() {
    if (checkoutLoading) return;
    setCheckoutLoading(true);
    setErrorMessage(null);
    try {
      const response = await createToolsCheckoutSession({
        plan_code: "credits_30",
        session_token: sessionToken || undefined,
      });
      window.location.assign(response.checkout_url);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Nao foi possivel abrir o pagamento."));
    } finally {
      setCheckoutLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
      <section className="rounded-2xl border border-white/15 bg-[rgba(255,255,255,0.05)] p-5 backdrop-blur-sm">
        <h2 className="text-xl font-bold text-white">Gerador de Exercícios Axiora</h2>
        <p className="mt-1 text-sm text-white/65">Preencha os campos e gere uma folha pronta para imprimir.</p>

        <form className="mt-5 space-y-3" onSubmit={handleSubmit}>
          <label className="block text-sm text-white/80">
            Matéria
            <select
              className="mt-1 w-full rounded-lg border border-white/20 bg-[rgba(6,14,22,0.55)] px-3 py-2 text-white backdrop-blur-sm"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            >
              {SUBJECT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm text-white/80">
            Tema
            <input
              className="mt-1 w-full rounded-lg border border-white/20 bg-[rgba(6,14,22,0.55)] px-3 py-2 text-white backdrop-blur-sm"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="Ex.: Fracoes"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm text-white/80">
              Idade
              <input
                type="number"
                min={5}
                max={18}
                className="mt-1 w-full rounded-lg border border-white/20 bg-[rgba(6,14,22,0.55)] px-3 py-2 text-white backdrop-blur-sm"
                value={age}
                onChange={(event) => setAge(Number(event.target.value))}
              />
            </label>
            <label className="block text-sm text-white/80">
              Dificuldade
              <select
                className="mt-1 w-full rounded-lg border border-white/20 bg-[rgba(6,14,22,0.55)] px-3 py-2 text-white backdrop-blur-sm"
                value={difficulty}
                onChange={(event) => setDifficulty(event.target.value)}
              >
                {DIFFICULTY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-sm text-white/85">
            Quantidade de exercícios
            <input
              type="number"
              min={3}
              max={15}
              className="mt-1 w-full rounded-lg border border-white/20 bg-[rgba(6,14,22,0.55)] px-3 py-2 text-white backdrop-blur-sm"
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-xl bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] px-4 py-2.5 text-sm font-bold text-white shadow-[inset_0_1px_0_rgba(255,219,190,0.3),0_4px_0_rgba(158,74,30,0.45),0_10px_18px_rgba(93,48,22,0.2)] transition hover:brightness-110 disabled:opacity-60 disabled:shadow-none"
          >
            {loading ? "Gerando..." : "Gerar exercícios"}
          </button>
        </form>

        {freeUsageLabel ? <p className="mt-3 text-xs text-white/60">{freeUsageLabel}</p> : null}
        {billingStatus && billingStatus.paid_credits_remaining > 0 ? (
          <p className="mt-1 text-xs text-[#fcd34d]">
            {billingStatus.paid_credits_remaining} crédito{billingStatus.paid_credits_remaining === 1 ? "" : "s"} pago{billingStatus.paid_credits_remaining === 1 ? "" : "s"} disponível{billingStatus.paid_credits_remaining === 1 ? "" : "eis"}
          </p>
        ) : null}
        {errorMessage ? <p className="mt-3 text-sm text-rose-200">{errorMessage}</p> : null}

        {paywall ? (
          <div className="mt-4 rounded-xl border border-[rgba(238,135,72,0.35)] bg-[rgba(238,135,72,0.1)] p-4">
            <p className="text-sm font-semibold text-[#fde68a]">
              Você usou suas {paywall.freeLimit} gerações gratuitas deste mês.
            </p>
            <p className="mt-1 text-xs text-white/65">
              Continue gerando com um pacote de créditos — sem assinatura, sem vencimento.
            </p>
            <button
              type="button"
              onClick={handleUpgradeCheckout}
              disabled={checkoutLoading}
              className="mt-3 inline-flex rounded-lg bg-[linear-gradient(180deg,#ee8748,#db6728)] px-3 py-2 text-sm font-bold text-white shadow-[0_3px_0_rgba(158,74,30,0.45)] transition hover:brightness-110 disabled:opacity-60 disabled:shadow-none"
            >
              {checkoutLoading ? "Abrindo pagamento..." : "Desbloquear 30 gerações por R$ 29"}
            </button>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-white/15 bg-[rgba(255,255,255,0.05)] p-5 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-white">Preview</h3>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={!result}
            className="rounded-lg border border-white/20 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
          >
            Baixar PDF
          </button>
        </div>

        {!result ? (
          <p className="mt-4 text-sm text-white/60">Gere uma lista para visualizar os exercícios e o gabarito.</p>
        ) : (
          /* ── Preview simula o documento real ── */
          <div className="mt-4 overflow-hidden rounded-xl border border-[#ddd] bg-white font-mono text-[13px] text-[#111] shadow-[0_8px_32px_rgba(0,0,0,0.35)]">
            {/* Brand bar */}
            <div className="flex items-center justify-between border-b border-[#eee] px-5 py-2.5">
              <span className="font-[Georgia,serif] text-[10px] font-bold uppercase tracking-[2.5px] text-[#ee8748]">
                Axiora Tools
              </span>
              <span className="text-[9px] tracking-[0.4px] text-[#bbb]">Material para uso educacional</span>
            </div>

            <div className="px-5 py-4">
              {/* Title */}
              <h4 className="text-center font-[Georgia,serif] text-[17px] font-bold leading-tight text-[#111]">
                {result.title}
              </h4>
              <div className="mt-1.5 h-[2px] bg-[#111]" />
              <div className="mt-[2px] h-[1px] bg-[#111]" />

              {/* Student fields */}
              <div className="mt-2.5 flex items-baseline text-[11px]">
                <span className="shrink-0">Nome:&nbsp;</span>
                <span className="min-w-[40px] flex-1 border-b border-[#555]">&nbsp;</span>
                <span className="ml-5 shrink-0 text-[10px]">
                  Data:&nbsp;
                  <span className="inline-block min-w-[14px] border-b border-[#555] align-bottom">&nbsp;</span>
                  /<span className="inline-block min-w-[14px] border-b border-[#555] align-bottom">&nbsp;</span>
                  /<span className="inline-block min-w-[26px] border-b border-[#555] align-bottom">&nbsp;</span>
                </span>
              </div>
              <div className="mt-1 flex items-baseline text-[11px]">
                <span className="shrink-0">Turma:&nbsp;</span>
                <span className="max-w-[120px] flex-1 border-b border-[#555]">&nbsp;</span>
                <span className="flex-1" />
                <span className="ml-5 shrink-0">Nota:&nbsp;<span className="inline-block min-w-[44px] border-b border-[#555] align-bottom">&nbsp;</span></span>
              </div>
              <div className="mb-3 mt-2 h-[1px] bg-[#ccc]" />

              {/* Instructions */}
              <p className="mb-3 border-b border-t border-[#e5e5e5] py-1.5 text-[11px] italic text-[#555]">
                {result.instructions}
              </p>

              {/* Section header */}
              <p className="mb-2.5 border-b border-[#ddd] pb-1 text-[10px] font-bold uppercase tracking-[2px] text-[#111]">
                Exercícios
              </p>

              {/* Exercises */}
              <div className="space-y-2.5 text-[12.5px]">
                {result.exercises.map((item) => (
                  <div key={`exercise-${item.number}`} className="flex items-start gap-2">
                    <span className="w-5 shrink-0 font-bold text-[#111]">{item.number}.</span>
                    <span className="flex-1">{item.prompt}</span>
                  </div>
                ))}
              </div>

              {/* Answer key */}
              <div className="mt-4 border border-dashed border-[#bbb] bg-[#f9f8f6] p-3">
                <p className="mb-2 text-[9.5px] font-bold uppercase tracking-[2px] text-[#777]">Gabarito</p>
                <div className="space-y-1 text-[11.5px] text-[#444]">
                  {result.answer_key.map((item) => (
                    <div key={`answer-${item.number}`} className="flex items-start gap-2">
                      <span className="w-4 shrink-0 font-bold text-[#999]">{item.number}.</span>
                      <span>{item.answer}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="mt-3 flex justify-between border-t border-[#e5e5e5] pt-1.5 text-[9px] text-[#ccc]">
                <span>Axiora Tools · axiora.com.br</span>
                <span>Reprodução livre para fins pedagógicos</span>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
