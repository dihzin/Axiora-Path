export function PdfPreviewCard() {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-[#ddd] bg-white shadow-[0_24px_48px_rgba(0,0,0,0.35),0_0_0_1px_rgba(0,0,0,0.06)] font-mono text-[13px] text-[#111]">

      {/* Brand bar */}
      <div className="flex items-center justify-between border-b border-[#eee] px-6 py-3">
        <span className="font-['Georgia',serif] text-[10px] font-bold uppercase tracking-[2.5px] text-[#ee8748]">
          Axiora Tools
        </span>
        <span className="text-[9.5px] tracking-[0.4px] text-[#bbb]">Material para uso educacional</span>
      </div>

      <div className="px-6 py-5">
        {/* Title */}
        <h3 className="text-center font-['Georgia',serif] text-[18px] font-bold leading-tight tracking-[0.2px] text-[#111]">
          Lista de Exercícios — Matemática (Frações)
        </h3>
        <div className="mt-1.5 h-[2px] bg-[#111]" />
        <div className="mt-[2px] h-[1px] bg-[#111]" />

        {/* Student fields */}
        <div className="mt-3 flex items-baseline text-[12px]">
          <span className="shrink-0">Nome:&nbsp;</span>
          <span className="min-w-[60px] flex-1 border-b border-[#555]">&nbsp;</span>
          <span className="ml-7 shrink-0">
            Data:&nbsp;
            <span className="inline-block min-w-[18px] border-b border-[#555] align-bottom">&nbsp;</span>
            /<span className="inline-block min-w-[18px] border-b border-[#555] align-bottom">&nbsp;</span>
            /<span className="inline-block min-w-[32px] border-b border-[#555] align-bottom">&nbsp;</span>
          </span>
        </div>
        <div className="mt-1 flex items-baseline text-[12px]">
          <span className="shrink-0">Turma:&nbsp;</span>
          <span className="max-w-[160px] flex-1 border-b border-[#555]">&nbsp;</span>
          <span className="flex-1" />
          <span className="ml-7 shrink-0">
            Nota:&nbsp;<span className="inline-block min-w-[52px] border-b border-[#555] align-bottom">&nbsp;</span>
          </span>
        </div>

        {/* Rule gray */}
        <div className="mb-3.5 mt-2 h-[1px] bg-[#bbb]" />

        {/* Instructions */}
        <p className="mb-3.5 border-b border-t border-[#ddd] py-1.5 text-[12px] italic text-[#444]">
          Resolva os itens com atenção. Faixa etária: 9 anos. Dificuldade: Médio.
        </p>

        {/* Section header */}
        <p className="mb-3 border-b border-[#ccc] pb-1 text-[10.5px] font-bold uppercase tracking-[2px] text-[#111]">
          Exercícios
        </p>

        {/* Exercises */}
        <div className="space-y-3.5 text-[13px]">
          {[
            { n: 1, q: "Qual é metade de 3/4? Explique como chegou ao resultado." },
            { n: 2, q: "Complete: 1/3 + 2/3 = ___. O resultado é um número inteiro?" },
            { n: 3, q: "João comeu 2/8 de uma pizza e Maria comeu 3/8. Quem comeu mais? Quanto comeram juntos?" },
            { n: 4, q: "Represente 2/5 na reta numérica e depois escreva em forma decimal." },
          ].map(({ n, q }) => (
            <div key={n} className="flex items-start gap-2">
              <span className="w-6 shrink-0 font-bold">{n}.</span>
              <span className="flex-1">{q}</span>
            </div>
          ))}
        </div>

        {/* Answer key */}
        <div className="mt-5 border border-dashed border-[#aaa] bg-[#f9f8f6] p-3.5">
          <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[2px] text-[#666]">Gabarito</p>
          <div className="space-y-1.5 text-[12px] text-[#333]">
            {[
              { n: 1, a: "3/8" },
              { n: 2, a: "1 (sim, é um inteiro)" },
              { n: 3, a: "Maria comeu mais (3/8 > 2/8). Juntos: 5/8." },
              { n: 4, a: "0,4" },
            ].map(({ n, a }) => (
              <div key={n} className="flex items-start gap-2">
                <span className="w-5 shrink-0 font-bold text-[#888]">{n}.</span>
                <span>{a}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 flex justify-between border-t border-[#ddd] pt-1.5 text-[9.5px] text-[#bbb]">
          <span>Axiora Tools · axiora.com.br</span>
          <span>Reprodução livre para fins pedagógicos</span>
        </div>
      </div>
    </div>
  );
}
