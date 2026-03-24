const STEPS = [
  {
    number: "01",
    title: "Escolha o tema",
    description:
      "Escolha o tópico de matemática: Frações, Equações, Potenciação, Aritmética ou Expressões Numéricas.",
  },
  {
    number: "02",
    title: "Ajuste para o seu aluno",
    description:
      "Informe a idade e o nível de dificuldade. O vocabulário, a complexidade e o estilo dos exercícios são adaptados automaticamente.",
  },
  {
    number: "03",
    title: "Receba o PDF em segundos",
    description:
      "Exercícios, instruções e gabarito formatados — prontos para imprimir ou compartilhar. Sem editar nada, sem montar nada.",
  },
];

export function HowItWorks() {
  return (
    <section className="mt-20">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#fcd34d]">Como funciona</p>
        <h2 className="mt-3 text-3xl font-extrabold md:text-4xl">Três informações. Trinta segundos. Uma lista pronta.</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-white/70 md:text-base">
          Sem templates engessados. Sem cadastro. Você informa e o material sai pronto.
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
