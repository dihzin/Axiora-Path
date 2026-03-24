/**
 * Sistema de A/B testing por cookie.
 *
 * Cada experimento tem um cookie independente (ax_ab_<id>).
 * O middleware /middleware.ts atribui 'a' ou 'b' na primeira visita.
 * Padrão seguro: se cookie ausente → variante 'a' (controle).
 */

const COOKIE_PREFIX = "ax_ab_";

export type Variant = "a" | "b";

export type ExperimentId =
  | "exp1_headline"   // Headline: Tempo vs Identidade
  | "exp2_cta"        // CTA: Genérico vs Promessa
  | "exp3_price"      // Preço: Total vs Custo unitário
  | "exp4_social"     // Prova social: Posição
  | "exp5_paywall";   // Paywall: Valor vs Perda

export const EXPERIMENT_LABELS: Record<ExperimentId, string> = {
  exp1_headline: "Headline: Tempo vs Identidade",
  exp2_cta:      "CTA: Genérico vs Promessa",
  exp3_price:    "Preço: Total vs Custo unitário",
  exp4_social:   "Prova social: Posição",
  exp5_paywall:  "Paywall: Valor vs Perda",
};

// ── Servidor (Next.js App Router) ───────────────────────────────────────────

/**
 * Lê a variante de um experimento no contexto servidor (Server Component / Route Handler).
 * Deve ser chamada com `await` dentro de uma função `async`.
 */
export async function getVariant(exp: ExperimentId): Promise<Variant> {
  // Import dinâmico para não quebrar cliente
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const value = store.get(`${COOKIE_PREFIX}${exp}`)?.value;
  return value === "b" ? "b" : "a";
}

// ── Cliente (componentes "use client") ──────────────────────────────────────

/**
 * Lê a variante de um experimento a partir de document.cookie.
 * Seguro de chamar durante renderização cliente — retorna 'a' em SSR.
 */
export function getVariantClient(exp: ExperimentId): Variant {
  if (typeof document === "undefined") return "a";
  const match = document.cookie
    .split(";")
    .find((c) => c.trim().startsWith(`${COOKIE_PREFIX}${exp}=`));
  const value = match?.split("=")?.[1]?.trim();
  return value === "b" ? "b" : "a";
}
