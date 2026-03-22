"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Flame, HelpCircle, Sparkles, Target, Zap } from "lucide-react";

import { ChildBottomNav } from "@/components/child-bottom-nav";
import { ChildDesktopShell } from "@/components/child-desktop-shell";
import { PageShell } from "@/components/layout/page-shell";
import {
  getApiErrorMessage,
  getAxionBrainState,
  getAxionBrief,
  getAxionGuardrailsSummary,
  getAxionPolicyStatus,
  getAxionRecentUnlocks,
  trackAxionCtaClicked,
  type AxionBrainStateResponse,
  type AxionBriefResponse,
  type AxionGuardrailsSummaryResponse,
  type AxionPolicyStatusResponse,
  type AxionRecentUnlock,
} from "@/lib/api/client";

type CoachCopy = {
  why: string;
  how: string;
};

type SubjectStatus = "strong" | "stable" | "needs_attention";

const TONE_STYLE: Record<string, string> = {
  CALM: "from-[#E6F8F4] to-[#F4FBFA]",
  ENCOURAGE: "from-[#E8F9F4] to-[#F7FCFB]",
  CHALLENGE: "from-[#EAF5FF] to-[#F5FAFF]",
  CELEBRATE: "from-[#FFF4E8] to-[#FFF9F1]",
  SUPPORT: "from-[#ECF7FF] to-[#F8FCFF]",
};

function mapCoachCopy(actionType: string): CoachCopy {
  const action = actionType.toUpperCase();
  if (action === "OPEN_REVIEWS") {
    return {
      why: "Você tem revisões prontas agora e uma rodada curtinha ajuda a manter tudo fresco na memória.",
      how: "Revisar hoje fortalece o que você já aprendeu e deixa o próximo desafio mais leve.",
    };
  }
  if (action === "OPEN_GAME_BREAK") {
    return {
      why: "Seu foco rende melhor com uma pausa ativa e estratégica antes da próxima sessão.",
      how: "Uma partida curta recarrega sua atenção e melhora o desempenho no estudo.",
    };
  }
  if (action === "ACTIVATE_BOOST") {
    return {
      why: "Este é um bom momento para acelerar: você está com ritmo favorável.",
      how: "Com impulso ativo, cada acerto rende mais progresso no mesmo tempo.",
    };
  }
  return {
    why: "Escolhi uma próxima ação curta e prática para você avançar sem sobrecarga.",
    how: "Pequenos passos constantes criam evolução forte e duradoura.",
  };
}

function routeForAction(actionType: string): string {
  const action = actionType.toUpperCase();
  if (action === "OPEN_GAME_BREAK") return "/child/games";
  return "/child/aprender";
}

function getSubjectStatus(score: number): SubjectStatus {
  if (score >= 0.75) return "strong";
  if (score >= 0.5) return "stable";
  return "needs_attention";
}

const SUBJECT_STATUS_STYLE: Record<SubjectStatus, string> = {
  strong: "border-[#B9EAD8] bg-[#EAF9F2] text-[#0E8F62]",
  stable: "border-[#F7D8A3] bg-[#FFF5DF] text-[#B87400]",
  needs_attention: "border-[#F3B8B8] bg-[#FFECEC] text-[#B23B3B]",
};

