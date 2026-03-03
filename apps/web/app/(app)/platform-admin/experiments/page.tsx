"use client";

import { useEffect, useMemo, useState } from "react";

import {
  ApiError,
  getAdminExperimentAccess,
  getAdminExperimentDashboard,
  getAdminExperimentRetention,
  getAdminExperimentRetentionMetrics,
  getApiErrorMessage,
  type AxionRetentionMetricsResponse,
} from "@/lib/api/client";
import { clearTenantSlug, clearTokens, getAccessToken, getTenantSlug } from "@/lib/api/session";

type DestinationFilter = "" | "learning" | "games" | "missions" | "other";

type VariantMetricsRow = {
  variant: string;
  exposures: number;
  ctaClickUsers: number;
  ctrPct: number;
  sessionStartRatePct: number;
  completionRatePct: number;
  d1RatePct: number;
  d7RatePct: number;
  rawPValue: number | null;
  adjustedPValue: number | null;
  correctionMethod: string;
  significant: boolean;
  liftPp: number;
};

const EXPERIMENT_KEY = "nba_retention_v1";
const TENANT_MISMATCH_CODE = "TENANT_SCOPE_MISMATCH";

function formatPct(value: number): string {
  return `${value.toFixed(2)}%`;
}

function formatPValue(value: number | null): string {
  if (value === null) return "-";
  return value < 0.0001 ? "<0.0001" : value.toFixed(4);
}

