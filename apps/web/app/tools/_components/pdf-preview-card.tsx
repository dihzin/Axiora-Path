type StackPreviewItem = {
  n: string;
  layout: "stack";
  left: string;
  right: string;
};

type DivisionPreviewItem = {
  n: string;
  layout: "division";
  dividend: string;
  divisor: string;
};

type FractionPreviewItem = {
  n: string;
  layout: "fraction";
  a: [string, string];
  b: [string, string];
  op?: string;
};

type ExpressionPreviewItem = {
  n: string;
  layout: "expression";
  expr: string;
};

type PreviewItem = StackPreviewItem | DivisionPreviewItem | FractionPreviewItem | ExpressionPreviewItem;

type PreviewSection = {
  title: string;
  items: PreviewItem[];
};

const SECTION_PREVIEW: PreviewSection[] = [
  {
    title: "ARITMÉTICA",
    items: [
      { n: "1)", left: "545", right: "42", layout: "stack" },
      { n: "2)", left: "452", right: "42", layout: "stack" },
      { n: "3)", left: "342", right: "37", layout: "stack" },
      { n: "4)", left: "305", right: "68", layout: "stack" },
    ],
  },
  {
    title: "ARITMÉTICA",
    items: [
      { n: "5)", dividend: "5985", divisor: "63", layout: "division" },
      { n: "6)", dividend: "8626", divisor: "19", layout: "division" },
      { n: "7)", dividend: "2184", divisor: "12", layout: "division" },
      { n: "8)", dividend: "3762", divisor: "66", layout: "division" },
    ],
  },
  {
    title: "FRAÇÕES",
    items: [
      { n: "9)", a: ["2", "5"], b: ["2", "9"], layout: "fraction" },
      { n: "10)", a: ["4", "6"], b: ["5", "6"], layout: "fraction" },
      { n: "11)", a: ["1", "3"], b: ["2", "3"], layout: "fraction" },
      { n: "12)", a: ["1", "5"], b: ["8", "9"], layout: "fraction" },
    ],
  },
  {
    title: "FRAÇÕES",
    items: [
      { n: "13)", a: ["2", "6"], b: ["2", "8"], op: "-", layout: "fraction" },
      { n: "14)", a: ["7", "8"], b: ["1", "2"], op: "-", layout: "fraction" },
      { n: "15)", a: ["5", "10"], b: ["3", "9"], op: "-", layout: "fraction" },
      { n: "16)", a: ["5", "7"], b: ["1", "6"], op: "-", layout: "fraction" },
    ],
  },
  {
    title: "EXPRESSÕES NUMÉRICAS",
    items: [
      { n: "17)", expr: "7 - [ 17 x ( 15 - 19 ) ] =", layout: "expression" },
      { n: "18)", expr: "19 - [ 18 x ( 5 + 18 ) ] =", layout: "expression" },
      { n: "19)", expr: "17 x [ 6 + ( 16 + 10 ) ] =", layout: "expression" },
      { n: "20)", expr: "6 - [ 9 x ( 9 x 2 ) ] =", layout: "expression" },
      { n: "21)", expr: "13 + [ 16 + ( 2 x 7 ) ] =", layout: "expression" },
      { n: "22)", expr: "13 x [ 15 + ( 6 - 15 ) ] =", layout: "expression" },
    ],
  },
];

function Fraction({ top, bottom }: { top: string; bottom: string }) {
  return (
    <span className="inline-flex min-w-[16px] flex-col items-center leading-none text-[#25364d]">
      <span className="border-b border-[#334155] px-1 pb-[1px]">{top}</span>
      <span className="px-1 pt-[1px]">{bottom}</span>
    </span>
  );
}

function StackOperation({ left, right }: { left: string; right: string }) {
  return (
    <div className="inline-flex flex-col items-end font-semibold leading-tight text-[#25364d]">
      <span>{left}</span>
      <span className="flex items-center gap-1">
        <span>x</span>
        <span>{right}</span>
      </span>
      <span className="mt-1 h-px w-7 bg-[#334155]" />
    </div>
  );
}

