import Link from "next/link";

import { ClientSheetGeneratorTool } from "../_components/client-sheet-generator-tool";
import { ToolsCheckoutRedirect } from "../_components/tools-checkout-redirect";
import { AxioraHeaderLogo } from "@/components/brand/axiora-header-logo";
import { MarketingBackground } from "@/components/marketing-background";

type ToolsDetailPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ upgrade?: string }>;
};

const TOOL_TITLES: Record<string, string> = {
  "gerador-atividades": "Gerador de Exercícios",
  "planner-familiar": "Planner Familiar Inteligente",
  "checkup-aprendizagem": "Checkup de Aprendizagem",
};

const TOOL_DESCRIPTIONS: Record<string, string> = {
  "gerador-atividades":
    "Preencha os campos abaixo e gere sua lista personalizada com gabarito e PDF pronto para imprimir.",
  "planner-familiar":
    "Transforme os objetivos da semana em uma rotina simples para toda a família.",
  "checkup-aprendizagem":
    "Diagnóstico rápido com plano de ação claro para os próximos 7 dias.",
};

export default async function ToolsDetailPage({ params, searchParams }: ToolsDetailPageProps) {
  const { slug } = await params;
  const { upgrade } = await searchParams;
  const isExerciseGenerator = slug === "gerador-atividades";
  const shouldAutoCheckout = isExerciseGenerator && upgrade === "credits_30";
  const title = TOOL_TITLES[slug] ?? "Axiora Tools";
  const description = TOOL_DESCRIPTIONS[slug] ?? "Ferramenta educacional Axiora.";

  return (
    <div className={`relative isolate${isExerciseGenerator ? " flex h-dvh flex-col overflow-hidden" : ""}`}>
      <MarketingBackground priority />

      <nav className="sticky top-0 z-30 border-b border-[rgba(238,135,72,0.14)] bg-[linear-gradient(180deg,rgba(8,20,31,0.72)_0%,rgba(9,24,36,0.62)_100%)] shadow-[0_10px_30px_rgba(4,12,20,0.16)] backdrop-blur-xl">
        <div className="mx-auto flex h-[65px] w-full items-center justify-between gap-3 px-5">
          <div className="flex items-center gap-0">
            <Link href="/tools" className="flex shrink-0 items-center">
              <AxioraHeaderLogo className="w-[168px] sm:w-[196px]" priority />
            </Link>
            <span className="-ml-10 text-sm font-semibold text-white/60 sm:-ml-12">{title}</span>
          </div>
          <div />
        </div>
      </nav>

      <main
        className={`relative z-10 flex w-full flex-col ${
          isExerciseGenerator
            ? "flex-1 overflow-hidden bg-white"
            : "text-white mx-auto max-w-5xl gap-6 px-4 py-8 sm:px-6 sm:py-12"
        }`}
      >
        {isExerciseGenerator ? (
          <>
            {shouldAutoCheckout ? <ToolsCheckoutRedirect planCode="credits_30" /> : null}
            <ClientSheetGeneratorTool />
          </>
        ) : (
          <>
            <header className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#fcd34d]">Axiora Tools</p>
              <h1 className="text-2xl font-extrabold sm:text-3xl md:text-4xl">{title}</h1>
              <p className="text-white/70">{description}</p>
            </header>
            <section className="rounded-2xl border border-white/15 bg-[rgba(255,255,255,0.05)] p-4 backdrop-blur-sm sm:p-6">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(238,135,72,0.25)] bg-[rgba(238,135,72,0.08)] px-3 py-1 text-[11px] font-semibold text-[#fde68a]">
                Em breve
              </span>
              <h2 className="mt-3 text-lg font-bold sm:text-xl">Esta ferramenta está em desenvolvimento</h2>
              <p className="mt-2 text-sm text-white/65">
                Enquanto isso, o Gerador de Exercícios já está funcionando e é gratuito para começar.
              </p>
              <Link
                href="/tools/gerador-atividades"
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] px-4 py-2.5 text-sm font-extrabold text-white shadow-[0_4px_0_rgba(158,74,30,0.45),0_8px_16px_rgba(93,48,22,0.22)] transition hover:brightness-110"
              >
                Usar o Gerador de Exercícios grátis
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
