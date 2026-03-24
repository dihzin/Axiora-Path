"use client";

import { useToolsIdentity } from "@/context/tools-identity-context";

/**
 * GenerationStatusBadge
 *
 * Mostra o estado atual de créditos/gerações acima do gerador:
 * - Loading skeleton enquanto `initializing`
 * - Gerações grátis restantes (ex: "2 gerações grátis restantes")
 * - Créditos pagos quando o gratuito acabou
 * - Mensagem de paywall quando não há mais nenhum
 * - Silêncio para usuários autenticados com créditos (a UI do produto já mostra)
 */
export function GenerationStatusBadge() {
  const identity = useToolsIdentity();

  // Skeleton enquanto carrega
  if (identity.initializing) {
    return (
      <div className="flex items-center justify-center">
        <div className="h-6 w-52 animate-pulse rounded-full bg-[#e2e8f0]" />
      </div>
    );
  }

  // Usuário autenticado — badge não é necessário (créditos visíveis na UI do gerador)
  if (!identity.isAnonUser) return null;

  const { freeGenerationsRemaining, paidGenerationsAvailable, paywallRequired } = identity;

  // Sem nenhum crédito — indica paywall
  if (paywallRequired) {
    return (
      <div className="flex items-center justify-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#fecaca] bg-[#fef2f2] px-3 py-1 text-[12px] font-semibold text-[#dc2626]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#dc2626]" />
          Você usou todas as gerações gratuitas
        </span>
      </div>
    );
  }

  // Créditos pagos disponíveis (gratuito já esgotado)
  if (freeGenerationsRemaining === 0 && paidGenerationsAvailable > 0) {
    return (
      <div className="flex items-center justify-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-1 text-[12px] font-semibold text-[#16a34a]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#16a34a]" />
          {paidGenerationsAvailable === 1
            ? "1 crédito pago disponível"
            : `${paidGenerationsAvailable} créditos pagos disponíveis`}
        </span>
      </div>
    );
  }

  // Gerações grátis restantes
  return (
    <div className="flex items-center justify-center">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#fed7aa] bg-[#fff7ed] px-3 py-1 text-[12px] font-semibold text-[#ea580c]">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#ea580c]" />
        {freeGenerationsRemaining === 1
          ? "Última geração gratuita"
          : `${freeGenerationsRemaining} gerações grátis restantes`}
      </span>
    </div>
  );
}