function DivisionOperation({ dividend, divisor }: { dividend: string; divisor: string }) {
  return (
    <div className="inline-flex items-start font-semibold leading-tight text-[#25364d]">
      <span className="pr-1">{dividend}</span>
      <span className="inline-flex min-h-[16px] min-w-[18px] items-start border-b border-l border-[#334155] pl-1 pt-[1px]">
        {divisor}
      </span>
    </div>
  );
}

export function PdfPreviewCard() {
  return (
    <div className="mx-auto w-full max-w-[470px] sm:max-w-[500px]">
      <div className="w-full overflow-hidden rounded-[26px] border border-[#d8e0ea] bg-white shadow-[0_14px_36px_rgba(15,23,42,0.10)]">
        <div className="bg-white px-4 py-5 font-['Arial',sans-serif] text-[9px] text-[#334155] sm:px-5 sm:py-6">
          <h3 className="text-center text-[13px] font-bold tracking-[0.02em] text-[#25364d]">Folha de Exercícios</h3>

          <div className="mt-2.5 space-y-1.5 text-[7px] font-semibold uppercase tracking-[0.12em] text-[#9aa7b8]">
            <div className="flex items-center gap-2">
              <span className="shrink-0">Nome</span>
              <span className="h-px flex-1 bg-[#c8d3e1]" />
              <span className="shrink-0">Data</span>
              <span className="h-px w-12 bg-[#c8d3e1]" />
              <span className="text-[8px] tracking-normal text-[#b6c1ce]">/</span>
              <span className="h-px w-4 bg-[#c8d3e1]" />
              <span className="text-[8px] tracking-normal text-[#b6c1ce]">/</span>
              <span className="h-px w-4 bg-[#c8d3e1]" />
            </div>
            <div className="flex items-center gap-2">
              <span className="shrink-0">Turma</span>
              <span className="h-px w-12 bg-[#c8d3e1]" />
              <span className="flex-1" />
              <span className="shrink-0">Nota</span>
              <span className="h-px w-7 bg-[#c8d3e1]" />
            </div>
          </div>

          <p className="mt-3 border-t border-[#e8eef5] pt-2.5 text-[8px] font-semibold text-[#697586]">
            Resolva todos os exercícios.
          </p>

          <div className="mt-4 space-y-4">
            {SECTION_PREVIEW.map((section) => (
              <section key={`${section.title}-${section.items[0]?.n ?? "section"}`}>
                <div className="border-t border-[#e8eef5] pt-2.5">
                  <p className="text-[7px] font-bold uppercase tracking-[0.16em] text-[#9aa7b8]">{section.title}</p>
                </div>

                <div
                  className={`mt-2.5 grid gap-y-3 ${section.title === "EXPRESSOES NUMERICAS" ? "grid-cols-2 gap-x-6" : "grid-cols-2 gap-x-10"}`}
                >
                  {section.items.map((item) => (
                    <div key={item.n} className="flex min-h-[28px] items-start gap-2.5">
                      <span className="w-4 shrink-0 text-[9px] font-bold text-[#8f9cae]">{item.n}</span>

                      <div className="pt-[1px] text-[10px]">
                        {item.layout === "stack" ? <StackOperation left={item.left} right={item.right} /> : null}
                        {item.layout === "division" ? (
                          <DivisionOperation dividend={item.dividend} divisor={item.divisor} />
                        ) : null}
                        {item.layout === "fraction" ? (
                          <div className="inline-flex items-center gap-[5px] font-semibold text-[#25364d]">
                            <Fraction top={item.a[0]} bottom={item.a[1]} />
                            <span>{item.op ?? "+"}</span>
                            <Fraction top={item.b[0]} bottom={item.b[1]} />
                            <span>=</span>
                          </div>
                        ) : null}
                        {item.layout === "expression" ? (
                          <span className="font-semibold tracking-[0.01em] text-[#25364d]">{item.expr}</span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className="mt-4 border-t border-[#e8eef5] pt-2 text-center text-[7px] font-semibold text-[#a0acba]">
            Axiora Tools
          </div>
        </div>
      </div>
    </div>
  );
}
