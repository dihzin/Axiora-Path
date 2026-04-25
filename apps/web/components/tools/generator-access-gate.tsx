"use client";

type Props = {
  onLogin: () => void;
  onSignup: () => void;
};

export function GeneratorAccessGate({ onLogin, onSignup }: Props) {
  return (
    <section className="mx-auto w-full max-w-[760px] py-6 sm:py-8">
      <div className="flex flex-col gap-6">
        <div className="space-y-3 text-center">
          <h1 className="mx-auto max-w-[34ch] text-[22px] font-black leading-[1.25] tracking-[-0.01em] text-white sm:text-[30px]">
            Caso não possua uma conta, primeiramente clique em Criar conta. Se já tiver uma, clique em Entrar, para criação da sua lista.
          </h1>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            "Os 3 créditos grátis ficam vinculados a você.",
            "Os créditos comprados acompanham seu login.",
            "Tentativas de nova conta no mesmo contexto técnico não renovam o trial.",
          ].map((item) => (
            <div
              key={item}
              className="rounded-[20px] border border-white/12 bg-[rgba(255,255,255,0.05)] px-4 py-4 text-[13px] font-semibold leading-6 text-white/85"
            >
              {item}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onLogin}
            className="inline-flex min-w-[164px] cursor-pointer items-center justify-center rounded-[18px] bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] px-5 py-3 text-[14px] font-black text-white shadow-[inset_0_1px_0_rgba(255,219,190,0.24),0_4px_0_rgba(158,74,30,0.45),0_10px_18px_rgba(93,48,22,0.24)] transition hover:brightness-105 active:translate-y-[1px] active:shadow-[inset_0_1px_0_rgba(255,219,190,0.2),0_2px_0_rgba(158,74,30,0.42),0_6px_12px_rgba(93,48,22,0.2)]"
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={onSignup}
            className="inline-flex min-w-[164px] cursor-pointer items-center justify-center rounded-[18px] border border-white/20 bg-[rgba(255,255,255,0.06)] px-5 py-3 text-[14px] font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_4px_0_rgba(71,85,105,0.32),0_10px_18px_rgba(4,12,20,0.2)] transition hover:border-[rgba(252,211,77,0.5)] hover:text-[#fde68a] active:translate-y-[1px] active:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_2px_0_rgba(71,85,105,0.28),0_6px_12px_rgba(4,12,20,0.18)]"
          >
            Criar conta
          </button>
        </div>
      </div>
    </section>
  );
}
