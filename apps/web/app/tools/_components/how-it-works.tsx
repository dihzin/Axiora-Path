const STEPS = [
  {
    number: "01",
    title: "Escolha matéria e tema",
    description:
      "Selecione a disciplina (Matemática, Português, Ciências…) e escreva o tema específico que precisa trabalhar. Ex.: Frações, Pontuação, Fotossíntese.",
  },
  {
    number: "02",
    title: "Configure para o aluno",
    description:
      "Informe a idade e o nível de dificuldade. O gerador adapta o vocabulário, a complexidade e o estilo dos exercícios automaticamente.",
  },
  {
    number: "03",
    title: "Baixe o PDF pronto",
    description:
      "Em menos de 30 segundos você tem uma lista formatada com exercícios, instruções e gabarito — pronta para imprimir ou enviar.",
  },
];

export function HowItWorks() {
  return (
    <section className="mt-20">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#fcd34d]">Como funciona</p>
        <h2 className="mt-3 text-3xl font-extrabold md:text-4xl">Três passos. Trinta segundos.</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-white/70 md:text-base">
          Sem templates engessados. Sem login. Você configura e o material sai pronto.
        </p>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {STEPS.map((step) => (
          <div
            key={step.number}
            className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[rgba(255,255,255,0.05)] p-6 backdrop-blur-sm transition-transform duration-200 hover:-translate-y-1 hover:border-[rgba(238,135,72,0.3)] hover:bg-[rgba(255,255,255,0.08)]"
          >
            <div className="absolute inset-x-0 top-0 h-[2px] rounded-t-2xl bg-[linear-gradient(90deg,#fde68a,#ee8748,transparent)]" aria-hidden="true" />
            <span className="text-5xl font-extrabold leading-none text-[rgba(238,135,72,0.18)] select-none">
              {step.number}
            </span>
            <h3 className="mt-3 text-lg font-bold">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/70">{step.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
