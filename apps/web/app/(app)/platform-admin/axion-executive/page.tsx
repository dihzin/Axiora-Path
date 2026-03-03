"use client";

import { useEffect, useMemo, useState } from "react";

import {
  ApiError,
  getAdminExecutiveDashboard,
  getAdminExperimentAccess,
  getApiErrorMessage,
  type AxionExecutiveDashboardResponse,
} from "@/lib/api/client";
import { clearTenantSlug, clearTokens, getAccessToken, getTenantSlug } from "@/lib/api/session";

const TENANT_MISMATCH_CODE = "TENANT_SCOPE_MISMATCH";

function pct(value: number): string {
  return `${value.toFixed(2)}%`;
}

function indicatorClass(indicator: "green" | "yellow" | "red"): string {
  if (indicator === "green") return "border-[#C9F0DD] bg-[#EEFBF4] text-[#15784F]";
  if (indicator === "red") return "border-[#F4CCC8] bg-[#FFF2F1] text-[#A93E36]";
  return "border-[#F7E4BC] bg-[#FFF9EC] text-[#A96F17]";
}

export default function PlatformAdminAxionExecutivePage() {
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<number | null>(null);
  const [data, setData] = useState<AxionExecutiveDashboardResponse | null>(null);

  const redirectToLogin = () => {
    clearTokens();
    clearTenantSlug();
    const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
    window.location.assign(`/platform-admin/login?next=${next}`);
  };

  const redirectToForbidden = () => window.location.assign("/403");

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const dashboard = await getAdminExecutiveDashboard();
      setData(dashboard);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        redirectToForbidden();
        return;
      }
      setError(getApiErrorMessage(err, "Não foi possível carregar o dashboard executivo."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const hasAccess = Boolean(getAccessToken());
    const hasTenant = Boolean(getTenantSlug());
    if (!hasAccess && !hasTenant) {
      redirectToLogin();
      return;
    }

    const bootstrap = async () => {
      try {
        const access = await getAdminExperimentAccess();
        if (!access.ok || !Number.isInteger(access.tenantId) || access.tenantId <= 0) {
          throw new Error(TENANT_MISMATCH_CODE);
        }
        if (!getTenantSlug()) throw new Error(TENANT_MISMATCH_CODE);
        setTenantId(access.tenantId);
        setAuthChecked(true);
        await loadDashboard();
      } catch (err) {
        if (err instanceof Error && err.message === TENANT_MISMATCH_CODE) {
          redirectToForbidden();
          return;
        }
        if (err instanceof ApiError && err.status === 401) {
          redirectToLogin();
          return;
        }
        if (err instanceof ApiError && err.status === 403) {
          redirectToForbidden();
          return;
        }
        setError(getApiErrorMessage(err, "Não foi possível validar acesso administrativo."));
        setAuthChecked(true);
      }
    };

    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxCtr = useMemo(() => Math.max(1, ...(data?.weeklyCtr.map((item) => item.ctrPct) ?? [1])), [data]);
  const maxRetention = useMemo(
    () => Math.max(1, ...(data?.weeklyRetention.map((item) => Math.max(item.d1RatePct, item.d7RatePct)) ?? [1])),
    [data],
  );

  if (!authChecked) {
    return (
      <main className="min-h-screen w-full px-4 py-6 md:px-8 xl:px-14">
        <div className="rounded-2xl border border-[#C8D8ED] bg-white p-6 text-sm font-semibold text-[#4E688C]">Validando sessão...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen w-full bg-[radial-gradient(circle_at_top_right,_#EDF4FF_0%,_#F6FAFF_40%,_#FCFDFE_100%)] px-4 py-6 md:px-8 xl:px-14">
      <section className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-3xl border border-[#CADAF0] bg-white/90 p-5 shadow-[0_16px_36px_rgba(16,46,90,0.10)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6C87AD]">Axion Executive</p>
              <h1 className="text-2xl font-black text-[#123D6A] md:text-3xl">Visão Global Multi-Experimento</h1>
              <p className="text-sm font-semibold text-[#5A789F]">Leitura estratégica para operação de produção massiva.</p>
            </div>
            <button
              type="button"
              className="rounded-xl bg-[#1C63C9] px-4 py-2 text-sm font-black text-white shadow-[0_5px_0_rgba(18,66,136,0.35)] disabled:opacity-60"
              onClick={() => void loadDashboard()}
              disabled={loading || tenantId === null}
            >
              {loading ? "Atualizando..." : "Atualizar"}
            </button>
          </div>
        </header>

        {error ? <div className="rounded-2xl border border-[#F0C3BF] bg-[#FFF3F2] p-4 text-sm font-semibold text-[#A53D34]">{error}</div> : null}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          <Card label="Ativos" value={String(data?.activeExperiments ?? 0)} />
          <Card label="Pausados" value={String(data?.pausedExperiments ?? 0)} />
          <Card label="Lift Médio" value={`${(data?.weightedAverageLiftPp ?? 0).toFixed(2)}pp`} />
          <Card label="Retenção D1" value={pct(data?.aggregatedD1RatePct ?? 0)} />
          <Card label="Retenção D7" value={pct(data?.aggregatedD7RatePct ?? 0)} />
          <Card label="Sucesso Exp." value={pct(data?.experimentalSuccessRatePct ?? 0)} />
          <Card label="Rollout Médio" value={pct(data?.averageRolloutPct ?? 0)} />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-2xl border border-[#CFDDF0] bg-white p-4">
            <h2 className="text-sm font-black uppercase tracking-[0.08em] text-[#5A78A0]">Evolução Semanal de Retenção</h2>
            <div className="mt-4 space-y-3">
              {(data?.weeklyRetention ?? []).map((point) => (
                <div key={point.weekStart} className="grid grid-cols-[96px_1fr_1fr] items-center gap-2 text-xs font-semibold text-[#345985]">
                  <span>{new Date(point.weekStart).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
                  <div className="h-2 rounded-full bg-[#E6EEF9]">
                    <div className="h-2 rounded-full bg-[#2B78DB]" style={{ width: `${Math.min(100, (point.d1RatePct / maxRetention) * 100)}%` }} />
                  </div>
                  <div className="h-2 rounded-full bg-[#EAF5EF]">
                    <div className="h-2 rounded-full bg-[#1B9A62]" style={{ width: `${Math.min(100, (point.d7RatePct / maxRetention) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs font-semibold text-[#6A84A8]">Barras: D1 (azul) e D7 (verde).</p>
          </section>

          <section className="rounded-2xl border border-[#CFDDF0] bg-white p-4">
            <h2 className="text-sm font-black uppercase tracking-[0.08em] text-[#5A78A0]">Evolução de CTR</h2>
            <div className="mt-4 space-y-3">
              {(data?.weeklyCtr ?? []).map((point) => (
                <div key={point.weekStart} className="grid grid-cols-[96px_1fr_52px] items-center gap-2 text-xs font-semibold text-[#345985]">
                  <span>{new Date(point.weekStart).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
                  <div className="h-2 rounded-full bg-[#E6EEF9]">
                    <div className="h-2 rounded-full bg-[#F0A238]" style={{ width: `${Math.min(100, (point.ctrPct / maxCtr) * 100)}%` }} />
                  </div>
                  <span className="text-right">{pct(point.ctrPct)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-[#CFDDF0] bg-white p-4">
          <h2 className="text-sm font-black uppercase tracking-[0.08em] text-[#5A78A0]">Experimentos</h2>
          <div className="mt-3 grid gap-2">
            {(data?.experiments ?? []).map((experiment) => (
              <div key={experiment.experimentKey} className="grid grid-cols-1 gap-2 rounded-xl border border-[#E0E9F6] p-3 md:grid-cols-[1.4fr_0.8fr_0.7fr_0.8fr_0.8fr]">
                <p className="text-sm font-black text-[#173F6D]">{experiment.experimentKey}</p>
                <p className="text-sm font-semibold text-[#365D89]">Status: {experiment.status}</p>
                <p className="text-sm font-semibold text-[#365D89]">Lift: {experiment.liftPp.toFixed(2)}pp</p>
                <p className="text-sm font-semibold text-[#365D89]">Rollout: {experiment.rolloutPercent}%</p>
                <span className={`inline-flex items-center justify-center rounded-full border px-2 py-1 text-xs font-black ${indicatorClass(experiment.indicator)}`}>
                  {experiment.indicator === "green" ? "Positivo" : experiment.indicator === "red" ? "Auto-paused" : "Em coleta"}
                </span>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#CBDCF2] bg-white p-4">
      <p className="text-xs font-black uppercase tracking-[0.08em] text-[#6D87AB]">{label}</p>
      <p className="mt-2 text-xl font-black text-[#143B69]">{value}</p>
    </div>
  );
}