function MetricBar({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: "blue" | "green" | "orange";
}) {
  const width = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const toneClass =
    tone === "green" ? "from-[#1C9C6C] to-[#46C28F]" : tone === "orange" ? "from-[#E98E2A] to-[#F4B248]" : "from-[#2E6FCC] to-[#58A1FF]";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs font-semibold text-[#4B6080]">
        <span>{label}</span>
        <span>{formatPct(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-[#E7EEF8]">
        <div className={`h-2 rounded-full bg-gradient-to-r ${toneClass}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export default function PlatformAdminExperimentsPage() {
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [destination, setDestination] = useState<DestinationFilter>("");
  const [status, setStatus] = useState<"ACTIVE" | "PAUSED" | "AUTO_PAUSED" | string>("ACTIVE");
  const [rows, setRows] = useState<VariantMetricsRow[]>([]);
  const [totals, setTotals] = useState({ exposures: 0, clicks: 0, started: 0, completed: 0 });
  const [scopedTenantId, setScopedTenantId] = useState<number | null>(null);

  const redirectToLogin = () => {
    clearTokens();
    clearTenantSlug();
    const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
    window.location.assign(`/platform-admin/login?next=${next}`);
  };

  const redirectToForbidden = () => {
    window.location.assign("/403");
  };

  const isAuthError = (err: unknown): boolean => err instanceof ApiError && err.status === 401;
  const isForbiddenError = (err: unknown): boolean => err instanceof ApiError && err.status === 403;
  const isTenantMismatchError = (err: unknown): boolean => err instanceof Error && err.message === TENANT_MISMATCH_CODE;

  const loadData = async (expectedTenantId: number) => {
    setLoading(true);
    setError(null);
    try {
      const [dashboard, retention] = await Promise.all([
        getAdminExperimentDashboard(EXPERIMENT_KEY, { destination: destination || undefined, dedupeExposurePerDay: true }),
        getAdminExperimentRetention(EXPERIMENT_KEY),
      ]);
      const variantSet = new Set<string>(dashboard.variants.map((item) => item.variant));
      retention.variants.forEach((item) => variantSet.add(item.variant));
      const variants = Array.from(variantSet).sort();
      const metricsEntries = await Promise.all(
        variants.map(async (variant) => {
          const metrics = await getAdminExperimentRetentionMetrics(EXPERIMENT_KEY, {
            variant,
            destination: destination || undefined,
            dedupeExposurePerDay: true,
            lookbackDays: 30,
          });
          if (metrics.filters?.tenantId !== expectedTenantId) {
            throw new Error(TENANT_MISMATCH_CODE);
          }
          return [variant, metrics] as const;
        }),
      );
      const metricsMap = new Map<string, AxionRetentionMetricsResponse>(metricsEntries);

      const dashboardByVariant = new Map(dashboard.variants.map((item) => [item.variant, item]));
      const retentionByVariant = new Map(retention.variants.map((item) => [item.variant, item]));

      const builtRows = variants.map((variant) => {
        const m = metricsMap.get(variant);
        const d = dashboardByVariant.get(variant);
        const r = retentionByVariant.get(variant);
        const exposures = d?.exposures ?? m?.exposuresTotal ?? 0;
        const ctaClicks = m?.ctaClickUsers ?? 0;
        const ctrPct = exposures > 0 ? (ctaClicks / exposures) * 100 : 0;
        const startRate = m?.ctaToSessionStartedConversion ?? 0;
        const completionRate = m?.ctaToSessionConversion ?? 0;
        return {
          variant,
          exposures,
          ctaClickUsers: ctaClicks,
          ctrPct,
          sessionStartRatePct: startRate,
          completionRatePct: completionRate,
          d1RatePct: r?.d1Rate ?? m?.d1Rate ?? 0,
          d7RatePct: r?.d7Rate ?? m?.d7Rate ?? 0,
          rawPValue: d?.rawPValue ?? null,
          adjustedPValue: d?.adjustedPValue ?? null,
          correctionMethod: d?.correctionMethod ?? "bonferroni",
          significant: d?.significant ?? false,
          liftPp: d?.liftPctPoints ?? 0,
        } satisfies VariantMetricsRow;
      });

      const sum = builtRows.reduce(
        (acc, row) => {
          const variantMetrics = metricsMap.get(row.variant);
          acc.exposures += row.exposures;
          acc.clicks += row.ctaClickUsers;
          acc.started += variantMetrics?.ctaSessionStartedConvertedUsers ?? 0;
          acc.completed += variantMetrics?.ctaSessionConvertedUsers ?? 0;
          return acc;
        },
        { exposures: 0, clicks: 0, started: 0, completed: 0 },
      );

      setRows(builtRows);
      setTotals(sum);
      setStatus(retention.experimentStatus ?? "ACTIVE");
    } catch (err) {
      if (isTenantMismatchError(err)) {
        setError("Escopo inválido para o tenant atual.");
        redirectToForbidden();
        return;
      }
      if (isAuthError(err)) {
        redirectToLogin();
        return;
      }
      if (isForbiddenError(err)) {
        redirectToForbidden();
        return;
      }
      setError(getApiErrorMessage(err, "Não foi possível carregar o dashboard experimental."));
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
      let validatedAccess: { ok: boolean; tenantId: number; userId: number; email: string } | null = null;
      try {
        const access = await getAdminExperimentAccess();
        if (!access.ok || !Number.isInteger(access.tenantId) || access.tenantId <= 0) {
          redirectToForbidden();
          return;
        }
        validatedAccess = access;
        setScopedTenantId(access.tenantId);
        if (!getTenantSlug()) {
          redirectToForbidden();
          return;
        }
      } catch (err) {
        if (isAuthError(err)) {
          redirectToLogin();
          return;
        }
        if (isForbiddenError(err)) {
          redirectToForbidden();
          return;
        }
        setError(getApiErrorMessage(err, "Não foi possível validar acesso administrativo."));
        setAuthChecked(true);
        return;
      }
      if (!validatedAccess) {
        redirectToForbidden();
        return;
      }
      setAuthChecked(true);
      await loadData(validatedAccess.tenantId);
    };

    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxCtr = useMemo(() => Math.max(1, ...rows.map((item) => item.ctrPct)), [rows]);
  const maxStart = useMemo(() => Math.max(1, ...rows.map((item) => item.sessionStartRatePct)), [rows]);
  const maxCompletion = useMemo(() => Math.max(1, ...rows.map((item) => item.completionRatePct)), [rows]);

  if (!authChecked) {
    return (
      <main className="min-h-screen w-full px-4 py-6 md:px-8 xl:px-14">
        <div className="rounded-2xl border border-[#C8D8ED] bg-white p-6 text-sm font-semibold text-[#4E688C]">Validando sessão...</div>
      </main>
    );
  }

  const normalizedStatus = status === "AUTO_PAUSED" ? "PAUSED" : status;
  const statusClass =
    normalizedStatus === "ACTIVE"
      ? "border-[#BFE9D5] bg-[#ECFBF3] text-[#146A47]"
      : "border-[#F5CFCA] bg-[#FFF3F1] text-[#9B3931]";

  return (
    <main className="min-h-screen w-full bg-[radial-gradient(circle_at_top_left,_#E8F1FF_0%,_#F7FAFF_45%,_#FCFDFE_100%)] px-4 py-6 md:px-8 xl:px-14">
      <section className="mx-auto max-w-7xl space-y-5">
        <div className="rounded-3xl border border-[#CCDBEE] bg-white/90 p-5 shadow-[0_14px_36px_rgba(16,48,90,0.10)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#6A86AB]">Experimental Monitor</p>
              <h1 className="text-2xl font-black text-[#15345C] md:text-3xl">NBA Retention v1</h1>
              <p className="text-sm font-semibold text-[#5B769A]">Painel somente leitura para decisão científica.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-black ${statusClass}`}>Status: {normalizedStatus}</span>
              <select
                className="rounded-xl border border-[#C9D8EF] bg-white px-3 py-2 text-sm font-semibold text-[#264B79]"
                value={destination}
                onChange={(e) => setDestination(e.target.value as DestinationFilter)}
                disabled={loading}
              >
                <option value="">Todos destinos</option>
                <option value="learning">Learning</option>
                <option value="games">Games</option>
                <option value="missions">Missions</option>
                <option value="other">Other</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  if (!scopedTenantId) {
                    redirectToForbidden();
                    return;
                  }
                  void loadData(scopedTenantId);
                }}
                disabled={loading}
                className="rounded-xl bg-[#1E63C7] px-4 py-2 text-sm font-black text-white shadow-[0_5px_0_rgba(17,64,132,0.35)] disabled:opacity-60"
              >
                {loading ? "Atualizando..." : "Atualizar"}
              </button>
            </div>
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-[#F0C3BF] bg-[#FFF3F2] p-4 text-sm font-semibold text-[#A53D34]">{error}</div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-[#CBDCF2] bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.08em] text-[#6D87AB]">Exposures</p>
            <p className="mt-2 text-2xl font-black text-[#143B69]">{totals.exposures}</p>
          </div>
          <div className="rounded-2xl border border-[#CBDCF2] bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.08em] text-[#6D87AB]">CTR Geral</p>
            <p className="mt-2 text-2xl font-black text-[#143B69]">
              {totals.exposures > 0 ? formatPct((totals.clicks / totals.exposures) * 100) : "0.00%"}
            </p>
          </div>
          <div className="rounded-2xl border border-[#CBDCF2] bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.08em] text-[#6D87AB]">Start Rate</p>
            <p className="mt-2 text-2xl font-black text-[#143B69]">
              {totals.clicks > 0 ? formatPct((totals.started / totals.clicks) * 100) : "0.00%"}
            </p>
          </div>
          <div className="rounded-2xl border border-[#CBDCF2] bg-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.08em] text-[#6D87AB]">Completion</p>
            <p className="mt-2 text-2xl font-black text-[#143B69]">
              {totals.clicks > 0 ? formatPct((totals.completed / totals.clicks) * 100) : "0.00%"}
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {rows.map((row) => (
            <article
              key={row.variant}
              className={`rounded-2xl border bg-white p-4 shadow-[0_10px_24px_rgba(16,48,90,0.08)] ${
                row.significant ? (row.liftPp >= 0 ? "border-[#8FD8B3]" : "border-[#F0A8A0]") : "border-[#CBDCF2]"
              }`}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-lg font-black text-[#15345C]">{row.variant}</h2>
                {row.significant ? (
                  <span className={`rounded-full px-2 py-1 text-[11px] font-black ${row.liftPp >= 0 ? "bg-[#EAF9F1] text-[#15724B]" : "bg-[#FFF1EF] text-[#A13E35]"}`}>
                    p&lt;0.05 {row.liftPp >= 0 ? "SIG+" : "SIG-"}
                  </span>
                ) : (
                  <span className="rounded-full bg-[#EDF2FA] px-2 py-1 text-[11px] font-black text-[#5D779A]">não sig.</span>
                )}
              </div>
              <p className="mb-3 text-xs font-semibold text-[#637EA1]">Exposures: {row.exposures} | Clicks: {row.ctaClickUsers}</p>
              <div className="space-y-2">
                <MetricBar label="CTR" value={row.ctrPct} max={maxCtr} tone="blue" />
                <MetricBar label="Session Start Rate" value={row.sessionStartRatePct} max={maxStart} tone="green" />
                <MetricBar label="Completion Rate" value={row.completionRatePct} max={maxCompletion} tone="orange" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold text-[#33557E]">
                <div className="rounded-xl bg-[#F2F7FF] px-2 py-2">D1: {formatPct(row.d1RatePct)}</div>
                <div className="rounded-xl bg-[#F2F7FF] px-2 py-2">D7: {formatPct(row.d7RatePct)}</div>
                <div className="rounded-xl bg-[#F2F7FF] px-2 py-2">p-adjusted: {formatPValue(row.adjustedPValue)}</div>
                <div className="rounded-xl bg-[#F2F7FF] px-2 py-2">Lift: {row.liftPp >= 0 ? "+" : ""}{row.liftPp.toFixed(2)}pp</div>
              </div>
              <p className="mt-2 text-[11px] font-semibold text-[#6A86AB]">
                raw: {formatPValue(row.rawPValue)} | method: {row.correctionMethod}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
