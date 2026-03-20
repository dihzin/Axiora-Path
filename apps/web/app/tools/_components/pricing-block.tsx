import Link from "next/link";
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

export function PricingBlock() {
  return (
    <section className="mt-20">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#fcd34d]">Preço</p>
        <h2 className="mt-3 text-3xl font-extrabold md:text-4xl">Simples. Sem surpresa.</h2>
        <p className="mx-auto mt-3 max-w-lg text-sm text-white/70">
          Comece grátis. Se precisar de mais, compre um pacote — sem assinatura, sem renovação automática.
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
              <CheckIcon />3 gerações por mês
            </li>
            <li className="flex items-center gap-2">
              <CheckIcon />
              Sem cadastro
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
              Começar grátis
            </Link>
          </div>
        </div>

        {/* Pacote pago */}
        <div className="relative flex flex-col overflow-hidden rounded-2xl border border-[rgba(238,135,72,0.55)] bg-[linear-gradient(150deg,rgba(110,48,8,0.72)_0%,rgba(68,28,4,0.80)_100%)] p-6 shadow-[0_0_0_1px_rgba(238,135,72,0.15),0_24px_56px_rgba(93,48,22,0.45),0_0_80px_rgba(238,135,72,0.10)] backdrop-blur-sm">
          {/* Top accent bar */}
          <div className="absolute inset-x-0 top-0 h-[3px] bg-[linear-gradient(90deg,#fde68a,#ee8748,#db6728)]" aria-hidden="true" />
          {/* Inner radial glow */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(253,230,138,0.13),transparent_60%)]" aria-hidden="true" />
          {/* Badge */}
          <span className="absolute -top-px left-1/2 -translate-x-1/2 rounded-b-xl bg-[linear-gradient(180deg,#ee8748,#db6728)] px-4 py-1 text-[0.68rem] font-extrabold uppercase tracking-[0.12em] text-white shadow-[0_4px_12px_rgba(93,48,22,0.4)]">
            Mais popular
          </span>

          <div className="relative pt-3">
            <p className="text-[0.68rem] font-black uppercase tracking-[0.2em] text-[#fcd34d]">Pacote</p>
            <p className="mt-2 text-5xl font-black tracking-tight">R$ 29</p>
            <p className="mt-1 text-sm text-white/60">compra única · 30 gerações</p>
            <ul className="mt-5 space-y-2.5 text-sm text-white/85">
              <li className="flex items-center gap-2">
                <CheckIcon />
                30 gerações (nunca expiram)
              </li>
              <li className="flex items-center gap-2">
                <CheckIcon />
                Sem assinatura mensal
              </li>
              <li className="flex items-center gap-2">
                <CheckIcon />
                Todos os recursos do grátis
              </li>
              <li className="flex items-center gap-2">
                <CheckIcon />
                Use no seu ritmo
              </li>
            </ul>
            <div className="mt-auto pt-6">
              <BuyPackButton />
            </div>
          </div>
        </div>
      </div>

      <p className="mt-5 text-center text-xs text-white/35">
        Pagamento via Stripe · 100% seguro · Sem dados de cartão armazenados
      </p>
    </section>
  );
}