export default function ChildAxionPage() {
  const router = useRouter();
  const [coachOpen, setCoachOpen] = useState(false);
  const [ctaPending, setCtaPending] = useState(false);
  const [activeChildId, setActiveChildId] = useState<number | null>(null);
  const [brief, setBrief] = useState<AxionBriefResponse | null>(null);
  const [debugRequested, setDebugRequested] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [brainState, setBrainState] = useState<AxionBrainStateResponse | null>(null);
  const [recentUnlocks, setRecentUnlocks] = useState<AxionRecentUnlock[]>([]);
  const [guardrailsSummary, setGuardrailsSummary] = useState<AxionGuardrailsSummaryResponse | null>(null);
  const [policyStatus, setPolicyStatus] = useState<AxionPolicyStatusResponse | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const debugFlag = new URLSearchParams(window.location.search).get("axionDebug");
    setDebugRequested(debugFlag === "true");
    const rawChildId = window.sessionStorage.getItem("axiora_child_id");
    const parsed = Number(rawChildId);
    if (Number.isFinite(parsed)) {
      setActiveChildId(parsed);
    }
  }, []);

  useEffect(() => {
    if (activeChildId === null) return;
    let mounted = true;
    setLoading(true);
    setError(null);
    getAxionBrief({ context: "child_tab", childId: activeChildId ?? undefined, axionDebug: debugRequested })
      .then((data) => {
        if (!mounted) return;
        setBrief(data);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [activeChildId, debugRequested]);

  const loadInsights = useCallback((childId: number) => {
    let mounted = true;
    setInsightsLoading(true);
    setInsightsError(null);
    Promise.allSettled([
      getAxionBrainState(childId),
      getAxionRecentUnlocks(childId),
      getAxionGuardrailsSummary(childId),
      getAxionPolicyStatus(childId),
    ])
      .then(([brainResult, unlockResult, guardrailsResult, policyResult]) => {
        if (!mounted) return;
        const hasAnyFailure = [brainResult, unlockResult, guardrailsResult, policyResult].some((item) => item.status === "rejected");
        setBrainState(brainResult.status === "fulfilled" ? brainResult.value : null);
        setRecentUnlocks(unlockResult.status === "fulfilled" ? unlockResult.value : []);
        setGuardrailsSummary(guardrailsResult.status === "fulfilled" ? guardrailsResult.value : null);
        setPolicyStatus(policyResult.status === "fulfilled" ? policyResult.value : null);
        if (hasAnyFailure) {
          setInsightsError("Alguns insights do Axion estão indisponíveis no momento.");
        }
      })
      .finally(() => {
        if (!mounted) return;
        setInsightsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (activeChildId === null) return;
    const cleanup = loadInsights(activeChildId);
    return cleanup;
  }, [activeChildId, loadInsights]);

  const toneBg = useMemo(() => {
    const tone = brief?.tone ?? "ENCOURAGE";
    return TONE_STYLE[tone] ?? TONE_STYLE.ENCOURAGE;
  }, [brief?.tone]);

  const coachCopy = useMemo(() => mapCoachCopy(brief?.cta.actionType ?? ""), [brief?.cta.actionType]);
  const adaptiveButton = useMemo(() => {
    const defaultState = {
      label: "Continuar Jornada",
      className: "bg-[#FF6B3D] shadow-[0_6px_0_rgba(212,85,45,0.35)]",
    };
    if (!brainState || !Array.isArray(brainState.subjects) || brainState.subjects.length === 0) {
      return defaultState;
    }

    const weakestSubjectName = String(brainState.weakestSubject ?? "").trim().toLowerCase();
    const weakestSubject = brainState.subjects.find((item) => String(item.subject).trim().toLowerCase() === weakestSubjectName);
    const weakestMastery = Number(weakestSubject?.masteryScore ?? 1);
    const averageMastery = Number(brainState.averageMastery ?? 0);

    if (Number.isFinite(weakestMastery) && weakestMastery < 0.5) {
      const labelSubject = weakestSubjectName || "base";
      return {
        label: `Reforcar ${labelSubject}`,
        className: "bg-[#F59E0B] shadow-[0_6px_0_rgba(180,120,20,0.35)]",
      };
    }

    if (Number.isFinite(averageMastery) && averageMastery > 0.8) {
      return {
        label: "Desafio Avancado",
        className: "bg-[#10B981] shadow-[0_6px_0_rgba(9,120,85,0.35)]",
      };
    }

    return defaultState;
  }, [brainState]);
  const policyMode = useMemo(() => {
    const raw = String(policyStatus?.policyMode || "").trim().toUpperCase();
    if (raw) return raw;
    const reason = String(brief?.nba_reason || "").trim();
    if (reason === "policy_canary_serving") return "CANARY";
    if (reason === "policy_active_serving") return "ACTIVE";
    if (reason === "policy_shadow_block") return "SHADOW";
    if (reason === "policy_rolled_back") return "ROLLED_BACK";
    return "LEVEL4";
  }, [policyStatus?.policyMode, brief?.nba_reason]);
  const rolloutLabel = useMemo(() => {
    if (policyStatus?.rolloutPercentage === null || policyStatus?.rolloutPercentage === undefined) return "--";
    return `${policyStatus.rolloutPercentage}%`;
  }, [policyStatus?.rolloutPercentage]);
  const debugVisible = debugRequested || Boolean(brief?.debug);
  const state = (brief?.debug?.state ?? {}) as Record<string, unknown>;
  const rulesFired = brief?.debug?.triggeredRules ?? [];
  const decisions = brief?.debug?.decisions ?? [];
  const evaluatedRules = brief?.debug?.evaluatedRules ?? [];
  const temporaryBoosts = brief?.debug?.temporaryBoosts ?? [];
  const frustrationScore = Number(state.frustrationScore ?? 0);
  const dropoutRiskScore = Number(state.dropoutRiskScore ?? 0);
  const learningMomentum = Number(state.learningMomentum ?? 0);
  const frustrationTrend = learningMomentum < -0.08 ? "Subindo" : learningMomentum > 0.08 ? "Descendo" : "Estável";

  const scoreBar = (value: unknown) => {
    const numeric = Math.max(0, Math.min(1, Number(value ?? 0)));
    return Math.round(numeric * 100);
  };

  const handleCta = async () => {
    if (!brief) return;
    setCtaPending(true);
    const tracePayload = {
      decisionId: brief.decision_id,
      actionType: brief.actionType,
      context: brief.context,
    };
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("axion_active_decision_id", brief.decision_id);
    }
    void trackAxionCtaClicked(tracePayload).catch(() => null);
    router.push(routeForAction(brief.cta.actionType));
  };

  return (
    <ChildDesktopShell activeNav="axion" menuSkin="trail">
      <PageShell tone="child" width="content" className="pt-4">
        <section className={`rounded-[30px] border border-[#BFD3EE] bg-gradient-to-br p-5 shadow-[0_8px_24px_rgba(32,88,140,0.08)] ${toneBg}`}>
        <div className="mb-4 flex items-center justify-between">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#BFD3EE] bg-white/85 px-3 py-1 text-xs font-bold text-[#2A456D]">
            <Bot className="h-3.5 w-3.5" />
            Axion
          </div>
          <button
            className="axiora-chunky-btn axiora-control-btn axiora-chunky-btn--compact inline-flex items-center gap-1 px-3 py-1 text-xs text-[#2A456D]"
            onClick={() => setCoachOpen(true)}
            type="button"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            Coach
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          <span className="inline-flex items-center rounded-full border border-[#BFD3EE] bg-white/80 px-2.5 py-1 text-[11px] font-extrabold text-[#2A456D]">
            Policy: {policyMode}
          </span>
          <span className="inline-flex items-center rounded-full border border-[#BFD3EE] bg-white/80 px-2.5 py-1 text-[11px] font-extrabold text-[#2A456D]">
            Rollout: {rolloutLabel}
          </span>
        </div>

        <h1 className="text-xl font-extrabold leading-tight text-[#1B365D]">
          {loading ? "Axion esta preparando seu proximo passo..." : brief?.message ?? "Vamos dar o proximo passo?"}
        </h1>
        {insightsError ? (
          <div className="mt-3 rounded-xl border border-[#F6C6C5] bg-[#FFF1F1] px-3 py-2">
            <p className="text-xs font-semibold text-[#B94A48]">{insightsError}</p>
            {activeChildId !== null ? (
              <button
                type="button"
                className="mt-2 axiora-chunky-btn axiora-control-btn axiora-chunky-btn--compact px-3 py-1 text-[11px] font-bold text-[#2A456D]"
                onClick={() => loadInsights(activeChildId)}
              >
                Tentar novamente
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 grid grid-cols-3 gap-2 text-[#23436C]">
          <div className="rounded-2xl border border-[#BFD3EE] bg-white/80 px-3 py-2 text-center">
            <div className="mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#FFEEE1] text-[#F97316]">
              <Flame className="h-3 w-3" />
            </div>
            <p className="text-[11px] font-semibold opacity-80">Streak</p>
            <p className="text-sm font-bold">{brief?.miniStats.streak ?? "-"}</p>
          </div>
          <div className="rounded-2xl border border-[#BFD3EE] bg-white/80 px-3 py-2 text-center">
            <div className="mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#EEF4FF] text-[#315E9F]">
              <Target className="h-3 w-3" />
            </div>
            <p className="text-[11px] font-semibold opacity-80">Revisoes</p>
            <p className="text-sm font-bold">{brief?.miniStats.dueReviews ?? "-"}</p>
          </div>
          <div className="rounded-2xl border border-[#BFD3EE] bg-white/80 px-3 py-2 text-center">
            <div className="mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#E8FFF8] text-[#0D9D8A]">
              <Zap className="h-3 w-3" />
            </div>
            <p className="text-[11px] font-semibold opacity-80">Energia</p>
            <p className="text-sm font-bold">{brief?.miniStats.energy ?? "-"}</p>
          </div>
        </div>

        <button
          className={`axiora-chunky-btn mt-5 inline-flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-70 ${adaptiveButton.className}`}
          disabled={loading || !brief || ctaPending}
          onClick={handleCta}
          type="button"
          data-testid="axion-primary-cta"
        >
          <Sparkles className="h-4 w-4" />
          {loading || !brief ? "Carregando sugestao..." : adaptiveButton.label}
        </button>
        {error ? <p className="mt-3 text-xs font-semibold text-[#B94A48]">{getApiErrorMessage(error, "Nao foi possivel conectar ao servidor.")}</p> : null}

        {debugVisible ? (
          <section className="mt-4 rounded-2xl border border-[#BFD3EE] bg-white/80 p-3">
            <button
              className="axiora-chunky-btn axiora-control-btn flex w-full items-center justify-between px-3 py-2 text-left text-xs font-extrabold text-[#24456F]"
              onClick={() => setDebugOpen((prev) => !prev)}
              type="button"
            >
              <span>Debug Axion</span>
              <span>{debugOpen ? "Ocultar" : "Mostrar"}</span>
            </button>
            {debugOpen ? (
              <div className="mt-3 space-y-3 text-xs text-[#2C4C76]">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="mb-1 font-bold">Ritmo</p>
                    <div className="h-2 rounded-full bg-[#E6EEF9]">
                      <div className="h-2 rounded-full bg-[#20B3A8]" style={{ width: `${scoreBar(state.rhythmScore)}%` }} />
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 font-bold">Confiança</p>
                    <div className="h-2 rounded-full bg-[#E6EEF9]">
                      <div className="h-2 rounded-full bg-[#20B3A8]" style={{ width: `${scoreBar(state.confidenceScore)}%` }} />
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 font-bold">Frustração</p>
                    <div className="h-2 rounded-full bg-[#E6EEF9]">
                      <div className="h-2 rounded-full bg-[#FF8A65]" style={{ width: `${scoreBar(state.frustrationScore)}%` }} />
                    </div>
                  </div>
                  <div>
                    <p className="mb-1 font-bold">Risco de evasão</p>
                    <div className="h-2 rounded-full bg-[#E6EEF9]">
                      <div className="h-2 rounded-full bg-[#FF8A65]" style={{ width: `${scoreBar(state.dropoutRiskScore)}%` }} />
                    </div>
                  </div>
                </div>

                <p className="font-semibold">
                  Tendência de frustração: <span className="font-extrabold">{frustrationTrend}</span>
                </p>
                <p className="font-semibold">
                  Indicador de risco: <span className="font-extrabold">{Math.round(dropoutRiskScore * 100)}%</span>
                </p>
                <p className="font-semibold">
                  Regras disparadas: <span className="font-extrabold">{rulesFired.length > 0 ? rulesFired.join(", ") : "Nenhuma"}</span>
                </p>
                <p className="font-semibold">
                  Decisões aplicadas: <span className="font-extrabold">{decisions.length}</span>
                </p>
                <p className="font-semibold">
                  Template escolhido: <span className="font-extrabold">{brief?.debug?.templateChosen ?? "-"}</span>
                </p>
                <p className="font-semibold">
                  Regras avaliadas: <span className="font-extrabold">{evaluatedRules.length}</span>
                </p>
                <p className="font-semibold">
                  Boosts ativos: <span className="font-extrabold">{temporaryBoosts.length}</span>
                </p>
                {frustrationScore > 0.7 ? <p className="rounded-lg bg-[#FFF2EC] px-2 py-1 font-bold text-[#B3563F]">Alerta interno: frustração elevada.</p> : null}
              </div>
            ) : null}
          </section>
        ) : null}
      </section>

      <section className="mt-4 grid gap-3 md:grid-cols-3">
        <article className="rounded-2xl border border-[#C7D8EF] bg-white p-4 shadow-[0_8px_18px_rgba(18,61,109,0.08)]">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#6A86AE]">Seu Cerebro Hoje</p>
          <p className="mt-2 text-sm font-semibold text-[#274A73]">
            Media geral: <span className="font-black">{brainState ? `${Math.round((brainState.averageMastery ?? 0) * 100)}%` : "--"}</span>
          </p>
          <div className="mt-3 space-y-2">
            {insightsLoading ? (
              <p className="text-xs font-semibold text-[#5C789E]">Carregando mapa cognitivo...</p>
            ) : brainState && brainState.subjects.length > 0 ? (
              brainState.subjects.slice(0, 4).map((item) => {
                const pct = Math.max(0, Math.min(100, Math.round((item.masteryScore ?? 0) * 100)));
                const trend = Number(item.trendLast7Days ?? 0);
                const trendLabel = trend > 0 ? `+${trend.toFixed(2)}` : trend.toFixed(2);
                const subjectStatus = getSubjectStatus(Number(item.masteryScore ?? 0));
                return (
                  <div key={item.subject} className="rounded-xl border border-[#DFEAF7] bg-[#F8FBFF] p-2">
                    <div className="mb-1 flex items-center justify-between text-[11px] font-bold text-[#2A456D]">
                      <span className="uppercase">{item.subject}</span>
                      <div className="inline-flex items-center gap-1.5">
                        <span
                          className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-extrabold uppercase ${SUBJECT_STATUS_STYLE[subjectStatus]}`}
                        >
                          {subjectStatus.replace("_", " ")}
                        </span>
                        <span>{trendLabel}</span>
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-[#E6EEF9]">
                      <div className="h-2 rounded-full bg-[#20B3A8]" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-xs font-semibold text-[#5C789E]">Ainda sem dados suficientes de aprendizado.</p>
            )}
          </div>
        </article>

        <article className="rounded-2xl border border-[#C7D8EF] bg-white p-4 shadow-[0_8px_18px_rgba(18,61,109,0.08)]">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#6A86AE]">Novos Desbloqueios</p>
          <div className="mt-3 space-y-2">
            {insightsLoading ? (
              <p className="text-xs font-semibold text-[#5C789E]">Carregando desbloqueios...</p>
            ) : recentUnlocks.length > 0 ? (
              recentUnlocks.slice(0, 4).map((item) => (
                <div key={`${item.contentId}-${item.unlockedAt}`} className="rounded-xl border border-[#DFEAF7] bg-[#F8FBFF] p-2">
                  <p className="text-[11px] font-bold text-[#2A456D]">Conteudo #{item.contentId} - {item.subject}</p>
                  <p className="text-[11px] font-semibold text-[#4E6F97]">{item.reason.replaceAll("_", " ")}</p>
                </div>
              ))
            ) : (
              <p className="text-xs font-semibold text-[#5C789E]">Nenhum desbloqueio recente nesta semana.</p>
            )}
          </div>
        </article>

        <article className="rounded-2xl border border-[#C7D8EF] bg-white p-4 shadow-[0_8px_18px_rgba(18,61,109,0.08)]">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#6A86AE]">Axion Protegendo Voce</p>
          <div className="mt-3 space-y-2 text-sm font-semibold text-[#2A456D]">
            {insightsLoading ? (
              <p className="text-xs font-semibold text-[#5C789E]">Carregando guardrails...</p>
            ) : guardrailsSummary ? (
              <>
                <p>Repeticoes bloqueadas (7d): <span className="font-black">{guardrailsSummary.repeats_blocked_last_7_days}</span></p>
                <p>Bloqueios de seguranca (7d): <span className="font-black">{guardrailsSummary.safety_blocks_last_7_days}</span></p>
                <p>Fallbacks ativados (7d): <span className="font-black">{guardrailsSummary.fallback_activations_last_7_days}</span></p>
              </>
            ) : (
              <p className="text-xs font-semibold text-[#5C789E]">Resumo indisponivel no momento.</p>
            )}
          </div>
        </article>
      </section>

        {coachOpen && brief ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#122949]/45 px-4" onClick={() => setCoachOpen(false)}>
            <div
              className="w-full max-w-sm rounded-[28px] border border-[#BFD3EE] bg-white p-5 shadow-[0_20px_40px_rgba(11,44,79,0.2)]"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <h2 className="text-lg font-extrabold text-[#1B365D]">Coach do Axion</h2>
              <div className="mt-4 space-y-3 text-sm text-[#2C4C76]">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-[#5A7AA4]">Por que estou sugerindo isso?</p>
                  <p className="mt-1 font-semibold">{coachCopy.why}</p>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-[#5A7AA4]">Como isso ajuda voce</p>
                  <p className="mt-1 font-semibold">{coachCopy.how}</p>
                </div>
              </div>
              <button
                className="axiora-chunky-btn axiora-control-btn--teal mt-5 inline-flex w-full items-center justify-center px-4 py-3 text-sm font-extrabold text-white"
                onClick={() => setCoachOpen(false)}
                type="button"
              >
                Entendi
              </button>
            </div>
          </div>
        ) : null}

        <ChildBottomNav />
      </PageShell>
    </ChildDesktopShell>
  );
}
