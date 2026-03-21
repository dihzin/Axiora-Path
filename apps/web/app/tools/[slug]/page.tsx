import Link from "next/link";

import { SheetGeneratorTool } from "@/components/tools/sheet-generator-tool";
import { ArrowLeftIcon } from "../_components/icons";
import { ToolsCheckoutRedirect } from "../_components/tools-checkout-redirect";

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
    <div className={`relative isolate${isExerciseGenerator ? " h-dvh overflow-hidden flex flex-col" : ""}`}>
      {/* ── Background: wallpaper + overlays (igual ao /tools) ─────────────── */}
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-cover bg-[58%_center] bg-no-repeat"
        style={{ backgroundImage: "url('/axiora/auth/wallpaper.jpg')", backgroundColor: "#0b1420" }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(90deg,rgba(6,14,22,0.80)_0%,rgba(10,22,32,0.56)_50%,rgba(10,22,32,0.66)_100%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_14%_20%,rgba(255,224,154,0.20),transparent_30%),radial-gradient(circle_at_82%_16%,rgba(150,234,221,0.12),transparent_28%),radial-gradient(circle_at_50%_100%,rgba(7,20,17,0.45),transparent_50%)]"
        aria-hidden="true"
      />

      {/* ── Nav (igual ao /tools) ─────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-[rgba(6,14,22,0.88)] px-5 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Link href="/tools" className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[linear-gradient(180deg,#ee8748,#db6728)] shadow-[0_2px_0_rgba(158,74,30,0.5)]">
              <span className="text-[0.65rem] font-black text-white">A</span>
            </div>
            <span className="text-sm font-extrabold tracking-tight text-white">
              Axiora <span className="text-[#fcd34d]">Tools</span>
            </span>
          </Link>
          <span className="text-white/20">·</span>
          <span className="text-sm font-semibold text-white/60">{title}</span>
        </div>
        <Link
          href="/tools"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/50 transition hover:text-white/80"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Voltar
        </Link>
      </nav>

      <main className={`relative z-10 flex w-full flex-col text-white ${isExerciseGenerator ? "flex-1 overflow-hidden" : "mx-auto max-w-5xl gap-6 px-4 py-8 sm:px-6 sm:py-12"}`}>
        {isExerciseGenerator ? (
          <>
            {shouldAutoCheckout ? <ToolsCheckoutRedirect planCode="credits_30" /> : null}
            <SheetGeneratorTool />
          </>
        ) : (
          <>
            <header className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#fcd34d]">Axiora Tools</p>
              <h1 className="text-2xl font-extrabold sm:text-3xl md:text-4xl">{title}</h1>
              <p className="text-white/70">{description}</p>
            </header>
            <section className="rounded-2xl border border-white/15 bg-[rgba(255,255,255,0.05)] p-4 backdrop-blur-sm sm:p-6">
              <h2 className="text-lg font-bold sm:text-xl">Acesso antecipado</h2>
              <p className="mt-2 text-sm text-white/75">
                Cadastre-se para ser avisado quando essa ferramenta estiver disponível e receber acesso prioritário.
              </p>
              <Link
                href={`/beta?tool=${encodeURIComponent(slug)}`}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[linear-gradient(180deg,#ee8748_0%,#db6728_100%)] px-4 py-2 text-sm font-bold text-white shadow-[0_4px_0_rgba(158,74,30,0.45)] transition hover:brightness-110"
              >
                Quero acesso antecipado
              </Link>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
