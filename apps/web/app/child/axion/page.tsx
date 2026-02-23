"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Flame, HelpCircle, Sparkles, Target, Zap } from "lucide-react";

import { ChildBottomNav } from "@/components/child-bottom-nav";
import { ChildDesktopShell } from "@/components/child-desktop-shell";
import { PageShell } from "@/components/layout/page-shell";
import { getApiErrorMessage, getAxionBrief, type AxionBriefResponse } from "@/lib/api/client";

type CoachCopy = {
  why: string;
  how: string;
};

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

export default function ChildAxionPage() {
  const router = useRouter();
  const [coachOpen, setCoachOpen] = useState(false);
  const [ctaPending, setCtaPending] = useState(false);
  const [brief, setBrief] = useState<AxionBriefResponse | null>(null);
  const [debugRequested, setDebugRequested] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const debugFlag = new URLSearchParams(window.location.search).get("axionDebug");
    setDebugRequested(debugFlag === "true");
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    getAxionBrief({ context: "child_tab", axionDebug: debugRequested })
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
  }, [debugRequested]);

  const toneBg = useMemo(() => {
    const tone = brief?.tone ?? "ENCOURAGE";
    return TONE_STYLE[tone] ?? TONE_STYLE.ENCOURAGE;
  }, [brief?.tone]);

  const coachCopy = useMemo(() => mapCoachCopy(brief?.cta.actionType ?? ""), [brief?.cta.actionType]);
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

  const handleCta = () => {
    if (!brief) return;
    setCtaPending(true);
    router.push(routeForAction(brief.cta.actionType));
  };

  return (
    <ChildDesktopShell activeNav="axion">
      <PageShell tone="child" width="content" className="pt-4">
        <section className={`rounded-[30px] border border-[#BFD3EE] bg-gradient-to-br p-5 shadow-[0_8px_24px_rgba(32,88,140,0.08)] ${toneBg}`}>
        <div className="mb-4 flex items-center justify-between">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#BFD3EE] bg-white/85 px-3 py-1 text-xs font-bold text-[#2A456D]">
            <Bot className="h-3.5 w-3.5" />
            Axion
          </div>
          <button
            className="inline-flex items-center gap-1 rounded-full border border-[#A8C7EB] bg-white/85 px-3 py-1 text-xs font-bold text-[#2A456D] transition hover:bg-white"
            onClick={() => setCoachOpen(true)}
            type="button"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            Coach
          </button>
        </div>

        <h1 className="text-xl font-extrabold leading-tight text-[#1B365D]">
          {loading ? "Axion esta preparando seu proximo passo..." : brief?.message ?? "Vamos dar o proximo passo?"}
        </h1>

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
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#FF6B3D] px-4 py-3 text-sm font-extrabold text-white shadow-[0_6px_0_rgba(212,85,45,0.35)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={loading || !brief || ctaPending}
          onClick={handleCta}
          type="button"
        >
          <Sparkles className="h-4 w-4" />
          {brief?.cta.label ?? "Carregando sugestao..."}
        </button>
        {error ? <p className="mt-3 text-xs font-semibold text-[#B94A48]">{getApiErrorMessage(error, "Nao foi possivel conectar ao servidor.")}</p> : null}

        {debugVisible ? (
          <section className="mt-4 rounded-2xl border border-[#BFD3EE] bg-white/80 p-3">
            <button
              className="flex w-full items-center justify-between text-left text-xs font-extrabold text-[#24456F]"
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
                className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-[#20B3A8] px-4 py-3 text-sm font-extrabold text-white shadow-[0_6px_0_rgba(14,125,116,0.35)] transition hover:brightness-95"
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
