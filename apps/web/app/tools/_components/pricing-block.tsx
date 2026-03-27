import Link from "next/link";
import type { Variant } from "@/lib/ab";
import { BuyPackButton } from "./buy-pack-button";

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4 shrink-0 text-[#ee8748]"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

type PricingBlockProps = { priceVariant?: Variant };

export function PricingBlock({ priceVariant = "a" }: PricingBlockProps) {
  return (
    <section className="mt-20">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#fcd34d]">Quanto custa</p>
        <h2 className="mt-3 text-3xl font-extrabold md:text-4xl">Simples. Sem pegadinha.</h2>
        <p className="mx-auto mt-3 max-w-lg text-sm text-white/70">
          Comece grátis. Se precisar de mais, compre um pacote — pagamento único, sem assinatura, sem renovação automática.
        </p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:max-w-2xl lg:mx-auto">
        {/* Plano gratuito */}
        <div className="flex flex-col rounded-2xl border border-white/12 bg-[rgba(255,255,255,0.05)] p-6 backdrop-blur-sm">
          <p className="text-[0.68rem] font-black uppercase tracking-[0.2em] text-white/45">Grátis</p>
          <p className="mt-2 text-5xl font-black tracking-tight">R$ 0</p>
          <p className="mt-1 text-sm text-white/45">para sempre</p>
          <ul className="mt-5 space-y-2.5 text-sm text-white/80">
            <li className="flex items-center gap-2">
              <CheckIcon />3 listas com gabarito e PDF para começar
            </li>
            <li className="flex items-center gap-2">
              <CheckIcon />
              Sem criar conta
            </li>
            <li className="flex items-center gap-2">
              <CheckIcon />
              Gabarito incluído
            </li>
            <li className="flex items-center gap-2">
              <CheckIcon />
              PDF pronto para imprimir
            </li>
          </ul>
          <div className="mt-auto pt-6">
            <Link
              href="/tools/gerador-atividades"
              className="block w-full rounded-xl border border-white/20 px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-white/10"
            >
              Começar grátis agora
            </Link>
          </div>
        </div>

        {/* Pacote pago */}
        <div className="relative flex flex-col overflow-hidden rounded-2xl border border-[rgba(238,135,72,0.28)] bg-[linear-gradient(180deg,rgba(238,135,72,0.11)_0%,rgba(238,135,72,0.07)_100%)] p-6 shadow-[0_0_0_1px_rgba(238,135,72,0.08),0_20px_44px_rgba(12,21,34,0.28)] backdrop-blur-sm">
          {/* Top accent bar */}
          <div className="absolute inset-x-0 top-0 h-[3px] bg-[linear-gradient(90deg,rgba(253,230,138,0.95),#ee8748,rgba(219,103,40,0.88))]" aria-hidden="true" />
          {/* Inner radial glow */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(circle_at_18%_16%, rgba(255,224,154,0.16), transparent 28%), radial-gradient(circle_at_78%_20%, rgba(238,135,72,0.12), transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
            }}
            aria-hidden="true"
          />
          {/* Badge */}
          <span className="absolute -top-px left-1/2 -translate-x-1/2 rounded-b-xl bg-[linear-gradient(180deg,#ee8748,#db6728)] px-4 py-1 text-[0.68rem] font-extrabold uppercase tracking-[0.12em] text-white shadow-[0_4px_12px_rgba(93,48,22,0.28)]">
            Mais escolhido
          </span>

          <div className="relative pt-3">
            <p className="text-[0.68rem] font-black uppercase tracking-[0.2em] text-[#fcd34d]">Pacote</p>

            {/* Exp 3 — A: preço total | B: custo por lista */}
            {priceVariant === "b" ? (
              <>
                <p className="mt-2 text-5xl font-black tracking-tight">
                  R$&nbsp;0<span className="text-3xl">,97</span>
                </p>
                <p className="mt-1 text-sm text-white/60">por lista · menos que uma xérox</p>
                <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1 text-[11px] text-white/55">
                  Pacote completo: R$ 29 · pagamento único
                </p>
              </>
            ) : (
              <>
                <p className="mt-2 text-5xl font-black tracking-tight">R$ 29</p>
                <p className="mt-1 text-sm text-white/60">pagamento único · 30 listas</p>
              </>
            )}
            <ul className="mt-5 space-y-2.5 text-sm text-white/85">
              <li className="flex items-center gap-2">
                <CheckIcon />
                30 listas (nunca expiram)
              </li>
              <li className="flex items-center gap-2">
                <CheckIcon />
                Sem assinatura mensal
              </li>
              <li className="flex items-center gap-2">
                <CheckIcon />
                Gabarito e PDF em todas
              </li>
              <li className="flex items-center gap-2">
                <CheckIcon />
                Use no seu ritmo, sem prazo
              </li>
            </ul>
            <div className="mt-auto pt-6">
              <BuyPackButton />
            </div>
          </div>
        </div>
      </div>

      <p className="mt-5 text-center text-xs text-white/35">
        Pagamento via Stripe · 100% seguro · Nenhum dado de cartão armazenado
      </p>
    </section>
  );
}
